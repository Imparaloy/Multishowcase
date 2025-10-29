// frontend/src/controllers/posts.controller.js
import pool from '../config/dbconn.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3, BUCKET } from '../services/aws.js';

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
    
    const { content } = req.body;
    const files = req.files?.images || [];
    const tags = req.body.tags ? req.body.tags.split(',') : [];
    
    const categoryMap = {
      '2d-art': '2D art',
      '3d-model': '3D model',
      'graphic-design': 'Graphic Design',
      'animation': 'Animation',
      'game': 'Game',
      'ux-ui': 'UX/UI design'
    };

    const category = tags.length > 0 ? categoryMap[tags[0]] : '2D art';

    const postResult = await client.query(
      'INSERT INTO posts (author_id, body, category) VALUES ($1, $2, $3) RETURNING post_id',
      [authorId, content, category]
    );
    
    const postId = postResult.rows[0].post_id;
    
    if (files.length) {
      const fileArray = Array.isArray(files) ? files : [files];
      
      for (let idx = 0; idx < fileArray.length; idx++) {
        const file = fileArray[idx];
        const fileName = Date.now() + '-' + file.name;
        const uploadPath = path.join(__dirname, '../../uploads/', fileName);
        
        await new Promise((resolve, reject) => {
          file.mv(uploadPath, (err) => {
            if (err) reject(err);
            resolve();
          });
        });
        
        await client.query(
          'INSERT INTO post_media (post_id, media_type, order_index) VALUES ($1, $2, $3)',
          [postId, 'image', idx]
        );
      }
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      postId,
      message: 'Post created successfully'
    });
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating post:', err);
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

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: filetype,
  });

  try {
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });
    return res.json({ uploadUrl, key });
  } catch (err) {
    console.error('Failed to create presigned URL:', err);
    return res.status(500).json({ error: 'Failed to create presigned URL' });
  }
};
