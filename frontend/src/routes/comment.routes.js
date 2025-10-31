import express from 'express';
import pool from '../config/dbconn.js';
import { createComment, deleteComment } from '../controllers/comments.controller.js';
import { authenticateCognitoJWT, requireAuth } from '../middlewares/authenticate.js';

const router = express.Router();

function isUuidV4(value = '') {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
    value
  );
}

router.get('/comment', async (req, res) => {
  try {
    const rawId = typeof req.query.id === 'string' ? req.query.id.trim() : null;
    const id = rawId && rawId.length > 0 ? rawId : null;

    if (id && !isUuidV4(id)) {
      return res.status(400).send('Invalid post id');
    }

    // Fetch the requested published post (or the latest published one)
    const postQuery = id
      ? {
          text: `
            SELECT p.post_id, p.title, p.body, p.category, p.created_at, p.published_at,
                   u.username AS author_username, COALESCE(u.display_name, u.username) AS author_display_name,
                   COALESCE(pm.media, '[]'::json) AS media
            FROM posts p
            JOIN users u ON u.user_id = p.author_id
            LEFT JOIN LATERAL (
              SELECT json_agg(
                jsonb_build_object(
                  's3_url', media.s3_url
                ) ORDER BY media.order_index NULLS LAST
              ) AS media
              FROM post_media media
              WHERE media.post_id = p.post_id
            ) pm ON true
            WHERE p.status = 'published'::post_status AND p.post_id = $1
            LIMIT 1
          `,
          values: [id],
        }
      : {
          text: `
            SELECT p.post_id, p.title, p.body, p.category, p.created_at, p.published_at,
                   u.username AS author_username, COALESCE(u.display_name, u.username) AS author_display_name,
                   COALESCE(pm.media, '[]'::json) AS media
            FROM posts p
            JOIN users u ON u.user_id = p.author_id
            LEFT JOIN LATERAL (
              SELECT json_agg(
                jsonb_build_object(
                  's3_url', media.s3_url
                ) ORDER BY media.order_index NULLS LAST
              ) AS media
              FROM post_media media
              WHERE media.post_id = p.post_id
            ) pm ON true
            WHERE p.status = 'published'::post_status
            ORDER BY COALESCE(p.published_at, p.created_at) DESC
            LIMIT 1
          `,
          values: [],
        };

    const postRes = await pool.query(postQuery.text, postQuery.values);
    const row = postRes.rows[0];
    if (!row) return res.status(404).send('Post not found');

    const media = Array.isArray(row.media)
      ? row.media.map(m => (typeof m === 'string' ? m : m?.s3_url)).filter(Boolean)
      : [];

    const post = {
      id: row.post_id,
      name: row.author_display_name,
      username: row.author_username,
      content: row.body,
      media,
      comments: 0,
      likes: 0,
    };

    // Fetch comments for this post (basic version)
    const commentsRes = await pool.query(
      `SELECT c.comment_id, c.post_id, c.content, c.created_at, u.username, COALESCE(u.display_name, u.username) AS display_name
       FROM comments c JOIN users u ON u.user_id = c.user_id
       WHERE c.post_id = $1 ORDER BY c.created_at ASC`,
      [row.post_id]
    );
    const comments = commentsRes.rows.map((c) => ({
      id: c.comment_id,
      parentPostId: c.post_id,
      name: c.display_name,
      username: c.username,
      content: c.content,
      media: [],
      comments: 0,
      likes: 0,
    }));

    res.render('comment', {
      post,
      comments,
      currentUser: res.locals.user || req.user || null,
      activePage: null,
    });
  } catch (err) {
    console.error('Failed to render comment page:', err);
    res.status(500).send('Failed to load post');
  }
});

// POST route for creating a new comment
router.post('/api/comments', authenticateCognitoJWT, requireAuth, createComment);

// DELETE route for deleting a comment
router.delete('/api/comments/:id', authenticateCognitoJWT, requireAuth, deleteComment);

export default router;
