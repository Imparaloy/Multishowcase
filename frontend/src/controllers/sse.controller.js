// sse.controller.js - Server-Sent Events for real-time post synchronization
import { authenticateCognitoJWT } from '../middlewares/authenticate.js';

// Store active SSE connections
const activeConnections = new Set();

/**
 * SSE endpoint for real-time post updates
 */
export const postUpdatesSSE = async (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write('event: connected\ndata: {"type":"connected","message":"SSE connection established"}\n\n');

  // Add connection to active connections
  activeConnections.add(res);

  // Send periodic heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    res.write('event: heartbeat\ndata: {"type":"heartbeat","timestamp":"' + new Date().toISOString() + '"}\n\n');
  }, 30000); // 30 seconds

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    activeConnections.delete(res);
  });

  req.on('aborted', () => {
    clearInterval(heartbeatInterval);
    activeConnections.delete(res);
  });
};

/**
 * Broadcast a new post to all connected clients
 * @param {Object} post - The new post data
 */
export const broadcastNewPost = (post) => {
  const message = {
    type: 'new_post',
    post: post,
    timestamp: new Date().toISOString()
  };

  const eventData = `event: new_post\ndata: ${JSON.stringify(message)}\n\n`;

  activeConnections.forEach(connection => {
    try {
      connection.write(eventData);
    } catch (error) {
      console.error('Error broadcasting to SSE connection:', error);
      // Remove dead connection
      activeConnections.delete(connection);
    }
  });
};

/**
 * Broadcast post deletion to all connected clients
 * @param {string} postId - The ID of the deleted post
 * @param {string} authorId - The ID of the post author (optional)
 */
export const broadcastPostDeletion = (postId, authorId = null) => {
  const message = {
    type: 'post_deleted',
    postId: postId,
    authorId: authorId,
    timestamp: new Date().toISOString()
  };

  const eventData = `event: post_deleted\ndata: ${JSON.stringify(message)}\n\n`;

  activeConnections.forEach(connection => {
    try {
      connection.write(eventData);
    } catch (error) {
      console.error('Error broadcasting to SSE connection:', error);
      // Remove dead connection
      activeConnections.delete(connection);
    }
  });
};

/**
 * Get the number of active SSE connections
 * @returns {number} Number of active connections
 */
export const getActiveConnectionCount = () => {
  return activeConnections.size;
};