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

async function resolveAuthorId(client, claims) {
  if (!claims?.sub) throw new Error('Missing Cognito subject (sub)');

  const username =
    claims['cognito:username'] ||
    claims.username ||
    `user_${claims.sub.slice(0, 8)}`;

  const email =
    claims.email ||
    `${username}@example.invalid`; // fallback กัน NOT NULL

  const displayName = claims.name || username;

  const { rows } = await client.query(
    `
    INSERT INTO users (cognito_sub, username, email, display_name)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (cognito_sub) DO UPDATE
      SET username = EXCLUDED.username,
          email = COALESCE(EXCLUDED.email, users.email),
          display_name = COALESCE(EXCLUDED.display_name, users.display_name)
    RETURNING user_id
    `,
    [claims.sub, username, email, displayName]
  );
  return rows[0].user_id; // UUID
}


export const createPost = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (!req.user || !req.user.sub) {
      throw new Error('Unauthorized: missing req.user.sub');
    }
    const authorId = await resolveAuthorId(client, req.user);

    const title = (req.body.title || '').trim() || null;
    const content = (req.body.content || '').trim() || null;

    // status → ENUM post_status ('published' | 'unpublish')
    const normalizedStatus =
      req.body.status === 'published' ? 'published' : 'unpublish';
    const publishedAt =
      normalizedStatus === 'published' ? new Date() : null;

    // category → map slug → ENUM post_category (ระวังตัวพิมพ์/ช่องว่าง)
    const categoryMap = {
      '2d-art': '2D art',
      '3d-model': '3D model',
      'graphic-design': 'Graphic Design',
      'animation': 'Animation',
      'game': 'Game',
      'ux-ui': 'UX/UI design'
    };
    const categoryInput = (req.body.category || '').toLowerCase();
    const categoryEnum = categoryMap[categoryInput] || '2D art';

    // group_id → UUID หรือ null
    const groupId = (typeof req.body.group_id === 'string' && /^[0-9a-f-]{36}$/i.test(req.body.group_id))
      ? req.body.group_id
      : null;

    // mediaFiles → array|json string
    let mediaFiles = [];
    if (Array.isArray(req.body.mediaFiles)) {
      mediaFiles = req.body.mediaFiles;
    } else if (typeof req.body.mediaFiles === 'string' && req.body.mediaFiles.trim() !== '') {
      try { mediaFiles = JSON.parse(req.body.mediaFiles); } catch { mediaFiles = []; }
    }

    // (ถ้ามี S3 check) ตรวจ key มีอยู่จริงก่อนบันทึก
    if (mediaFiles.length > 0) {
      const checks = await Promise.all(mediaFiles.map((mf) => headObjectExists(mf.key)));
      const missing = mediaFiles.filter((_, i) => !checks[i]).map((mf) => mf.key);
      if (missing.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Some media files not found in S3', missingKeys: missing });
      }
    }

    // INSERT posts (cast ENUM ให้ชัดเจน)
    const postResult = await client.query(
      `
      INSERT INTO posts (author_id, title, body, status, published_at, category, group_id)
      VALUES ($1, $2, $3, $4::post_status, $5, $6::post_category, $7)
      RETURNING post_id
      `,
      [authorId, title, content, normalizedStatus, publishedAt, categoryEnum, groupId]
    );
    const postId = postResult.rows[0].post_id;

    // INSERT post_media
    if (mediaFiles.length > 0) {
      for (let i = 0; i < mediaFiles.length; i++) {
        const mf = mediaFiles[i];
        const s3Key = mf.key;
        const s3Url = publicUrlForKey(s3Key);
        await client.query(
          `
          INSERT INTO post_media
          (post_id, media_type, order_index, s3_key, s3_url, original_filename, file_size, content_type)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            postId,
            mf.media_type || 'image',
            mf.order_index ?? i,
            s3Key,
            s3Url,
            mf.filename || null,
            mf.fileSize || null,
            mf.filetype || 'image/jpeg'
          ]
        );
      }
    }

    await client.query('COMMIT');
    return res.status(201).json({
      success: true,
      postId,
      status: normalizedStatus,
      publishedAt,
      category: categoryEnum,
      mediaCount: mediaFiles.length,
      message: 'Post created successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating post:', err);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};


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

