import express from 'express';
import { currentUser } from '../data/mock.js';

const router = express.Router();

router.get('/profile', (req, res) => {
  const me = { name: currentUser.displayName, username: currentUser.username };
  res.render('profile', { me, currentUser, activePage: 'profile' });
});

export default router;
