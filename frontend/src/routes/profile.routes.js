import express from 'express';
import { currentUser as mockUser } from '../data/mock.js';
import { updateProfile } from '../controllers/profile.controller.js';
import { authenticateCognitoJWT } from '../middlewares/authenticate.js';

const router = express.Router();

function buildViewUser(req) {
  const payload = req.user?.payload || {};
  const username = req.user?.username;
  const hasSession = Boolean(username);

  if (!hasSession) {
    return {
      me: {
        name: mockUser.displayName,
        username: mockUser.username,
        email: '',
        bio: '',
      },
      viewer: mockUser,
    };
  }

  const displayName = payload.name || username;
  const bio = payload['custom:bio'] || '';
  const email = req.user?.email || '';

  return {
    me: {
      name: displayName,
      username,
      email,
      bio,
    },
    viewer: {
      displayName,
      username,
      email,
    },
  };
}

router.get('/profile', authenticateCognitoJWT, (req, res) => {
  const { me, viewer } = buildViewUser(req);
  res.render('profile', { me, currentUser: viewer, activePage: 'profile' });
});

router.get('/profile/edit', authenticateCognitoJWT, (req, res) => {
  const { me, viewer } = buildViewUser(req);
  res.render('edit-profile', { me, currentUser: viewer, activePage: 'profile' });
});

router.post('/profile/edit', authenticateCognitoJWT, updateProfile);

export default router;
