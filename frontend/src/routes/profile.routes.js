import express from 'express';
import { currentUser } from '../data/mock.js';
import { updateProfile } from '../controllers/profile.controller.js';
import { authenticateCognitoJWT } from '../middlewares/authenticate.js';

const router = express.Router();

router.get('/profile', authenticateCognitoJWT, (req, res) => {
  const userPayload = req.user?.payload || {};
  const me = {
    name: userPayload.name || currentUser.displayName,
    username: req.user?.username || currentUser.username,
    email: req.user?.email || '',
    bio: userPayload['custom:bio'] || ''
  };
  res.render('profile', { me, currentUser, activePage: 'profile' });
});

router.get('/profile/edit', authenticateCognitoJWT, (req, res) => {
  const userPayload = req.user?.payload || {};
  const me = {
    name: userPayload.name || currentUser.displayName,
    username: req.user?.username || currentUser.username,
    email: req.user?.email || '',
    bio: userPayload['custom:bio'] || ''
  };
  res.render('edit-profile', { me, currentUser, activePage: 'profile' });
});

router.post('/profile/edit', authenticateCognitoJWT, updateProfile);

export default router;
