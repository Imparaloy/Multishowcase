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

async function fetchPostsForUser(userRecord, viewerId = null) {
  const posts = await getUnifiedFeed({
    authorId: userRecord.user_id,
    statuses: ['published'],
    viewerId: viewerId || userRecord.user_id
  });
  
  return posts.map((row) => {
    const primaryMedia = row.media && row.media.length ? row.media[0] : null;
    const body = row.body || "";

    return {
      id: row.post_id,
      post_id: row.post_id,
      name: row.author_display_name || userRecord.display_name || userRecord.username,
      username: row.author_username || userRecord.username,
      author_display_name: row.author_display_name || userRecord.display_name || userRecord.username,
      author_username: row.author_username || userRecord.username,
      title: row.title || "",
      body,
      content: body,
      media: row.media || [],
      primaryMedia,
      status: row.status,
      createdAt: row.created_at,
      comments: row.comments || 0,
      likes: row.likes || 0,
      isFollowing: row.isFollowing || false
    };
  });
}

export async function renderProfilePage(req, res) {
  let feed = [];
  let userRecord = null;
  let profileUser = null;

  // Get the username from URL params, default to current user if not provided
  const profileUsername = req.params.username;
  const currentUser = req.user;

  // Debug logging to understand the user object structure
  console.log('Current user object:', JSON.stringify(currentUser, null, 2));

  if (currentUser?.sub) {
    let client;
    try {
      client = await pool.connect();
      userRecord = await ensureUserRecord(req.user, { client });
    } catch (error) {
      console.error("Error loading user record:", error);
    } finally {
      if (client) {
        client.release();
      }
    }
  } else if (currentUser) {
    console.error('User object exists but missing sub property');
  }

  // Function to check if current user is following the profile user
  async function isFollowing(followerId, followingId) {
    if (!followerId || !followingId) return false;
    
    try {
      const client = await pool.connect();
      const result = await client.query(
        'SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2',
        [followerId, followingId]
      );
      client.release();
      return result.rows.length > 0;
    } catch (error) {
      console.error("Error checking follow status:", error);
      return false;
    }
  }

  // Function to get user statistics
  async function getUserStats(userId) {
    try {
      const client = await pool.connect();
      
      // Get posts count by counting published posts only (for consistency with other profiles)
      const postsResult = await client.query(
        'SELECT COUNT(*) as count FROM posts WHERE author_id = $1 AND status = $2',
        [userId, 'published']
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
      
      return {
        postsCount,
        followersCount,
        followingCount
      };
    } catch (error) {
      console.error("Error getting user stats:", error);
      return {
        postsCount: 0,
        followersCount: 0,
        followingCount: 0
      };
    }
  }

  // If viewing someone else's profile, get their posts
  if (profileUsername && profileUsername !== currentUser?.username) {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM users WHERE username = $1',
        [profileUsername]
      );
      profileUser = rows[0];
      
      if (!profileUser) {
        return res.status(404).send("User not found");
      }

      feed = await getUnifiedFeed({
        authorId: profileUser.user_id,
        statuses: ['published'],
        viewerId: userRecord?.user_id
      });
      
      // Map the posts to ensure consistent format
      feed = feed.map((row) => {
        const primaryMedia = row.media && row.media.length ? row.media[0] : null;
        const body = row.body || "";

        return {
          id: row.post_id,
          post_id: row.post_id,
          name: row.author_display_name || profileUser.display_name || profileUser.username,
          username: row.author_username || profileUser.username,
          author_display_name: row.author_display_name || profileUser.display_name || profileUser.username,
          author_username: row.author_username || profileUser.username,
          title: row.title || "",
          body,
          content: body,
          media: row.media || [],
          primaryMedia,
          status: row.status,
          createdAt: row.created_at,
          comments: row.comments || 0,
          likes: row.likes || 0,
          isFollowing: row.isFollowing || false
        };
      });
      
      // Get user statistics and check follow status
      const userStats = await getUserStats(profileUser.user_id);
      const isFollowingUser = await isFollowing(userRecord?.user_id, profileUser.user_id);
      
      const { me, viewer } = buildViewUser(req, userRecord);

      res.render("user-profile", {
        me: {
          name: profileUser.display_name || profileUser.username,
          username: profileUser.username,
          email: profileUser.email || "",
          bio: profileUser.bio || "",
          avatar_url: profileUser.avatar_url || "",
          created_at: profileUser.created_at,
          stats: userStats
        },
        currentUser: viewer,
        activePage: "profile",
        feed,
        isFollowing: isFollowingUser
      });
      return;
    } catch (error) {
      console.error("Error loading profile user:", error);
      return res.status(500).send("Failed to load profile");
    }
  }

  // If viewing own profile or no username specified, show current user's posts
  if (userRecord) {
    feed = await fetchPostsForUser(userRecord, userRecord.user_id);
  }

  const { me, viewer } = buildViewUser(req, userRecord);
  
  // Get user statistics for the profile being viewed
  const profileUserId = userRecord?.user_id;
  const userStats = profileUserId ? await getUserStats(profileUserId) : { postsCount: 0, followersCount: 0, followingCount: 0 };

  res.render("profile", {
    me: {
      ...me,
      avatar_url: userRecord?.avatar_url || "",
      created_at: userRecord?.created_at,
      stats: userStats
    },
    currentUser: viewer,
    activePage: "profile",
    feed,
  });
}

export function renderProfileEditPage(req, res) {
  const { me, viewer } = buildViewUser(req);
  res.render("edit-profile", {
    me,
    currentUser: viewer,
    activePage: "profile",
  });
}

export async function updateProfile(req, res) {
  const { displayName, bio, email } = req.body;
  const currentUser = await loadCurrentUser(req, { res });
  const username = currentUser?.username || req.user?.username;

  if (!username) {
    return res.status(401).json({
      ok: false,
      message: "User not authenticated"
    });
  }

  const safeTrim = (value) => (typeof value === "string" ? value.trim() : undefined);
  const trimmedDisplayName = safeTrim(displayName);
  const trimmedBio = safeTrim(bio);
  const trimmedEmail = safeTrim(email);

  // Check if Cognito is available (for development)
  if (!process.env.COGNITO_USER_POOL_ID || !cognitoClient) {
    console.log('Cognito not available, simulating profile update for development');
    
    // Simulate validation
    if (trimmedDisplayName) {
      if (trimmedDisplayName.length > 50) {
        return res.status(400).json({
          ok: false,
          message: "Display name must be 50 characters or less"
        });
      }
    }
    
    if (trimmedBio && trimmedBio.length > 160) {
      return res.status(400).json({
        ok: false,
        message: "Bio must be 160 characters or less"
      });
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

    // Persist changes for development mode so other pages stay in sync
    try {
      await pool.query(
        `UPDATE users
         SET display_name = COALESCE($1, display_name),
             bio = COALESCE($2, bio),
             email = COALESCE($3, email),
             updated_at = NOW()
         WHERE username = $4`,
        [trimmedDisplayName ?? null, trimmedBio ?? null, trimmedEmail ?? null, username]
      );
      await loadCurrentUser(req, { res, forceReload: true });
    } catch (error) {
      console.error("Failed to update development profile record:", error);
    }

    // Simulate successful update
    return res.json({
      ok: true,
      message: "Profile updated successfully (development mode)",
      data: {
        displayName: trimmedDisplayName || '',
        bio: trimmedBio || '',
        email: trimmedEmail || ''
      }
    });
  }

  try {
    const userAttributes = [];
    
    // Only include fields that have values
    if (trimmedDisplayName) {
      if (trimmedDisplayName.length > 50) {
        return res.status(400).json({
          ok: false,
          message: "Display name must be 50 characters or less"
        });
      }
      userAttributes.push({ Name: "name", Value: trimmedDisplayName });
    }
    
    if (trimmedBio) {
      if (trimmedBio.length > 160) {
        return res.status(400).json({
          ok: false,
          message: "Bio must be 160 characters or less"
        });
      }
      userAttributes.push({ Name: "custom:bio", Value: trimmedBio });
    }
    
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({
          ok: false,
          message: "Please enter a valid email address"
        });
      }
      userAttributes.push({ Name: "email", Value: trimmedEmail });
    }

    if (userAttributes.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "At least one field must be provided to update"
      });
    }

    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: username,
      UserAttributes: userAttributes,
    });

    await cognitoClient.send(command);

    // อัปเดตข้อมูลผู้ใช้ใน PostgreSQL เพื่อให้หน้าอื่นๆ รับข้อมูลล่าสุดด้วย
    await pool.query(
      `UPDATE users
       SET display_name = COALESCE($1, display_name),
           bio = COALESCE($2, bio),
           email = COALESCE($3, email),
           updated_at = NOW()
       WHERE username = $4`,
      [trimmedDisplayName ?? null, trimmedBio ?? null, trimmedEmail ?? null, username]
    );

    await loadCurrentUser(req, { res, forceReload: true });

    return res.json({
      ok: true,
      message: "Profile updated successfully",
      data: {
        displayName: trimmedDisplayName || '',
        bio: trimmedBio || '',
        email: trimmedEmail || ''
      }
    });

  } catch (error) {
    console.error("Error updating profile:", error);
    
    // Handle specific AWS Cognito errors
    if (error.name === 'InvalidParameterException') {
      return res.status(400).json({
        ok: false,
        message: "Invalid parameter: " + (error.message || "Unknown parameter error")
      });
    }
    
    if (error.name === 'UserNotFoundException') {
      return res.status(404).json({
        ok: false,
        message: "User not found"
      });
    }
    
    return res.status(500).json({
      ok: false,
      message: "Server error. Please try again later."
    });
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

    const tablesToCheck = [
      "likes",
      "comments",
      "group_join_requests",
      "group_members",
      "posts",
      "groups",
      "reports",
    ];

    const { rows: tableRows } = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [tablesToCheck]
    );

    const availableTables = new Set(tableRows.map((row) => row.table_name));

    if (availableTables.has("likes")) {
      await client.query("DELETE FROM likes WHERE user_id = $1", [userId]);
    }

    if (availableTables.has("comments")) {
      await client.query("DELETE FROM comments WHERE user_id = $1", [userId]);
    }

    if (availableTables.has("group_join_requests")) {
      await client.query("DELETE FROM group_join_requests WHERE user_id = $1", [userId]);
    }

    if (availableTables.has("group_members")) {
      await client.query("DELETE FROM group_members WHERE user_id = $1", [userId]);
    }

    if (availableTables.has("posts")) {
      await client.query("DELETE FROM posts WHERE author_id = $1", [userId]);
    }

    if (availableTables.has("groups")) {
      await client.query("DELETE FROM groups WHERE owner_id = $1", [userId]);
    }

    if (availableTables.has("reports")) {
      await client.query(
        `DELETE FROM reports
         WHERE reporter_id::text = $1
            OR (report_type = 'user' AND target_id::text = $1)`,
        [userId]
      );
    }

    await client.query("DELETE FROM users WHERE user_id = $1", [userId]);

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
    } else {
      console.log("Cognito not available, skipped remote delete for development");
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
    // Get the user to follow
    const { rows } = await pool.query(
      'SELECT user_id FROM users WHERE username = $1',
      [username]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "User not found"
      });
    }
    
    const targetUserId = rows[0].user_id;
    
    // Don't allow following yourself
    if (currentUser.user_id === targetUserId) {
      return res.status(400).json({
        ok: false,
        message: "You cannot follow yourself"
      });
    }
    
    // Check if already following
    const existingFollow = await pool.query(
      'SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2',
      [currentUser.user_id, targetUserId]
    );
    
    if (existingFollow.rows.length > 0) {
      return res.status(400).json({
        ok: false,
        message: "You are already following this user"
      });
    }
    
    // Create follow relationship
    await pool.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)',
      [currentUser.user_id, targetUserId]
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
    // Get the user to unfollow
    const { rows } = await pool.query(
      'SELECT user_id FROM users WHERE username = $1',
      [username]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "User not found"
      });
    }
    
    const targetUserId = rows[0].user_id;
    
    // Remove follow relationship
    const result = await pool.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
      [currentUser.user_id, targetUserId]
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
