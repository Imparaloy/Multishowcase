import { AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient } from "../services/cognito.service.js";
import pool from "../config/dbconn.js";
import { currentUser as mockUser } from "../data/mock.js";

function fallbackEmailFromSub(sub) {
  return `user-${sub}@placeholder.local`;
}

function buildViewUser(req, userRecord = null) {
  const payload = req.user?.payload || {};
  const username =
    userRecord?.username ||
    req.user?.username ||
    req.user?.email ||
    req.user?.payload?.["cognito:username"] ||
    null;
  const hasSession = Boolean(username);

  if (!hasSession) {
    return {
      me: {
        name: mockUser.displayName,
        username: mockUser.username,
        email: "",
        bio: "",
      },
      viewer: mockUser,
    };
  }

  const displayName =
    userRecord?.display_name ||
    payload.name ||
    req.user?.name ||
    username;
  const bio = payload["custom:bio"] || "";
  const email = req.user?.email || userRecord?.email || "";

  return {
    me: {
      name: displayName,
      username,
      email,
      bio,
    },
    viewer: {
      displayName,
      username,
      email,
    },
  };
}

async function ensureUserRecord(client, claims) {
  if (!claims?.sub) {
    throw new Error("Missing Cognito subject on request user");
  }

  const username =
    claims.username ||
    claims.payload?.preferred_username ||
    claims.payload?.username ||
    claims.email ||
    claims.sub;
  const displayName = claims.payload?.name || claims.name || username;
  const email = claims.email || fallbackEmailFromSub(claims.sub);

  const result = await client.query(
    `INSERT INTO users (cognito_sub, username, display_name, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (cognito_sub) DO UPDATE
     SET username = EXCLUDED.username,
         display_name = EXCLUDED.display_name,
         email = EXCLUDED.email,
         updated_at = now()
     RETURNING user_id, username, display_name, email, role`,
    [claims.sub, username, displayName, email]
  );

  return result.rows[0];
}

async function fetchPostsForUser(client, userRecord) {
  const { rows } = await client.query(
    `SELECT
       p.post_id,
       p.title,
       p.body,
       p.status,
       p.created_at,
       COALESCE(media.media_urls, ARRAY[]::text[]) AS media_urls,
       COALESCE(comments.comment_count, 0) AS comment_count,
       COALESCE(likes.like_count, 0) AS like_count
     FROM posts p
     LEFT JOIN LATERAL (
       SELECT array_agg(pm.s3_url ORDER BY pm.order_index) AS media_urls
       FROM post_media pm
       WHERE pm.post_id = p.post_id
     ) AS media ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS comment_count
       FROM comments c
       WHERE c.post_id = p.post_id
     ) AS comments ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS like_count
       FROM likes l
       WHERE l.post_id = p.post_id
     ) AS likes ON TRUE
     WHERE p.author_id = $1
     ORDER BY p.created_at DESC`,
    [userRecord.user_id]
  );

  return rows.map((row) => {
    const media = Array.isArray(row.media_urls)
      ? row.media_urls.filter(Boolean)
      : [];
    const primaryMedia = media.length ? media[0] : null;
    const body = row.body || "";

    return {
      id: row.post_id,
      name: userRecord.display_name || userRecord.username,
      username: userRecord.username,
      title: row.title || "",
      body,
      content: body,
      media,
      primaryMedia,
      status: row.status,
      createdAt: row.created_at,
      comments: Number(row.comment_count) || 0,
      likes: Number(row.like_count) || 0,
    };
  });
}

export async function renderProfilePage(req, res) {
  let feed = [];
  let userRecord = null;

  if (req.user?.sub) {
    let client;
    try {
      client = await pool.connect();
      userRecord = await ensureUserRecord(client, req.user);
      if (userRecord) {
        feed = await fetchPostsForUser(client, userRecord);
      }
    } catch (error) {
      console.error("Error loading profile feed:", error);
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  const { me, viewer } = buildViewUser(req, userRecord);

  res.render("profile", {
    me,
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
  const username = req.user?.username;

  if (!username) {
    return res.status(401).json({
      ok: false,
      message: "User not authenticated"
    });
  }

  // Check if Cognito is available (for development)
  if (!process.env.COGNITO_USER_POOL_ID || !cognitoClient) {
    console.log('Cognito not available, simulating profile update for development');
    
    // Simulate validation
    if (displayName !== undefined && displayName.trim() !== '') {
      if (displayName.trim().length > 50) {
        return res.status(400).json({
          ok: false,
          message: "Display name must be 50 characters or less"
        });
      }
    }
    
    if (bio !== undefined && bio.length > 160) {
      return res.status(400).json({
        ok: false,
        message: "Bio must be 160 characters or less"
      });
    }
    
    if (email !== undefined && email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          ok: false,
          message: "Please enter a valid email address"
        });
      }
    }

    // Simulate successful update
    return res.json({
      ok: true,
      message: "Profile updated successfully (development mode)",
      data: {
        displayName: displayName?.trim() || '',
        bio: bio?.trim() || '',
        email: email?.trim() || ''
      }
    });
  }

  try {
    const userAttributes = [];
    
    // Only include fields that have values
    if (displayName !== undefined && displayName.trim() !== '') {
      if (displayName.trim().length > 50) {
        return res.status(400).json({
          ok: false,
          message: "Display name must be 50 characters or less"
        });
      }
      userAttributes.push({ Name: "name", Value: displayName.trim() });
    }
    
    if (bio !== undefined && bio.trim() !== '') {
      if (bio.length > 160) {
        return res.status(400).json({
          ok: false,
          message: "Bio must be 160 characters or less"
        });
      }
      userAttributes.push({ Name: "custom:bio", Value: bio.trim() });
    }
    
    if (email !== undefined && email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          ok: false,
          message: "Please enter a valid email address"
        });
      }
      userAttributes.push({ Name: "email", Value: email.trim() });
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

    // อัปเดต display_name และ bio ของ user ใน PostgreSQL
    await pool.query(
      'UPDATE users SET display_name = $1, bio = $2 WHERE username = $3',
      [displayName, bio, username]
    );

    // ลบ user ตาม username
    await pool.query(
      'DELETE FROM users WHERE username = $1',
      [username]
    );

    return res.json({
      ok: true,
      message: "Profile updated successfully",
      data: {
        displayName: displayName?.trim() || '',
        bio: bio?.trim() || '',
        email: email?.trim() || ''
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
