/**
 * Post Synchronization Module
 * Handles real-time post updates using Server-Sent Events (SSE)
 */
class PostSync {
  constructor() {
    this.eventSource = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.isConnected = false;
    this.heartbeatInterval = null;
  }

  /**
   * Initialize the SSE connection
   */
  connect() {
    if (this.eventSource) {
      this.disconnect();
    }

    try {
      this.eventSource = new EventSource('/api/events');
      this.setupEventListeners();
      this.startHeartbeatCheck();
      console.log('PostSync: Connecting to SSE endpoint...');
    } catch (error) {
      console.error('PostSync: Failed to create EventSource:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Set up event listeners for the SSE connection
   */
  setupEventListeners() {
    if (!this.eventSource) return;

    this.eventSource.addEventListener('connected', (event) => {
      console.log('PostSync: Connected to SSE endpoint');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
    });

    this.eventSource.addEventListener('new_post', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('PostSync: New post received', data);
        this.handleNewPost(data.post);
      } catch (error) {
        console.error('PostSync: Error parsing new_post event:', error);
      }
    });

    this.eventSource.addEventListener('post_deleted', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('PostSync: Post deletion received', data);
        this.handlePostDeletion(data.postId);
      } catch (error) {
        console.error('PostSync: Error parsing post_deleted event:', error);
      }
    });

    this.eventSource.addEventListener('heartbeat', (event) => {
      // Heartbeat received, connection is still alive
      console.log('PostSync: Heartbeat received');
    });

    this.eventSource.onerror = (error) => {
      console.error('PostSync: SSE connection error:', error);
      this.isConnected = false;
      this.scheduleReconnect();
    };
  }

  /**
   * Handle a new post event
   * @param {Object} post - The new post data
   */
  handleNewPost(post) {
    // Don't add the post if it already exists on the page
    if (document.querySelector(`[data-post-id="${post.post_id}"]`)) {
      console.log('PostSync: Post already exists on page, skipping');
      return;
    }

    // Create the post HTML
    this.createPostElement(post).then(postHTML => {
      if (postHTML) {
        this.insertPostIntoFeed(postHTML);
        this.showNotification('New post available!', 'info');
      }
    });
  }

  /**
   * Handle a post deletion event
   * @param {string} postId - The ID of the deleted post
   */
  handlePostDeletion(postId) {
    const postElement = document.querySelector(`[data-post-id="${postId}"]`);
    if (postElement) {
      // Animate removal
      postElement.style.transition = 'all 0.3s ease-out';
      postElement.style.opacity = '0';
      postElement.style.transform = 'scale(0.95)';
      postElement.style.marginBottom = '0';
      postElement.style.padding = '0';
      
      setTimeout(() => {
        postElement.style.height = '0';
        postElement.style.overflow = 'hidden';
        
        setTimeout(() => {
          postElement.remove();
          this.showNotification('Post removed', 'info');
        }, 300);
      }, 100);
    }
  }

  /**
   * Create a post element from the post data
   * @param {Object} post - The post data
   * @returns {Promise<string>} The post HTML
   */
  async createPostElement(post) {
    try {
      const response = await fetch('/api/render-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: post.post_id,
          name: post.author_display_name,
          username: post.author_username,
          body: post.body,
          media: post.media || [],
          comments: 0,
          likes: 0
        })
      });

      if (!response.ok) {
        throw new Error('Failed to render post');
      }

      const data = await response.json();
      return data.html;
    } catch (error) {
      console.error('PostSync: Error creating post element:', error);
      return null;
    }
  }

  /**
   * Insert the new post into the feed
   * @param {string} postHTML - The post HTML to insert
   */
  insertPostIntoFeed(postHTML) {
    // Find the feed container based on the current page
    let feedContainer = null;
    
    // Check for different page types
    if (window.location.pathname === '/' || window.location.pathname.startsWith('/following')) {
      // Home page
      feedContainer = document.querySelector('.p-4.space-y-4');
    } else if (window.location.pathname === '/explore') {
      // Explore page
      feedContainer = document.getElementById('explore-feed');
    } else if (window.location.pathname.startsWith('/profile/')) {
      // Profile page
      feedContainer = document.querySelector('.p-4.space-y-4');
    } else if (window.location.pathname.startsWith('/groups/')) {
      // Group details page
      feedContainer = document.getElementById('postsList');
    }

    if (feedContainer) {
      // Insert at the beginning of the feed
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = postHTML;
      const newPostElement = tempDiv.firstElementChild;
      
      // Add animation
      newPostElement.style.opacity = '0';
      newPostElement.style.transform = 'translateY(-20px)';
      
      feedContainer.insertBefore(newPostElement, feedContainer.firstChild);
      
      // Animate in
      setTimeout(() => {
        newPostElement.style.transition = 'all 0.5s ease-out';
        newPostElement.style.opacity = '1';
        newPostElement.style.transform = 'translateY(0)';
      }, 100);
      
      // Re-initialize feather icons for the new post
      if (window.feather && typeof window.feather.replace === 'function') {
        window.feather.replace();
      }
    } else {
      console.warn('PostSync: Could not find feed container to insert post');
    }
  }

  /**
   * Show a notification message
   * @param {string} message - The message to display
   * @param {string} type - The type of notification (success, error, info)
   */
  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transform transition-all duration-300 translate-x-full`;
    
    // Set color based on type
    const colors = {
      success: 'bg-green-600 text-white',
      error: 'bg-red-600 text-white',
      info: 'bg-blue-600 text-white'
    };
    
    notification.className += ` ${colors[type] || colors.info}`;
    notification.textContent = message;
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.classList.remove('translate-x-full');
      notification.classList.add('translate-x-0');
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.add('translate-x-full');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  /**
   * Schedule a reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('PostSync: Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`PostSync: Scheduling reconnection attempt ${this.reconnectAttempts} in ${this.reconnectDelay}ms`);
    
    setTimeout(() => {
      this.connect();
      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    }, this.reconnectDelay);
  }

  /**
   * Start heartbeat check to monitor connection health
   */
  startHeartbeatCheck() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    let lastHeartbeat = Date.now();
    
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      // If no heartbeat for 90 seconds, consider connection dead
      if (now - lastHeartbeat > 90000) {
        console.warn('PostSync: Connection appears dead, reconnecting...');
        this.isConnected = false;
        this.disconnect();
        this.scheduleReconnect();
      }
    }, 30000); // Check every 30 seconds

    // Update last heartbeat time when heartbeat is received
    this.eventSource.addEventListener('heartbeat', () => {
      lastHeartbeat = Date.now();
    });
  }

  /**
   * Disconnect the SSE connection
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    this.isConnected = false;
    console.log('PostSync: Disconnected from SSE endpoint');
  }
}

// Create a global instance
window.postSync = new PostSync();

// Auto-connect when the page loads
document.addEventListener('DOMContentLoaded', () => {
  // Only connect on pages that might have posts
  const pathsToConnect = ['/', '/explore', '/following', '/profile/', '/groups/'];
  const shouldConnect = pathsToConnect.some(path => window.location.pathname.startsWith(path));
  
  if (shouldConnect) {
    window.postSync.connect();
  }
});

// Clean up when page is unloaded
window.addEventListener('beforeunload', () => {
  if (window.postSync) {
    window.postSync.disconnect();
  }
});