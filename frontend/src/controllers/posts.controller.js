// frontend/src/controllers/posts.controller.js
import pool from '../config/dbconn.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { headObjectExists, publicUrlForKey, uploadObject, getPresignedPutUrl as s3PresignPut } from '../services/s3.service.js'
import { broadcastNewPost, broadcastPostDeletion } from './sse.controller.js';

import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function fallbackEmailFromSub(sub) {
  return `user-${sub}@placeholder.local`;
}

function inferMediaType(mime = '') {
  if (typeof mime !== 'string') return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  return 'link';
}

function resolveContentType(meta = {}) {
  if (!meta || typeof meta !== 'object') return null;
  return (
    meta.content_type ||
    meta.filetype ||
    meta.mimeType ||
    meta.mimetype ||
    meta['Content-Type'] ||
    null
  );
}

function normalizeMediaDescriptor(entry = {}) {
  if (!entry || typeof entry !== 'object') return null;

  const normalized = { ...entry };

  if (!normalized.key && typeof normalized.s3_key === 'string') {
    normalized.key = normalized.s3_key;
  } else if (!normalized.s3_key && typeof normalized.key === 'string') {
    normalized.s3_key = normalized.key;
  }

  if (normalized.s3Url && !normalized.s3_url) {
    normalized.s3_url = normalized.s3Url;
  }

  if (!normalized.s3_url && typeof normalized.url === 'string') {
    normalized.s3_url = normalized.url;
  }

  const contentType = resolveContentType(normalized);
  if (!normalized.content_type && contentType) {
    normalized.content_type = contentType;
  }

  const rawType =
    typeof normalized.media_type === 'string'
      ? normalized.media_type
      : typeof normalized.type === 'string'
        ? normalized.type
        : typeof normalized.kind === 'string'
          ? normalized.kind
          : null;

  const lowered = rawType ? rawType.toLowerCase() : null;
  const mediaType = lowered && ['image', 'video', 'link'].includes(lowered)
    ? lowered
    : inferMediaType(contentType || '');

  normalized.media_type = mediaType;

  return normalized;
}

function resolveUploadUsername(user = {}) {
  return (
    user.username ||
    user['cognito:username'] ||
    user.email ||
    user.sub ||
    'anonymous'
  );
}

function normalizeMediaMetadata(input) {
  if (!input) return [];

  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(raw)) {
    raw = [raw];
  }

  return raw
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        try {
          return JSON.parse(entry);
        } catch {
          return null;
        }
      }
      return entry;
    })
    .filter((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      return Boolean(entry.key || entry.s3_key);
    })
    .map((entry) => normalizeMediaDescriptor(entry))
    .filter(Boolean);
}

async function uploadIncomingMedia(files, user) {
  if (!files) return [];

  if (!process.env.S3_BUCKET_NAME || !process.env.AWS_REGION) {
    throw Object.assign(new Error('S3 storage is not configured'), {
      code: 'S3_CONFIG_MISSING'
    });
  }

  const targetUsername = resolveUploadUsername(user);
  const list = Array.isArray(files) ? files : [files];
  const uploads = [];

  for (const file of list) {
    if (!file) continue;
    const baseName = file.name ? path.basename(file.name) : `upload_${Date.now()}`;
    const key = `users/${targetUsername}/uploads/${Date.now()}_${baseName}`;
    const contentType = file.mimetype || 'application/octet-stream';

    await uploadObject({ key, body: file.data, contentType });

    const mediaType = inferMediaType(contentType);
    const publicUrl = publicUrlForKey(key);

    uploads.push({
      key,
      s3_key: key,
      media_type: mediaType,
      filename: file.name || baseName,
      fileSize: file.size,
      filetype: contentType,
      content_type: contentType,
      s3_url: publicUrl
    });
  }

  return uploads;
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

    if (!req.user?.sub) {
      throw new Error('Unauthorized: Missing Cognito subject');
    }

    const authorId = await resolveAuthorId(client, req.user);

    const titleInput = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const contentInput = typeof req.body.content === 'string' ? req.body.content.trim() : '';

    const title = titleInput !== '' ? titleInput : null;
    const content = contentInput !== '' ? contentInput : null;

    const normalizedStatus = req.body.status === 'published' ? 'published' : 'unpublish';
    const publishedAt = normalizedStatus === 'published' ? new Date() : null;

    const categoryMap = {
      '2d-art': '2D art',
      '3d-model': '3D model',
      'graphic-design': 'Graphic Design',
      'animation': 'Animation',
      'game': 'Game',
      'ux-ui': 'UX/UI design'
    };

    const categoryCandidates = [];
    const pushCandidate = (value) => {
      if (typeof value === 'string' && value.trim() !== '') {
        categoryCandidates.push(value.trim().toLowerCase());
      }
    };

    pushCandidate(req.body.category);

    if (typeof req.body.tags === 'string') {
      req.body.tags.split(',').forEach(pushCandidate);
    }

    const arrayTags =
      Array.isArray(req.body.tags) ? req.body.tags :
      Array.isArray(req.body['tags[]']) ? req.body['tags[]'] :
      [];
    arrayTags.forEach(pushCandidate);

    const categorySlug = categoryCandidates.find((slug) => categoryMap[slug]) || '2d-art';
    const categoryEnum = categoryMap[categorySlug] || '2D art';

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const groupId =
      typeof req.body.group_id === 'string' && uuidRegex.test(req.body.group_id)
        ? req.body.group_id
        : null;

    const bodyMediaInput = req.body.mediaFiles ?? req.body['mediaFiles[]'];
    const metadataMedia = normalizeMediaMetadata(bodyMediaInput);

    if (metadataMedia.length > 0) {
      const existenceChecks = await Promise.all(
        metadataMedia.map((mf) => headObjectExists(mf.key))
      );
      const missingKeys = metadataMedia
        .filter((_, idx) => !existenceChecks[idx])
        .map((mf) => mf.key);

      if (missingKeys.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Some media files were not found in S3',
          missingKeys
        });
      }
    }

    const uploadedBatches = [];
    if (req.files?.images) uploadedBatches.push(req.files.images);
    if (req.files?.media) uploadedBatches.push(req.files.media);
    if (req.files?.mediaFiles) uploadedBatches.push(req.files.mediaFiles);

    const uploadedMedia = [];
    for (const batch of uploadedBatches) {
      const media = await uploadIncomingMedia(batch, req.user);
      uploadedMedia.push(...media);
    }

    const combinedMedia = [...metadataMedia, ...uploadedMedia];

    const postResult = await client.query(
      `
      INSERT INTO posts (author_id, title, body, status, published_at, category, group_id)
      VALUES ($1, $2, $3, $4::post_status, $5::timestamp, $6::post_category, $7)
      RETURNING post_id
      `,
      [authorId, title, content, normalizedStatus, publishedAt, categoryEnum, groupId]
    );
    const postId = postResult.rows[0].post_id;

    if (combinedMedia.length > 0) {
      for (let index = 0; index < combinedMedia.length; index++) {
        const media = combinedMedia[index];
        const descriptor = normalizeMediaDescriptor(media);
        if (!descriptor?.key) continue;

        const s3Key = descriptor.key;
        const s3Url = descriptor.s3_url || publicUrlForKey(s3Key);
        const contentType = resolveContentType(descriptor) || 'application/octet-stream';
        const mediaType = descriptor.media_type || inferMediaType(contentType);
        const originalFilename = descriptor.filename || descriptor.original_filename || null;
        const fileSize = descriptor.fileSize ?? descriptor.file_size ?? null;

        await client.query(
          `
          INSERT INTO post_media (post_id, media_type, order_index, s3_key, s3_url, original_filename, file_size, content_type)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            postId,
            mediaType,
            descriptor.order_index ?? index,
            s3Key,
            s3Url,
            originalFilename,
            fileSize,
            contentType
          ]
        );
      }
    }

    await client.query('COMMIT');

    // Get the complete post data for broadcasting
    const { rows: postRows } = await client.query(`
      SELECT
        p.post_id,
        p.title,
        p.body,
        p.category,
        p.status,
        p.published_at,
        p.created_at,
        u.user_id AS author_id,
        u.username AS author_username,
        COALESCE(u.display_name, u.username) AS author_display_name,
        COALESCE(
          json_agg(
            jsonb_build_object(
              'media_id', pm.post_media_id,
              'media_type', pm.media_type,
              'order_index', pm.order_index,
              's3_key', pm.s3_key,
              's3_url', pm.s3_url,
              'filename', pm.original_filename,
              'file_size', pm.file_size,
              'content_type', pm.content_type
            )
            ORDER BY pm.order_index NULLS LAST
          ) FILTER (WHERE pm.post_media_id IS NOT NULL),
          '[]'
        ) AS media
      FROM posts p
      JOIN users u ON u.user_id = p.author_id
      LEFT JOIN post_media pm ON pm.post_id = p.post_id
      WHERE p.post_id = $1
      GROUP BY
        p.post_id, p.title, p.body, p.category, p.status, p.published_at, p.created_at,
        u.user_id, u.username, u.display_name
    `, [postId]);

    if (postRows.length > 0) {
      const newPost = postRows[0];
      // Extract media URLs for broadcasting
      const mediaUrls = [];
      if (Array.isArray(newPost.media)) {
        newPost.media.forEach(m => {
          if (m && m.s3_url) {
            mediaUrls.push(m.s3_url);
          }
        });
      }
      
      // Broadcast the new post to all connected clients
      broadcastNewPost({
        post_id: newPost.post_id,
        title: newPost.title,
        body: newPost.body,
        category: newPost.category,
        author_id: newPost.author_id,
        author_username: newPost.author_username,
        author_display_name: newPost.author_display_name,
        media: mediaUrls,
        published_at: newPost.published_at,
        created_at: newPost.created_at
      });
    }

    // If the post is published, increment the user's post count
    if (normalizedStatus === 'published') {
      try {
        await client.query(
          'UPDATE users SET posts_count = COALESCE(posts_count, 0) + 1 WHERE user_id = $1',
          [authorId]
        );
      } catch (error) {
        console.error('Error updating post count:', error);
        // Don't fail the request if post count update fails
      }
    }

    return res.status(201).json({
      success: true,
      postId,
      status: normalizedStatus,
      publishedAt,
      category: categoryEnum,
      mediaCount: combinedMedia.length,
      message: 'Post created successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating post:', err);
    if (err.missingKeys) {
      return res.status(400).json({
        success: false,
        error: 'Some media files were not uploaded to S3',
        missingKeys: err.missingKeys
      });
    }
    if (err.code === 'S3_CONFIG_MISSING') {
      return res.status(500).json({
        success: false,
        error: 'File uploads are disabled',
        details: 'Missing AWS S3 configuration on the server'
      });
    }
    return res.status(500).json({
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
    
    // Get user info from JWT token directly
    const userSub = req.user?.sub;
    if (!userSub) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing user token' });
    }
    
    // Check if user is admin
    const isAdmin = req.user?.groups?.includes('admin') || false;
    
    const postId = req.params.id;
    
    // Get post info with author details
    const postResult = await client.query(
      `SELECT p.author_id, u.cognito_sub
       FROM posts p
       JOIN users u ON u.user_id = p.author_id
       WHERE p.post_id = $1`,
      [postId]
    );
    
    if (postResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    
    const postAuthorId = postResult.rows[0].author_id;
    const postAuthorSub = postResult.rows[0].cognito_sub;
    
    // Check if user is post owner or admin
    if (postAuthorSub !== userSub && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Forbidden: You can only delete your own posts' });
    }
    
    await client.query('DELETE FROM post_media WHERE post_id = $1', [postId]);
    await client.query('DELETE FROM posts WHERE post_id = $1', [postId]);
    
    await client.query('COMMIT');
    
    // Broadcast the post deletion to all connected clients
    broadcastPostDeletion(postId, postAuthorId);
    
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

export const getLatestPosts = async (req, res) => {
  try {
    const { since } = req.query;
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    
    // Get the current user if authenticated
    const viewerId = req.user?.user_id || null;
    
    // Import getUnifiedFeed from feed.controller
    const { getUnifiedFeed } = await import('./feed.controller.js');
    
    // Get posts since the specified timestamp (or last 5 minutes if not specified)
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 5 * 60 * 1000);
    
    // Get latest posts
    const posts = await getUnifiedFeed({
      limit,
      offset: 0,
      viewerId,
      statuses: viewerId ? ['published', 'unpublish'] : ['published']
    });
    
    // Filter posts created or published since the specified date
    const latestPosts = posts.filter(post => {
      const postDate = new Date(post.published_at || post.created_at);
      return postDate > sinceDate;
    });
    
    return res.json({
      success: true,
      posts: latestPosts,
      count: latestPosts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching latest posts:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch latest posts'
    });
  }
};


