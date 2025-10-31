// sse.controller.js - Server-Sent Events for real-time post synchronization
import { authenticateCognitoJWT } from '../middlewares/authenticate.js';

// Store active SSE connections with context
const activeConnections = new Map(); // Changed to Map to store connection context

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

  // Add connection to active connections with context
  const connectionId = Date.now() + Math.random(); // Simple unique ID
  activeConnections.set(connectionId, {
    response: res,
    userId: req.user?.user_id || null,
    currentGroupId: null // Will be set when viewing a group
  });

  // Send periodic heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    res.write('event: heartbeat\ndata: {"type":"heartbeat","timestamp":"' + new Date().toISOString() + '"}\n\n');
  }, 30000); // 30 seconds

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    // Find and remove connection by response object
    for (const [id, conn] of activeConnections.entries()) {
      if (conn.response === res) {
        activeConnections.delete(id);
        break;
      }
    }
  });

  req.on('aborted', () => {
    clearInterval(heartbeatInterval);
    // Find and remove connection by response object
    for (const [id, conn] of activeConnections.entries()) {
      if (conn.response === res) {
        activeConnections.delete(id);
        break;
      }
    }
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

  activeConnections.forEach((connection, connectionId) => {
    try {
      // If post has a group_id, only send to connections viewing that group
      if (post.group_id) {
        // Only send to users who are members of the group or viewing the group
        // For now, we'll only send to connections explicitly viewing the group
        if (connection.currentGroupId === post.group_id) {
          connection.response.write(eventData);
        }
      } else {
        // Send non-group posts to all connections
        connection.response.write(eventData);
      }
    } catch (error) {
      console.error('Error broadcasting to SSE connection:', error);
      // Remove dead connection
      activeConnections.delete(connectionId);
    }
  });
};

/**
 * Broadcast post deletion to all connected clients
 * @param {string} postId - The ID of the deleted post
 * @param {string} authorId - The ID of the post author (optional)
 */
export const broadcastPostDeletion = (postId, authorId = null, groupId = null) => {
  const message = {
    type: 'post_deleted',
    postId: postId,
    authorId: authorId,
    groupId: groupId,
    timestamp: new Date().toISOString()
  };

  const eventData = `event: post_deleted\ndata: ${JSON.stringify(message)}\n\n`;

  activeConnections.forEach((connection, connectionId) => {
    try {
      // If post has a group_id, only send to connections viewing that group
      if (groupId) {
        if (connection.currentGroupId === groupId) {
          connection.response.write(eventData);
        }
      } else {
        // Send non-group post deletions to all connections
        connection.response.write(eventData);
      }
    } catch (error) {
      console.error('Error broadcasting to SSE connection:', error);
      // Remove dead connection
      activeConnections.delete(connectionId);
    }
  });
};

/**
 * Broadcast like event to all connected clients
 * @param {Object} data - The like event data
 */
export const broadcastLikeEvent = (data) => {
  const eventData = JSON.stringify(data);
  
  activeConnections.forEach(connection => {
    try {
      connection.response?.write(`event: post_liked\ndata: ${eventData}\n\n`);
    } catch (error) {
      console.error('Error broadcasting like event:', error);
    }
  });
};

/**
 * Broadcast comment event to all connected clients
 * @param {Object} data - The comment event data
 */
export const broadcastCommentEvent = (data) => {
  const eventData = JSON.stringify(data);
  
  activeConnections.forEach(connection => {
    try {
      connection.response?.write(`event: new_comment\ndata: ${eventData}\n\n`);
    } catch (error) {
      console.error('Error broadcasting comment event:', error);
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

/**
 * Update the current group context for a connection
 * @param {Object} req - The request object
 * @param {string} groupId - The group ID being viewed
 */
export const updateConnectionGroupContext = (req, groupId) => {
  // Find the connection for this request
  for (const [id, conn] of activeConnections.entries()) {
    // This is a simple way to match the connection - in a real implementation,
    // you might want to store the connection ID in the session or use a more robust method
    if (conn.userId === req.user?.user_id) {
      conn.currentGroupId = groupId;
      break;
    }
  }
};
