import {
  AdminDeleteUserCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient } from "../services/cognito.service.js";
import pool from "../config/dbconn.js";
import { getUnifiedFeed } from "./feed.controller.js";
import {
  buildViewUser,
  loadCurrentUser,
  ensureUserRecord,
} from "../utils/session-user.js";

// Helper function to get user statistics
async function getUserStats(userId, isOwnProfile = false) {
  try {
    const client = await pool.connect();
    
    // Get posts count - for own profile, count all posts (published and unpublished)
    // For other profiles, only count published posts
    const postsResult = await client.query(
      isOwnProfile
        ? 'SELECT COUNT(*) as count FROM posts WHERE author_id = $1'
        : 'SELECT COUNT(*) as count FROM posts WHERE author_id = $1 AND status = $2',
      isOwnProfile ? [userId] : [userId, 'published']
    );
    const postsCount = parseInt(postsResult.rows[0]?.count || 0);
    
    // Get followers count
    const followersResult = await client.query(
      'SELECT COUNT(*) as count FROM follows WHERE following_id = $1',
      [userId]
    );
    const followersCount = parseInt(followersResult.rows[0].count);
    
    // Get following count
    const followingResult = await client.query(
      'SELECT COUNT(*) as count FROM follows WHERE follower_id = $1',
      [userId]
    );
    const followingCount = parseInt(followingResult.rows[0].count);
    
    client.release();
    
    return { postsCount, followersCount, followingCount };
  } catch (error) {
    console.error("Error getting user stats:", error);
    return { postsCount: 0, followersCount: 0, followingCount: 0 };
  }
}

// Helper function to check if user is following another user
async function isFollowing(followerId, followingId) {
  if (!followerId || !followingId) return false;
  
  try {
    const client = await pool.connect();
    const result = await client.query(
      'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );
    client.release();
    return result.rows.length > 0;
  } catch (error) {
    console.error("Error checking follow status:", error);
    return false;
  }
}

// Helper function to get user by username
async function getUserByUsername(username) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return rows[0] || null;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

// Helper function to format post data
function formatPost(post, userRecord) {
  const primaryMedia = post.media && post.media.length ? post.media[0] : null;
  const body = post.body || "";

  return {
    id: post.post_id,
    post_id: post.post_id,
    name: post.author_display_name || userRecord.display_name || userRecord.username,
    username: post.author_username || userRecord.username,
    author_display_name: post.author_display_name || userRecord.display_name || userRecord.username,
    author_username: post.author_username || userRecord.username,
    title: post.title || "",
    body,
    content: body,
    media: post.media || [],
    primaryMedia,
    status: post.status,
    createdAt: post.created_at,
    comments: post.comments || 0,
    likes: post.likes || 0,
    isFollowing: post.isFollowing || false
  };
}

// Main profile page renderer
export async function renderProfilePage(req, res) {
  const profileUsername = req.params.username;
  const currentUser = req.user;
  let client;
  
  try {
    client = await pool.connect();
    
    // Get current user record
    const userRecord = currentUser?.sub 
      ? await ensureUserRecord(req.user, { client })
      : null;
    
    // Determine which profile to show
    let profileUser;
    let isOwnProfile = false;
    
    if (profileUsername) {
      // Viewing someone's profile
      profileUser = await getUserByUsername(profileUsername);
      if (!profileUser) {
        return res.status(404).send("User not found");
      }
      isOwnProfile = userRecord && userRecord.username === profileUsername;
    } else if (userRecord) {
      // Viewing own profile
      profileUser = userRecord;
      isOwnProfile = true;
    } else {
      return res.status(401).send("Please log in to view profiles");
    }
    
    // Get user's posts
    // For own profile, show both published and unpublished posts
    // For other users' profiles, only show published posts
    const statuses = isOwnProfile ? ['published', 'unpublish'] : ['published'];
    
    const feedData = await getUnifiedFeed({
      authorId: profileUser.user_id,
      statuses,
      viewerId: userRecord?.user_id,
      limit: 50 // Increase limit to show more posts on profile
    });
    
    const feed = feedData.map(post => formatPost(post, profileUser));
    
    // Get user statistics
    const stats = await getUserStats(profileUser.user_id, isOwnProfile);
    
    // Check follow status (only if not viewing own profile)
    let isFollowingUser = false;
    if (!isOwnProfile && userRecord) {
      isFollowingUser = await isFollowing(userRecord.user_id, profileUser.user_id);
    }
    
    // Prepare profile data
    const profileData = {
      name: profileUser.display_name || profileUser.username,
      username: profileUser.username,
      email: profileUser.email || "",
      avatar_url: profileUser.avatar_url || "",
      created_at: profileUser.created_at,
      stats
    };
    
    // Determine which template to use
    const template = isOwnProfile ? "profile" : "user-profile";
    
    // Render the appropriate template
    res.render(template, {
      me: profileData,
      currentUser: buildViewUser(req, userRecord).viewer,
      activePage: "profile",
      feed,
      isFollowing: isFollowingUser
    });
    
  } catch (error) {
    console.error("Error rendering profile page:", error);
    res.status(500).send("Failed to load profile");
  } finally {
    if (client) client.release();
  }
}

export async function renderProfileEditPage(req, res) {
  const currentUser = await loadCurrentUser(req, { res });
  
  if (!currentUser?.user_id && !currentUser?.cognito_sub) {
    return res.status(401).send("User not authenticated");
  }
  
  const { me, viewer } = buildViewUser(req, currentUser);
  res.render("edit-profile", {
    me,
    currentUser: viewer,
    activePage: "profile",
  });
}

export async function updateProfile(req, res) {
  const { displayName, username, email } = req.body;
  const currentUser = await loadCurrentUser(req, { res });
  
  if (!currentUser?.user_id && !currentUser?.cognito_sub) {
    return res.status(401).json({
      ok: false,
      message: "User not authenticated"
    });
  }

  const safeTrim = (value) => (typeof value === "string" ? value.trim() : undefined);
  const trimmedDisplayName = safeTrim(displayName);
  const trimmedUsername = safeTrim(username);
  const trimmedEmail = safeTrim(email);

  // Validation
  if (trimmedDisplayName && trimmedDisplayName.length > 100) {
    return res.status(400).json({
      ok: false,
      message: "Display name must be 100 characters or less"
    });
  }
  
  if (trimmedUsername) {
    if (trimmedUsername.length > 50) {
      return res.status(400).json({
        ok: false,
        message: "Username must be 50 characters or less"
      });
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      return res.status(400).json({
        ok: false,
        message: "Username can only contain letters, numbers, and underscores"
      });
    }
  }
  
  if (trimmedEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        ok: false,
        message: "Please enter a valid email address"
      });
    }
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check for duplicate username if it's being changed
    if (trimmedUsername && trimmedUsername !== currentUser.username) {
      const { rows: existingUser } = await client.query(
        'SELECT user_id FROM users WHERE username = $1 AND user_id != $2',
        [trimmedUsername, currentUser.user_id]
      );
      
      if (existingUser.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          message: "Username is already taken"
        });
      }
    }
    
    // Check for duplicate email if it's being changed
    if (trimmedEmail && trimmedEmail !== currentUser.email) {
      const { rows: existingEmail } = await client.query(
        'SELECT user_id FROM users WHERE email = $1 AND user_id != $2',
        [trimmedEmail, currentUser.user_id]
      );
      
      if (existingEmail.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          message: "Email is already in use"
        });
      }
    }

    // Update local database
    await client.query(
      `UPDATE users
       SET display_name = COALESCE($1, display_name),
           username = COALESCE($2, username),
           email = COALESCE($3, email),
           updated_at = NOW()
       WHERE user_id = $4 OR cognito_sub = $5`,
      [
        trimmedDisplayName ?? null,
        trimmedUsername ?? null,
        trimmedEmail ?? null,
        currentUser.user_id,
        currentUser.cognito_sub
      ]
    );
    
    await client.query('COMMIT');
    
    // Reload current user data
    await loadCurrentUser(req, { res, forceReload: true });
    
    return res.json({
      ok: true,
      message: "Profile updated successfully",
      data: {
        displayName: trimmedDisplayName || currentUser.display_name,
        username: trimmedUsername || currentUser.username,
        email: trimmedEmail || currentUser.email
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error updating profile:", error);
    
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({
        ok: false,
        message: "Username or email is already in use"
      });
    }
    
    return res.status(500).json({
      ok: false,
      message: "Server error. Please try again later."
    });
  } finally {
    client.release();
  }
}

export async function deleteAccount(req, res) {
  const currentUser = await loadCurrentUser(req, { res });
  const username = currentUser?.username || req.user?.username;
  let userId = currentUser?.user_id;

  if (!username || !userId) {
    if (!username) {
      return res.status(401).json({
        ok: false,
        message: "User not authenticated",
      });
    }

    try {
      const { rows } = await pool.query(
        "SELECT user_id FROM users WHERE username = $1",
        [username]
      );
      userId = rows[0]?.user_id || null;
    } catch (error) {
      console.error("Failed to locate user for deletion:", error);
      return res.status(500).json({
        ok: false,
        message: "Unable to locate user record for deletion",
      });
    }
  }

  if (!userId) {
    return res.status(404).json({
      ok: false,
      message: "User record not found",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Delete user-related data in correct order
    const deleteOperations = [
      "DELETE FROM likes WHERE user_id = $1",
      "DELETE FROM comments WHERE user_id = $1",
      "DELETE FROM group_join_requests WHERE user_id = $1",
      "DELETE FROM group_members WHERE user_id = $1",
      "DELETE FROM posts WHERE author_id = $1",
      "DELETE FROM groups WHERE owner_id = $1",
      `DELETE FROM reports
       WHERE reporter_id::text = $1
          OR (report_type = 'user' AND target_id::text = $1)`,
      "DELETE FROM users WHERE user_id = $1"
    ];

    for (const query of deleteOperations) {
      await client.query(query, [userId]);
    }

    // Delete from Cognito if available
    if (process.env.COGNITO_USER_POOL_ID && cognitoClient) {
      try {
        const command = new AdminDeleteUserCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: username,
        });
        await cognitoClient.send(command);
      } catch (error) {
        if (error?.name === "UserNotFoundException") {
          console.warn("Cognito user already removed, continuing delete flow");
        } else {
          throw Object.assign(new Error("COGNITO_DELETE_FAILED"), { cause: error });
        }
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.message === "COGNITO_DELETE_FAILED") {
      console.error("Failed to delete user in Cognito:", error.cause);
      return res.status(502).json({
        ok: false,
        message: "Failed to delete account in Cognito. No changes were applied.",
      });
    }

    console.error("Error deleting account:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to delete account. Please try again later.",
    });
  } finally {
    client.release();
  }

  // Clear cookies and session
  res.clearCookie("access_token");
  res.clearCookie("id_token");
  res.clearCookie("refresh_token");
  req.user = null;
  req.currentUser = null;

  return res.json({
    ok: true,
    message: "Account deleted successfully",
  });
}

export async function followUser(req, res) {
  const { username } = req.params;
  const currentUser = await loadCurrentUser(req, { res });
  
  if (!currentUser?.user_id) {
    return res.status(401).json({
      ok: false,
      message: "User not authenticated"
    });
  }
  
  try {
    const targetUser = await getUserByUsername(username);
    
    if (!targetUser) {
      return res.status(404).json({
        ok: false,
        message: "User not found"
      });
    }
    
    if (currentUser.user_id === targetUser.user_id) {
      return res.status(400).json({
        ok: false,
        message: "You cannot follow yourself"
      });
    }
    
    // Check if already following
    const existingFollow = await isFollowing(currentUser.user_id, targetUser.user_id);
    
    if (existingFollow) {
      return res.status(400).json({
        ok: false,
        message: "You are already following this user"
      });
    }
    
    // Create follow relationship
    await pool.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)',
      [currentUser.user_id, targetUser.user_id]
    );
    
    return res.json({
      ok: true,
      message: "User followed successfully"
    });
    
  } catch (error) {
    console.error("Error following user:", error);
    return res.status(500).json({
      ok: false,
      message: "Server error. Please try again later."
    });
  }
}

export async function unfollowUser(req, res) {
  const { username } = req.params;
  const currentUser = await loadCurrentUser(req, { res });
  
  if (!currentUser?.user_id) {
    return res.status(401).json({
      ok: false,
      message: "User not authenticated"
    });
  }
  
  try {
    const targetUser = await getUserByUsername(username);
    
    if (!targetUser) {
      return res.status(404).json({
        ok: false,
        message: "User not found"
      });
    }
    
    // Remove follow relationship
    const result = await pool.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
      [currentUser.user_id, targetUser.user_id]
    );
    
    if (result.rowCount === 0) {
      return res.status(400).json({
        ok: false,
        message: "You are not following this user"
      });
    }
    
    return res.json({
      ok: true,
      message: "User unfollowed successfully"
    });
    
  } catch (error) {
    console.error("Error unfollowing user:", error);
    return res.status(500).json({
      ok: false,
      message: "Server error. Please try again later."
    });
  }
}
