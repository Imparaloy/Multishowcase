// frontend/src/controllers/posts.controller.js
import pool from '../config/dbconn.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { headObjectExists, publicUrlForKey, getPresignedPutUrl as s3PresignPut, BUCKET } from '../services/s3.service.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function fallbackEmailFromSub(sub) {
  return `user-${sub}@placeholder.local`;
}

async function resolveAuthorId(client, user) {
  if (!user?.sub) {
    throw new Error('Missing Cognito subject on request user');
  }

  const username = user.username || user.email || user.sub;
  const displayName = user.payload?.name || username;
  const email = user.email || fallbackEmailFromSub(user.sub);

  const result = await client.query(
    `INSERT INTO users (cognito_sub, username, display_name, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (cognito_sub) DO UPDATE
     SET username = EXCLUDED.username,
         display_name = EXCLUDED.display_name,
         email = EXCLUDED.email,
         updated_at = now()
     RETURNING user_id`,
    [user.sub, username, displayName, email]
  );

  return result.rows[0].user_id;
}

export const createPost = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const authorId = await resolveAuthorId(client, req.user).catch((err) => {
      throw Object.assign(new Error('Unauthorized: Unable to resolve user'), { cause: err });
    });
    // Parse and validate inputs
    const { title, content, status, category: categoryInput, group_id, mediaFiles } = req.body; // mediaFiles: array of { key, filename, filetype, fileSize }
    const tags = req.body.tags ? req.body.tags.split(',') : [];
    
    const categoryMap = {
      '2d-art': '2D art',
      '3d-model': '3D model',
      'graphic-design': 'Graphic Design',
      'animation': 'Animation',
      'game': 'Game',
      'ux-ui': 'UX/UI design'
    };

    // Determine category
    let category = '2D art';
    if (categoryInput && categoryMap[categoryInput]) {
      category = categoryMap[categoryInput];
    } else if (tags.length > 0 && categoryMap[tags[0]]) {
      category = categoryMap[tags[0]];
    }

    // Validate status and published_at
    const normalizedStatus = (status === 'published' || status === 'unpublish') ? status : 'unpublish';
    const publishedAt = normalizedStatus === 'published' ? new Date() : null;

    // Validate group_id (UUID) or set null
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const groupId = typeof group_id === 'string' && uuidRegex.test(group_id) ? group_id : null;

    // If media files provided, verify they exist in S3 first
    let parsedMediaFiles = [];
    if (mediaFiles && mediaFiles.length > 0) {
      const raw = typeof mediaFiles === 'string' ? JSON.parse(mediaFiles) : mediaFiles;
      parsedMediaFiles = Array.isArray(raw) ? raw : [raw];

      // Determine username for default key construction
      const claims = req.user || {};
      const targetUsername = claims.username || claims['cognito:username'] || claims.email || claims.sub || 'anonymous';

      // Ensure each item has a key; if not, synthesize one to match presign pattern
      parsedMediaFiles = parsedMediaFiles.map((mf) => ({
        ...mf,
        key: mf.key || `users/${targetUsername}/uploads/${Date.now()}_${path.basename(mf.filename || 'file')}`,
      }));

      // Verify S3 objects exist
      const checks = await Promise.all(
        parsedMediaFiles.map((mf) => headObjectExists(mf.key))
      );
      const missing = parsedMediaFiles
        .filter((_, i) => !checks[i])
        .map((mf) => mf.key);

      if (missing.length > 0) {
        // Fail fast and rollback
        throw Object.assign(new Error('Some media files not found in S3'), { missingKeys: missing });
      }
    }

    // Insert post
    const postResult = await client.query(
      `INSERT INTO posts (author_id, title, body, status, published_at, category, group_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING post_id`,
      [authorId, title || null, content || null, normalizedStatus, publishedAt, category, groupId]
    );
    
    const postId = postResult.rows[0].post_id;
    
    // Insert media records (if any)
    if (parsedMediaFiles.length > 0) {
      for (let idx = 0; idx < parsedMediaFiles.length; idx++) {
        const mediaFile = parsedMediaFiles[idx];
        const s3Key = mediaFile.key;
  const s3Url = publicUrlForKey(s3Key);
        await client.query(
          `INSERT INTO post_media (post_id, media_type, order_index, s3_key, s3_url, original_filename, file_size, content_type) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            postId,
            mediaFile.media_type || 'image',
            mediaFile.order_index ?? idx,
            s3Key,
            s3Url,
            mediaFile.filename || null,
            mediaFile.fileSize || null,
            mediaFile.filetype || 'image/jpeg',
          ]
        );
      }
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      postId,
      status: normalizedStatus,
      publishedAt,
      category,
      mediaCount: parsedMediaFiles.length,
      message: 'Post created successfully',
    });
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating post:', err);
    if (err.missingKeys) {
      return res.status(400).json({
        success: false,
        error: 'Some media files were not uploaded to S3',
        missingKeys: err.missingKeys,
      });
    }
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create post',
      details: err.message 
    });
  } finally {
    client.release();
  }
};

export const deletePost = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = await resolveAuthorId(client, req.user).catch((err) => {
      throw Object.assign(new Error('Unauthorized: Unable to resolve user'), { cause: err });
    });
    const userRole = req.user?.groups?.includes('admin') ? 'admin' : 'user';
    
    const postId = req.params.id;
    
    const postResult = await client.query(
      'SELECT author_id FROM posts WHERE post_id = $1',
      [postId]
    );
    
    if (postResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    
    const postAuthorId = postResult.rows[0].author_id;
    
    if (postAuthorId !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden: You can only delete your own posts' });
    }
    
    await client.query('DELETE FROM post_media WHERE post_id = $1', [postId]);
    await client.query('DELETE FROM posts WHERE post_id = $1', [postId]);
    
    await client.query('COMMIT');
    
    res.status(200).json({
      success: true,
      message: 'Post deleted successfully'
    });
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting post:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete post',
      details: err.message
    });
  } finally {
    client.release();
  }
};

export const getPresignedPutUrl = async (req, res) => {
  const filename = req.query.filename;
  const filetype = req.query.filetype;

  if (!filename || !filetype) {
    return res.status(400).json({ error: 'filename and filetype required' });
  }

  const claims = req.user || {};
  console.log('User claims:', claims);
  const targetUsername =
    claims.username ||
    claims['cognito:username']  ||
    claims.email ||
    claims.sub ||
    'anonymous';
  console.log('Presign upload for user:', targetUsername);
  const key = `users/${targetUsername}/uploads/${Date.now()}_${path.basename(filename)}`;

  try {
    const uploadUrl = await s3PresignPut({ key, contentType: filetype, expiresIn: 60 * 5 });
    return res.json({ uploadUrl, key });
  } catch (err) {
    console.error('Failed to create presigned URL:', err);
    return res.status(500).json({ error: 'Failed to create presigned URL' });
  }
};

