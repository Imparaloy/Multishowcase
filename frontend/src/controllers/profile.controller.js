import { AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient } from "../services/cognito.service.js";
import pool from "../config/dbconn.js";
import { getUnifiedFeed } from "./feed.controller.js";
import {
  buildViewUser,
  loadCurrentUser,
} from "../utils/session-user.js";

async function fetchPostsForUser(userRecord) {
  const posts = await getUnifiedFeed({
    authorId: userRecord.user_id,
    statuses: ['published', 'unpublish'],
    viewerId: userRecord.user_id
  });
  
  return posts.map((row) => {
    const primaryMedia = row.media && row.media.length ? row.media[0] : null;
    const body = row.body || "";

    return {
      id: row.post_id,
      name: userRecord.display_name || userRecord.username,
      username: userRecord.username,
      title: row.title || "",
      body,
      content: body,
      media: row.media || [],
      primaryMedia,
      status: row.status,
      createdAt: row.created_at,
      comments: row.comments || 0,
      likes: row.likes || 0,
    };
  });
}

export async function renderProfilePage(req, res) {
  let feed = [];
  let userRecord = null;

  try {
    userRecord = await loadCurrentUser(req, { res });
    if (userRecord) {
      feed = await fetchPostsForUser(userRecord);
      if (feed.length) {
        console.log('Profile feed first media sample:', feed[0].media);
      }
    }
  } catch (error) {
    console.error("Error loading profile feed:", error);
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
