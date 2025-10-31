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
    const pathsToConnect = ['/', '/explore', '/following', '/profile', '/groups/', '/comment'];
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
      
      // Check if this is a group post and if we're viewing that group
      if (data.post.group_id) {
        const currentGroupId = this.getCurrentGroupId();
        if (currentGroupId !== data.post.group_id) {
          console.log(`PostSync: Ignoring group post ${data.post.post_id} for group ${data.post.group_id} (currently viewing group ${currentGroupId})`);
          return;
        }
      }
      
      // Update post count if we're on a profile page
      this.updatePostCount(data.post.author_id, 1);
    });
    
    // Handle like events
    this.eventSource.addEventListener('post_liked', (event) => {
      const data = JSON.parse(event.data);
      console.log('PostSync: Post like received', data);
      
      // Update like count for the post
      this.updateLikeCount(data.post_id, data.likes, data.liked);
    });
    
    // Handle comment events
    this.eventSource.addEventListener('new_comment', (event) => {
      const data = JSON.parse(event.data);
      console.log('PostSync: New comment received', data);
      
      // Update comment count for the post
      this.updateCommentCount(data.post_id, data.comments);
    });
    
    // Handle post deletion events
    this.eventSource.addEventListener('post_deleted', (event) => {
      const data = JSON.parse(event.data);
      console.log('PostSync: Post deletion received', data);
      
      // Check if this is a group post and if we're viewing that group
      if (data.groupId) {
        const currentGroupId = this.getCurrentGroupId();
        if (currentGroupId !== data.groupId) {
          console.log(`PostSync: Ignoring group post deletion ${data.postId} for group ${data.groupId} (currently viewing group ${currentGroupId})`);
          return;
        }
      }
      
      // Remove post element from DOM
      this.removePostElement(data.postId);
      
      // Remove the post element from DOM
      this.removePostElement(data.postId);
      
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
   * Remove post element from DOM
   * @param {string} postId - The ID of the post to remove
   */
  removePostElement(postId) {
    // Find the post element by ID
    const postElement = document.querySelector(`[data-post-id="${postId}"]`);
    if (postElement) {
      // Add fade-out animation
      postElement.style.transition = 'all 0.3s ease-out';
      postElement.style.opacity = '0';
      postElement.style.transform = 'scale(0.95)';
      postElement.style.marginBottom = '0';
      postElement.style.padding = '0';
      
      // Remove after animation completes
      setTimeout(() => {
        postElement.style.height = '0';
        postElement.style.overflow = 'hidden';
        
        setTimeout(() => {
          postElement.remove();
          console.log(`PostSync: Removed post ${postId} from DOM`);
        }, 300);
      }, 100);
    }
  }
  /**
   * Update like count for a post
   * @param {string} postId - The ID of the post
   * @param {number} likes - The new like count
   * @param {boolean} liked - Whether the current user liked the post
   */
  updateLikeCount(postId, likes, liked) {
    // Find all like buttons for this post
    const likeButtons = document.querySelectorAll(`button[data-post-id="${postId}"].like-button`);
    
    likeButtons.forEach(button => {
      const likeCountElement = button.querySelector('span');
      const heartIcon = button.querySelector('[data-feather="heart"]');
      
      // Update like count
      if (likeCountElement) {
        likeCountElement.textContent = likes;
      }
      
      // Update heart icon color
      if (heartIcon) {
        if (liked) {
          heartIcon.classList.add('text-red-500', 'fill-current');
        } else {
          heartIcon.classList.remove('text-red-500', 'fill-current');
        }
      }
    });
  }

  /**
   * Update comment count for a post
   * @param {string} postId - The ID of the post
   * @param {number} comments - The new comment count
   */
  updateCommentCount(postId, comments) {
    // Find all comment buttons for this post
    const commentButtons = document.querySelectorAll(`button[data-post-id="${postId}"].comment-button`);
    
    commentButtons.forEach(button => {
      const commentCountElement = button.querySelector('span');
      
      // Update comment count
      if (commentCountElement) {
        commentCountElement.textContent = comments;
      }
    });
  }
  /**
   * Get current group ID from URL
   * @returns {string|null} The current group ID or null if not on a group page
   */
  getCurrentGroupId() {
    const pathname = window.location.pathname;
    
    // Check if we're on a group details page
    if (pathname.startsWith('/groups/')) {
      const parts = pathname.split('/');
      // URL format: /groups/{groupId}
      if (parts.length >= 3) {
        return parts[2];
      }
    }
    
    return null;
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