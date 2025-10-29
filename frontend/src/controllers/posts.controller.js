// frontend/src/controllers/posts.controller.js
import pool from '../config/dbconn.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const createPost = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get data from request
    const { content } = req.body;
    const files = req.files?.images || [];
    const tags = req.body.tags ? req.body.tags.split(',') : [];
    
    // ดึง authorId จาก session/auth middleware
    const authorId = req.user?.user_id;
    if (!authorId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No user session' });
    }

    // Map tag slug to actual category name
    const categoryMap = {
      '2d-art': '2D art',
      '3d-model': '3D model',
      'graphic-design': 'Graphic Design',
      'animation': 'Animation',
      'game': 'Game',
      'ux-ui': 'UX/UI design'
    };

    // Get the first tag as category (if available) or default to '2D art'
    const category = tags.length > 0 ? categoryMap[tags[0]] : '2D art';

    // Insert post
    const postResult = await client.query(
      'INSERT INTO posts (author_id, body, category) VALUES ($1, $2, $3) RETURNING post_id',
      [authorId, content, category]
    );
    
    const postId = postResult.rows[0].post_id;
    
    // Handle image uploads if any
    if (files.length) {
      // Ensure it's an array
      const fileArray = Array.isArray(files) ? files : [files];
      
      // Process files sequentially with order_index
      for (let idx = 0; idx < fileArray.length; idx++) {
        const file = fileArray[idx];
        const fileName = Date.now() + '-' + file.name;
        const uploadPath = path.join(__dirname, '../../uploads/', fileName);
        
        // Move file to uploads directory
        await new Promise((resolve, reject) => {
          file.mv(uploadPath, (err) => {
            if (err) reject(err);
            resolve();
          });
        });
        
        // Save file reference to post_media table with order_index
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