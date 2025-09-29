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
