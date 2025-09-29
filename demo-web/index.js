// <<<<<<< HEAD
require("dotenv").config();
const express = require("express");
const path = require("path");
const app = express();
const cookieParser = require("cookie-parser");
const AWS = require("aws-sdk");
const { authenticateCognitoJWT, requireAuth, requireRole } = require('./middlewares/authenticate');
const crypto = require("crypto");

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

AWS.config.update({
  region: process.env.AWS_REGION,
  credentials: new AWS.Credentials(
    process.env.AWS_ACCESS_KEY_ID,
    process.env.AWS_SECRET_ACCESS_KEY,
    process.env.AWS_SESSION_TOKEN ,// ต้องมี
  ),
});
const cognito = new AWS.CognitoIdentityServiceProvider();

function secretHash(username) {
  return crypto
    .createHmac('sha256', process.env.COGNITO_CLIENT_SECRET)
    .update(username + process.env.COGNITO_CLIENT_ID)
    .digest('base64');      
}

app.get("/", (req,res) =>{
  res.redirect, { username: username }}
);

app.get("/profile", requireAuth, (req, res) => {
  const claims = req.user;
  const username = req.query.username || claims["cognito:username"] || claims.email;
  res.render("profile", {
    title: "Multi showcase",
    me: {
      name: claims.name || "No name",
      username: username,
      following: 0,
      followers: 0
    },
    posts: [], // ส่ง posts (array) ไปเสมอเพื่อป้องกัน error
    trending: [] // ส่ง trending (array) ไปเสมอเพื่อป้องกัน error
  });
});


app.get('/signup', (req, res) => {
  res.render('signup', { title: 'Sign Up' });
});
app.post('/signup', (req, res) => {
  const { username, password, email, name } = req.body;

  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: username,
    Password: password,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'name', Value: name }
    ],
    SecretHash: secretHash(username)
  };
  cognito.signUp(params, (err, data) => {
    if (err) {
      console.error('Error during sign up:', err);
      return res.status(400).send('Error during sign up: ' + err.message);
    }
    console.log('Sign up successful:', data);
    res.send('Sign up successful! Please check your email for verification.');
  });
});
app.get('/confirm', (req, res) => {
  res.render('confirm', { title: 'Confirm Sign Up' });
});
app.post('/confirm', (req, res) => {
  const { username, code } = req.body;
  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: username, 
    ConfirmationCode: code,
    SecretHash: secretHash(username)
  };
  cognito.confirmSignUp(params, (err, data) => {
    if (err) {
      console.error('Error during confirmation:', err);
      return res.status(400).send('Error during confirmation: ' + err.message);
    }
    console.log('Confirmation successful:', data);
    res.send('Confirmation successful! You can now log in.');
  });
});
app.get('/login', (req, res) => {
  res.render('login', { title: 'Log In' });
});
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  const params = {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
      SECRET_HASH: secretHash(username) // ถ้า app client มี client secret
    }
  };

  cognito.initiateAuth(params, (err, data) => {
    if (err) {
      console.error('Error during login:', err);
      return res.status(400).send('Error during login: ' + err.message);
    }

    const { AccessToken, IdToken, ExpiresIn } = data.AuthenticationResult;

    // ✅ ตั้งคุกกี้ให้ requireAuth อ่านได้
    res.cookie('access_token', AccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // dev ใช้ false ได้
      sameSite: 'lax',                               // เหมาะกับ localhost
      maxAge: ExpiresIn * 1000,
      path: '/',
    });

    // (ถ้าต้องใช้ claims จาก id_token บน client/SSR จะเก็บเพิ่มได้)
    // res.cookie('id_token', IdToken, { ...options เดียวกัน... });

  return res.redirect('/profile?username=' + encodeURIComponent(username));
  });
});

app.get('/logout', (req, res) => {
  res.clearCookie('access_token');
  res.redirect('/login');
});

const axios = require('axios');
const qs = require('querystring');

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const tokenRes = await axios.post(
      `https://${process.env.COGNITO_DOMAIN}/oauth2/token`,
      qs.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.COGNITO_CLIENT_ID,
        code,
        redirect_uri: 'http://localhost:3000/auth/callback'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, id_token, expires_in } = tokenRes.data;

    res.cookie('access_token', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: expires_in * 1000,
      path: '/',
    });

    return res.redirect('/profile');
  } catch (e) {
    console.error(e.response?.data || e);
    return res.status(400).send('Callback exchange failed');
  }
});



app.listen(3000, ()=>console.log("http://localhost:3000/profile"));
// =======


const PORT = 3000;

// --- Mock data for comment page ---
const commentMock = [
  {
    id: 1,
    name: "Polor",
    username: "Polor_inwza",
    content: "อยากนอนหลับสัก 48 ชั่วโมง",
    comments: "120",
    likes: "3.5k",
    reactions: "5.2k",
    views: "8.1k",
  },
  {
    id: 2,
    name: "Polor",
    username: "Polor_inwza",
    content: "อยากเล่นเกมไม่อยากทำงานing",
    comments: "80",
    likes: "2.1k",
    reactions: "1.5k",
    views: "4.3k",
  },
];

const commentsByPost = {
  1: [
    {
      name: "Name",
      username: "Username",
      content:
        "Most fonts have a particular weight which corresponds to one of the numbers in Common weight name mapping. Most fonts have a particular weight which corresponds to one of the numbers in Common weight name mapping.",
      comments: "2.0k",
      likes: "30k",
    },
    {
      name: "Name",
      username: "Username",
      content:
        "Most fonts have a particular weight which corresponds to one of the numbers in Common weight name mapping. Most fonts have a particular weight which corresponds to one of the numbers in Common weight name mapping.",
      comments: "2.0k",
      likes: "30k",
    },
  ],
  2: [
    {
      name: "Another",
      username: "AnotherUser",
      content:
        "This is a comment for post 2 only.",
      comments: "1.1k",
      likes: "2k",
    }
  ]
};
// --- Comment page route ---
app.get("/comment", (req, res) => {
  const id = parseInt(req.query.id);
  // รวมโพสต์จากทุกแหล่ง
  const allPosts = [...forYouPosts, ...followingPosts];
  const post = allPosts.find((p) => p.id === id) || allPosts[0];
  const comments = commentsByPost[post.id] || [];
  res.render("comment", {
    post: post,
    comments: comments,
  });
});

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// --- Sample data ---
const forYouPosts = commentMock;

const followingPosts = [
  {
    id: 3,
    name: "Polor",
    username: "Polor_inwza",
    content: "ตามเพื่อนอยู่ 555",
    comments: "12",
    likes: "240",
    reactions: "360",
    views: "1.1k",
  },
];

commentsByPost[3] = [
  {
    name: "Friend",
    username: "frienduser",
    content: "คอมเมนต์สำหรับโพสต์ following เท่านั้น",
    comments: "10",
    likes: "20",
  }
];

// --- Routes ---
app.get("/", (req, res) => {
  res.render("home", {
    activeTab: "for-you",
    feed: forYouPosts,
  });
});

app.get("/following", (req, res) => {
  res.render("home", {
    activeTab: "following",
    feed: followingPosts,
  });
});

// --- Explore page route ---
app.get("/explore", (req, res) => {
  res.render("explore", {
    feed: commentMock,
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
// >>>>>>> main
