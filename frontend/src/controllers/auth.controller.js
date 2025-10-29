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

/* ---------- Views ---------- */
export function renderSignup(req, res) {
  res.render("signup", { title: "Sign Up" });
}
export function renderLogin(req, res) {
  res.render("login", { title: "Log In" });
}import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

const stsClient = new STSClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function testCredentials() {
  try {
    const data = await stsClient.send(new GetCallerIdentityCommand({}));
    console.log("AWS Credentials are valid:", data);
  } catch (error) {
    console.error("Invalid AWS Credentials:", error);
  }
}

testCredentials();

/* ---------- Helpers ---------- */
async function isEmailTaken(email) {
  const cmd = new ListUsersCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    Filter: `email = "${email}"`,
    Limit: 1,
  });
  const out = await cognitoClient.send(cmd);
  return Array.isArray(out.Users) && out.Users.length > 0;
}


export async function signup(req, res) {
  const { username, password, email, name: display_name } = req.body;
  try {
    // 1) กันอีเมลซ้ำ
    if (await isEmailTaken(email)) {
      return res.status(400).json({ ok: false, message: "Email already registered" });
    }

    // 2) สมัคร
    const signUp = new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: username,
      Password: password,
      UserAttributes: [
        { Name: "email", Value: email }
      ],
      SecretHash: secretHash(username),
    });
    await cognitoClient.send(signUp);

    // 3) ยืนยันบัญชี (ไม่ต้องกรอกโค้ด)
    await cognitoClient.send(
      new AdminConfirmSignUpCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: username,
      })
    );

    // 4) ตั้ง email_verified=true เพื่อข้ามการ verify อีเมล
    await cognitoClient.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: username,
        UserAttributes: [{ Name: "email_verified", Value: "true" }],
      })
    );

    // 5) เสร็จ — พาไปล็อกอินได้เลย
    return res.status(201).json({
      ok: true,
      message: "Sign up successful. Your account is confirmed. You can log in now.",
    });
  } catch (err) {
    console.error("Error during sign up:", err);
    return res.status(400).json({
      ok: false,
      message: err?.message || "Error during sign up",
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
    const { AccessToken, ExpiresIn } = data.AuthenticationResult;

    res.cookie("access_token", AccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ExpiresIn * 1000,
      path: "/",
    });

    return res.redirect("/profile?username=" + encodeURIComponent(username));
  } catch (err) {
    console.error("Error during login:", err);
    res.status(400).send("Error during login: " + (err.message || "Unknown"));
  }
}

export function logout(req, res) {
  res.clearCookie("access_token");
  res.redirect("/login");
}

// OAuth callback (Hosted UI)
export async function oauthCallback(req, res) {
  const code = req.query.code;
  try {
    const tokenRes = await axios.post(
      `https://${process.env.COGNITO_DOMAIN}/oauth2/token`,
      stringify({
        grant_type: "authorization_code",
        client_id: process.env.COGNITO_CLIENT_ID,
        code,
        redirect_uri: "http://localhost:3000/auth/callback",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, expires_in } = tokenRes.data;

    res.cookie("access_token", access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: expires_in * 1000,
      path: "/",
    });

    return res.redirect("/profile");
  } catch (e) {
    console.error(e.response?.data || e);
    return res.status(400).send("Callback exchange failed");
  }
}
