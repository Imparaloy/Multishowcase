import pool from '../config/dbconn.js';

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

export const createComment = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (!req.user?.sub) {
      throw new Error('Unauthorized: Missing Cognito subject');
    }

    const authorId = await resolveAuthorId(client, req.user);
    const postId = req.body.post_id;
    const content = req.body.content?.trim();

    if (!postId) {
      return res.status(400).json({
        success: false,
        error: 'Post ID is required'
      });
    }

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Comment content is required'
      });
    }

    // Check if the post exists
    const postResult = await client.query(
      'SELECT post_id FROM posts WHERE post_id = $1',
      [postId]
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    // Create the comment
    const commentResult = await client.query(
      `
      INSERT INTO comments (post_id, author_id, body)
      VALUES ($1, $2, $3)
      RETURNING comment_id, created_at
      `,
      [postId, authorId, content]
    );

    const newComment = commentResult.rows[0];

    await client.query('COMMIT');

    // Get the complete comment data with author info
    const { rows: commentData } = await client.query(
      `
      SELECT 
        c.comment_id, 
        c.body, 
        c.created_at, 
        u.username, 
        COALESCE(u.display_name, u.username) AS display_name
      FROM comments c 
      JOIN users u ON u.user_id = c.author_id
      WHERE c.comment_id = $1
      `,
      [newComment.comment_id]
    );

    if (commentData.length > 0) {
      const comment = commentData[0];
      return res.status(201).json({
        success: true,
        comment: {
          id: comment.comment_id,
          name: comment.display_name,
          username: comment.username,
          content: comment.body,
          media: [],
          comments: 0,
          likes: 0,
          createdAt: comment.created_at
        }
      });
    } else {
      throw new Error('Failed to retrieve created comment');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating comment:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to create comment',
      details: err.message
    });
  } finally {
    client.release();
  }
};

export const deleteComment = async (req, res) => {
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
    
    const commentId = req.params.id;
    
    // Get comment info with author details
    const commentResult = await client.query(
      `SELECT c.author_id, u.cognito_sub
       FROM comments c
       JOIN users u ON u.user_id = c.author_id
       WHERE c.comment_id = $1`,
      [commentId]
    );
    
    if (commentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }
    
    const commentAuthorId = commentResult.rows[0].author_id;
    const commentAuthorSub = commentResult.rows[0].cognito_sub;
    
    // Check if user is comment owner or admin
    if (commentAuthorSub !== userSub && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Forbidden: You can only delete your own comments' });
    }
    
    await client.query('DELETE FROM comments WHERE comment_id = $1', [commentId]);
    
    await client.query('COMMIT');
    
    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully'
    });
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting comment:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete comment',
      details: err.message
    });
  } finally {
    client.release();
  }
};