// src/routes/index.routes.js
import express from 'express';
const router = express.Router();

// Redirect home to profile (layout.ejs does not exist)
router.get('/', (req, res) => {
  return res.redirect('/profile');
});

// Minimal profile route to render existing view with mock data
router.get('/profile', (req, res) => {
  const currentUser = {
    username: 'demo_user',
    displayName: 'Demo User',
    role: 'member',
  };
  const me = { name: currentUser.displayName, username: currentUser.username };
  res.render('profile', { me, currentUser, activePage: 'profile' });
});

export default router;
