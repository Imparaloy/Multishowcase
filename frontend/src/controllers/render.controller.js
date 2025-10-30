// render.controller.js - Controller for rendering post components
import { renderPostPartial } from './explore.controller.js';

/**
 * Render a post component for SSE updates
 */
export const renderPost = async (req, res) => {
  try {
    const { id, name, username, body, media, comments, likes } = req.body;
    
    if (!id || !name || !username) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: id, name, username'
      });
    }

    const postHTML = await renderPostPartial(req, {
      id,
      name,
      username,
      body,
      media: Array.isArray(media) ? media : [],
      comments: comments || 0,
      likes: likes || 0,
      currentUser: req.user || null
    });

    return res.json({
      success: true,
      html: postHTML
    });
  } catch (error) {
    console.error('Error rendering post:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to render post'
    });
  }
};