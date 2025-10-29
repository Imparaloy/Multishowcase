import { AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient } from "../services/cognito.service.js";

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