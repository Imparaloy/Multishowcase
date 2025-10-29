// controllers/auth.controller.js
import {
  SignUpCommand,
  InitiateAuthCommand,
  ListUsersCommand,
  AdminConfirmSignUpCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient, secretHash } from "../services/cognito.service.js";
import axios from "axios";
import { stringify } from "querystring";
import pool from "../config/dbconn.js";

/* ---------- Views ---------- */
export function renderSignup(req, res) {
  res.render("signup", { title: "Sign Up" });
}
export function renderLogin(req, res) {
  res.render("login", { title: "Log In" });
}

// /* ---------- Helpers ---------- */
// async function isEmailTaken(email) {
//   const cmd = new ListUsersCommand({
//     UserPoolId: process.env.COGNITO_USER_POOL_ID,
//     Filter: `email = "${email}"`,
//     Limit: 1,
//   });
//   const out = await cognitoClient.send(cmd);
//   return Array.isArray(out.Users) && out.Users.length > 0;
// }


export async function signup(req, res) {
  const { username, password, email, name: display_name } = req.body;

  try {
    // 1) ตรวจสอบว่าอีเมลซ้ำใน PostgreSQL หรือไม่
    const emailCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ ok: false, message: "Email already exists in database" });
    }

    // 2) สมัครใน Cognito
    const signUp = new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: username,
      Password: password,
      UserAttributes: [{ Name: "email", Value: email }],
      SecretHash: secretHash(username),
    });
    await cognitoClient.send(signUp);

    // 3) ยืนยันบัญชีใน Cognito
    await cognitoClient.send(
      new AdminConfirmSignUpCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: username,
      })
    );

    // 4) บันทึกข้อมูลลงใน PostgreSQL
    const query = `
      INSERT INTO users (username, email, display_name, role, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING user_id, username, email, display_name, role, status, created_at;
    `;
    const values = [
      username,
      email,
      display_name || username, // ถ้าไม่มี display_name ให้ใช้ username
      "user", // ค่า role เริ่มต้น
      "active", // ค่า status เริ่มต้น
    ];

    const result = await pool.query(query, values);

    // 5) ส่ง response กลับไปยัง client
    return res.status(201).json({
      ok: true,
      message: "Sign up successful. Your account is confirmed. You can log in now.",
      user: result.rows[0],
    });
  } catch (err) {
    console.error("Error during sign up:", err);
    return res.status(500).json({
      ok: false,
      message: err?.message || "Internal Server Error",
    });
  }
}

// ✅ Login ปกติ
export async function login(req, res) {
  const { username, password } = req.body;

  const cmd = new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
      SECRET_HASH: secretHash(username),
    },
  });

  try {
    const data = await cognitoClient.send(cmd);
    const { AccessToken, IdToken, RefreshToken, ExpiresIn } = data.AuthenticationResult;

    const baseCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ExpiresIn * 1000,
      path: "/",
    };

    if (AccessToken) {
      res.cookie("access_token", AccessToken, baseCookieOptions);
    }

    if (IdToken) {
      res.cookie("id_token", IdToken, baseCookieOptions);
    }

    if (RefreshToken) {
      res.cookie("refresh_token", RefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });
    }

    return res.redirect("/profile?username=" + encodeURIComponent(username));
  } catch (err) {
    console.error("Error during login:", err);
    res.status(400).send("Error during login: " + (err.message || "Unknown"));
  }
}

export function logout(req, res) {
  res.clearCookie("access_token");
  res.clearCookie("id_token");
  res.clearCookie("refresh_token");
  res.redirect("/login");
}

// OAuth callback (Hosted UI)
export async function oauthCallback(req, res) {
  const code = req.query.code;
  try {
    const tokenRes = await axios.post(
      "https://" + process.env.COGNITO_DOMAIN + "/oauth2/token",
      stringify({
        grant_type: "authorization_code",
        client_id: process.env.COGNITO_CLIENT_ID,
        code,
        redirect_uri: "http://localhost:3000/auth/callback",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, id_token, refresh_token, expires_in } = tokenRes.data;

    const baseCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: expires_in * 1000,
      path: "/",
    };

    if (access_token) {
      res.cookie("access_token", access_token, baseCookieOptions);
    }

    if (id_token) {
      res.cookie("id_token", id_token, baseCookieOptions);
    }

    if (refresh_token) {
      res.cookie("refresh_token", refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });
    }

    return res.redirect("/profile");
  } catch (e) {
    console.error(e.response?.data || e);
    return res.status(400).send("Callback exchange failed");
  }
}
