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

/* ---------- Helpers ---------- */
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
    const cognitoResponse = await cognitoClient.send(signUp);

    // ดึง userSub จาก Cognito Response
    const cognitoSub = cognitoResponse.UserSub;

    // 3) ยืนยันบัญชีใน Cognito
    await cognitoClient.send(
      new AdminConfirmSignUpCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: username,
      })
    );

    // 4) บันทึกข้อมูลลงใน PostgreSQL
    const query = `
      INSERT INTO users (cognito_sub, username, email, display_name, role, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING user_id, username, email, display_name, role, status, created_at;
    `;
    const values = [
      cognitoSub, // เพิ่ม cognitoSub ที่ได้จาก Cognito
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
    console.log("AuthenticationResult:", data.AuthenticationResult);
    const { AccessToken, IdToken, RefreshToken, ExpiresIn } = data.AuthenticationResult;

    const baseCookieOptions = {
      httpOnly: true,
      secure: false,
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
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: "/",
      });
    }

    console.log("Cookies set:", res.getHeaders()["set-cookie"]);

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
// คือ ฟังก์ชันที่รับ callback จาก Cognito Hosted UI หลังจากผู้ใช้ล็อกอินสำเร็จ
// ฟังก์ชันนี้จะแลกเปลี่ยน authorization code เป็น tokens และตั้งค่า cookies
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

// ตัวอย่างการใช้ Access Token
export async function fetchProtectedRoute(req, res) {
  const accessToken = req.cookies.access_token;

  if (!accessToken) {
    return res.status(401).send("Access token not provided");
  }

  try {
    const response = await fetch("/api/protected-route", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`, // Access Token ที่ได้จาก Cognito
      },
    });

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error("Error fetching protected route:", err);
    return res.status(500).json({
      ok: false,
      message: err?.message || "Internal Server Error",
    });
  }
}

// Protected route เอาไว้ทดสอบการเข้าถึงด้วย Token
// ใช้สำหรับทดสอบว่า Token ที่ส่งมาถูกต้องหรือไม่
export function protectedRoute(req, res) {
  const token = req.cookies.access_token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  // ตรวจสอบ Token (เช่น ใช้ JWT หรือ Cognito)
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // หรือใช้ Cognito SDK
    req.user = decoded;
    return res.status(200).json({ message: "Access granted", user: req.user });
  } catch (err) {
    return res.status(403).json({ message: "Invalid token" });
  }
}
