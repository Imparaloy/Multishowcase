/**
 * Post Synchronization Module
 * Ensures post consistency when navigating between pages
 */
class PostSync {
  constructor() {
    this.eventSource = null;
  }

  /**
   * Initialize the module and connect to SSE endpoint
   */
  connect() {
    console.log('PostSync: Initializing SSE connection');
    
    // Only connect to SSE on pages that might have posts
    const pathsToConnect = ['/', '/explore', '/following', '/profile/', '/groups/'];
    const shouldConnect = pathsToConnect.some(path => window.location.pathname.startsWith(path));
    
    if (!shouldConnect) {
      console.log('PostSync: Not connecting on this page');
      return;
    }

    // Create EventSource connection
    this.eventSource = new EventSource('/api/events');
    
    // Handle connection established
    this.eventSource.addEventListener('connected', (event) => {
      console.log('PostSync: SSE connection established');
    });
    
    // Handle new post events
    this.eventSource.addEventListener('new_post', (event) => {
      const data = JSON.parse(event.data);
      console.log('PostSync: New post received', data);
      
      // Update post count if we're on a profile page
      this.updatePostCount(data.post.author_id, 1);
    });
    
    // Handle post deletion events
    this.eventSource.addEventListener('post_deleted', (event) => {
      const data = JSON.parse(event.data);
      console.log('PostSync: Post deletion received', data);
      
      // Update post count if we're on a profile page
      this.updatePostCount(data.authorId, -1);
    });
    
    // Handle errors
    this.eventSource.onerror = (error) => {
      console.error('PostSync: SSE connection error', error);
      // Try to reconnect after a delay
      setTimeout(() => {
        if (this.eventSource && this.eventSource.readyState === EventSource.CLOSED) {
          this.connect();
        }
      }, 5000);
    };
  }

  /**
   * Update post count on profile pages
   * @param {string} authorId - The ID of the post author
   * @param {number} change - The change in post count (+1 or -1)
   */
  updatePostCount(authorId, change) {
    // Only update if we're on a profile page
    if (!window.location.pathname.startsWith('/profile/')) {
      return;
    }
    
    // Get the current username from the URL
    const username = window.location.pathname.split('/')[2];
    if (!username) return;
    
    // Find the post count element
    const postCountElement = document.querySelector('[data-post-count]');
    if (!postCountElement) return;
    
    // Get the current count and update it
    const currentCount = parseInt(postCountElement.textContent || '0');
    const newCount = Math.max(0, currentCount + change);
    postCountElement.textContent = newCount;
    
    console.log(`PostSync: Updated post count from ${currentCount} to ${newCount}`);
  }

  /**
   * Disconnect the SSE connection
   */
  disconnect() {
    console.log('PostSync: Disconnecting');
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

// Create a global instance
window.postSync = new PostSync();

// Auto-connect when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.postSync.connect();
});

// Clean up when page is unloaded
window.addEventListener('beforeunload', () => {
  if (window.postSync) {
    window.postSync.disconnect();
  }
});