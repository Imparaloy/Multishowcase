// controllers/auth.controller.js
import {
  SignUpCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient, secretHash } from "../services/cognito.service.js";
import axios from "axios";
import { stringify } from "querystring";
import pool from "../config/dbconn.js";
import { confirmSignUp } from '../services/cognito.service.js';

function sanitizeDisplayName(body, fallback) {
  const raw = typeof body.display_name === 'string' ? body.display_name : body.name;
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : fallback;
}

function renderSignupView(res, { statusCode = 200, error = null, message = null, formData = {} } = {}) {
  return res.status(statusCode).render('signup', {
    title: 'Sign Up',
    error,
    message,
    formData
  });
}

/* ---------- Views ---------- */
export function renderSignup(req, res) {
  return renderSignupView(res);
}
export function renderLogin(req, res) {
  const queryMessage = typeof req.query.message === 'string' && req.query.message.trim().length
    ? req.query.message.trim()
    : undefined;
  const defaultMessage = req.query.confirmed
    ? 'บัญชีของคุณได้รับการยืนยันแล้ว กรุณาเข้าสู่ระบบเพื่อเริ่มใช้งาน'
    : undefined;
  const message = defaultMessage || queryMessage;
  const username = typeof req.query.username === 'string' ? req.query.username : '';

  res.render("login", {
    title: "Log In",
    message,
    formData: { username }
  });
}
export function renderConfirm(req, res) {
  const username = typeof req.query.username === 'string' ? req.query.username : '';
  const justSignedUp = req.query.sent === '1' || req.query.sent === 'true';
  const message = justSignedUp ? 'เราได้ส่งรหัสยืนยันไปที่อีเมลของคุณแล้ว กรุณากรอกรหัสเพื่อยืนยันบัญชี' : undefined;

  return res.render('confirm', {
    title: 'Confirm Sign Up',
    username,
    message
  });
}

export function renderForgotPassword(req, res) {
  const username = typeof req.query.username === 'string' ? req.query.username : '';
  const message = typeof req.query.message === 'string' ? req.query.message : null;
  const error = typeof req.query.error === 'string' ? req.query.error : null;

  return res.render('forgot-password', {
    title: 'Forgot Password',
    message,
    error,
    formData: { username }
  });
}

export function renderForgotPasswordConfirm(req, res) {
  const username = typeof req.query.username === 'string' ? req.query.username : '';
  const justSent = req.query.sent === '1' || req.query.sent === 'true';
  const messageParam = typeof req.query.message === 'string' ? req.query.message : null;
  const message = justSent
    ? 'เราได้ส่งรหัสรีเซ็ตรหัสผ่านไปที่อีเมลของคุณแล้ว'
    : messageParam;
  const error = typeof req.query.error === 'string' ? req.query.error : null;

  return res.render('forgot-password-confirm', {
    title: 'Reset Password',
    username,
    message,
    error
  });
}

export async function confirm(req, res) {
  const { username, code } = req.body || {};
  if (!username || !code) {
    return res.status(400).render('confirm', {
      title: 'Confirm Sign Up',
      error: 'กรุณากรอก username และ confirmation code',
      username: username || ''
    });
  }
  try {
    await confirmSignUp({ username, code });
    await pool.query(
      `UPDATE users
       SET status = 'active', updated_at = NOW()
       WHERE username = $1`,
      [username]
    );

    return res.redirect(`/login?confirmed=1&username=${encodeURIComponent(username)}`);
  } catch (err) {
    console.error('Confirm sign up failed:', err);
    return res.status(400).render('confirm', {
      title: 'Confirm Sign Up',
      error: err?.message || 'Confirm failed',
      username
    });
  }
}

export async function requestPasswordReset(req, res) {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';

  if (!username) {
    return res.status(400).render('forgot-password', {
      title: 'Forgot Password',
      error: 'กรุณากรอก username',
      formData: { username: '' }
    });
  }

  try {
    const command = new ForgotPasswordCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: username,
      SecretHash: secretHash(username)
    });

    await cognitoClient.send(command);

    return res.redirect(`/forgot-password/confirm?username=${encodeURIComponent(username)}&sent=1`);
  } catch (err) {
    console.error('Forgot password initiation failed:', err);
    const friendlyMessage = err?.message ?? 'ไม่สามารถส่งรหัสรีเซ็ตได้ กรุณาลองใหม่อีกครั้ง';
    return res.status(400).render('forgot-password', {
      title: 'Forgot Password',
      error: friendlyMessage,
      formData: { username }
    });
  }
}

export async function confirmPasswordReset(req, res) {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !code || !password) {
    return res.status(400).render('forgot-password-confirm', {
      title: 'Reset Password',
      username,
      error: 'กรุณากรอกข้อมูลให้ครบถ้วน',
      message: null
    });
  }

  if (password.length < 8) {
    return res.status(400).render('forgot-password-confirm', {
      title: 'Reset Password',
      username,
      error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร',
      message: null
    });
  }

  try {
    const command = new ConfirmForgotPasswordCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: username,
      ConfirmationCode: code,
      Password: password,
      SecretHash: secretHash(username)
    });

    await cognitoClient.send(command);

    await pool.query(
      `UPDATE users
       SET updated_at = NOW(), status = 'active'
       WHERE username = $1`,
      [username]
    );

    const successMessage = encodeURIComponent('รีเซ็ตรหัสผ่านเรียบร้อย กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่');
    return res.redirect(`/login?username=${encodeURIComponent(username)}&message=${successMessage}`);
  } catch (err) {
    console.error('Confirm password reset failed:', err);
    const friendlyMessage = err?.message ?? 'ไม่สามารถรีเซ็ตรหัสผ่านได้ กรุณาตรวจสอบรหัสหรือรหัสผ่านใหม่';
    return res.status(400).render('forgot-password-confirm', {
      title: 'Reset Password',
      username,
      error: friendlyMessage,
      message: null
    });
  }
}

/* ---------- Helpers ---------- */
export async function signup(req, res) {
  const rawUsername = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const rawEmail = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const password = req.body.password;
  const rawDisplayInput = typeof req.body.display_name === 'string'
    ? req.body.display_name
    : (typeof req.body.name === 'string' ? req.body.name : '');
  const display_name = sanitizeDisplayName(req.body, rawUsername);

  const formData = {
    display_name: rawDisplayInput,
    username: rawUsername,
    email: rawEmail
  };

  if (!rawUsername) {
    return renderSignupView(res, {
      statusCode: 400,
      error: 'Username is required.',
      formData
    });
  }

  if (!rawEmail) {
    return renderSignupView(res, {
      statusCode: 400,
      error: 'Email is required.',
      formData
    });
  }

  // Validate password strength
  if (
    typeof password !== 'string' ||
    !password.trim() ||
    /^\s|\s$/.test(password) ||
    /\s/.test(password)
  ) {
    return renderSignupView(res, {
      statusCode: 400,
      error: 'Password must not contain spaces and cannot be empty.',
      formData
    });
  }

  try {
    // 1) ตรวจสอบว่าอีเมลซ้ำใน PostgreSQL หรือไม่
    const emailCheck = await pool.query("SELECT username FROM users WHERE email = $1", [rawEmail]);
    if (emailCheck.rows.length > 0 && emailCheck.rows[0].username !== rawUsername) {
      return renderSignupView(res, {
        statusCode: 400,
        error: 'Email already exists in database',
        formData
      });
    }

    // 2) สมัครใน Cognito
    const signUp = new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: rawUsername,
      Password: password,
      UserAttributes: [{ Name: "email", Value: rawEmail }],
      SecretHash: secretHash(rawUsername),
    });
    const cognitoResponse = await cognitoClient.send(signUp);

    // ดึง userSub จาก Cognito Response
    const cognitoSub = cognitoResponse.UserSub;

    // 3) บันทึกข้อมูลลงใน PostgreSQL โดยตั้งสถานะรอยืนยัน
    const query = `
      INSERT INTO users (cognito_sub, username, email, display_name, role, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (username) DO UPDATE
        SET email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            status = EXCLUDED.status,
            updated_at = NOW()
      RETURNING user_id;
    `;
    const values = [
      cognitoSub,
      rawUsername,
      rawEmail,
      display_name || rawUsername,
      'user',
      'pending_confirmation',
    ];

    await pool.query(query, values);

    // 4) พาผู้ใช้ไปหน้ากรอกรหัสยืนยัน
    return res.redirect(`/confirm?username=${encodeURIComponent(rawUsername)}&sent=1`);
  } catch (err) {
    console.error("Error during sign up:", err);
    const fallback = err?.message || 'Internal Server Error';
    let message = fallback;

    if (err?.name === 'UsernameExistsException') {
      message = 'Username already exists. If you already signed up, please confirm your account using the code sent to your email.';
    } else if (err?.name === 'InvalidPasswordException') {
      message = 'Password does not meet the complexity requirements.';
    } else if (err?.name === 'InvalidParameterException') {
      message = err.message || 'Invalid input.';
    }

    const statusCode = message === fallback ? 500 : 400;

    return renderSignupView(res, {
      statusCode,
      error: message,
      formData
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

    const cookies = res.getHeaders()["set-cookie"];
    if (Array.isArray(cookies)) {
      console.log("Cookies set:", cookies.map(c => c.slice(0, 30)));
    } else if (typeof cookies === 'string') {
      console.log("Cookies set:", cookies.slice(0, 30));
    } else {
      console.log("Cookies set:", cookies);
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
