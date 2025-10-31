import express from 'express';
import {
  renderProfilePage,
  renderProfileEditPage,
  updateProfile,
  deleteAccount,
  followUser,
  unfollowUser,
} from '../controllers/profile.controller.js';
import {
  authenticateCognitoJWT,
  requireAuth,
} from '../middlewares/authenticate.js';

const router = express.Router();

router.get(
  '/profile/edit',
  authenticateCognitoJWT,
  requireAuth,
  renderProfileEditPage
);

router.post(
  '/profile/edit',
  authenticateCognitoJWT,
  requireAuth,
  updateProfile
);

router.post(
  '/profile/delete',
  authenticateCognitoJWT,
  requireAuth,
  deleteAccount
);

router.get('/profile', authenticateCognitoJWT, requireAuth, renderProfilePage);
router.get('/profile/:username', authenticateCognitoJWT, requireAuth, renderProfilePage);

router.post(
  '/profile/:username/follow',
  authenticateCognitoJWT,
  requireAuth,
  followUser
);

router.post(
  '/profile/:username/unfollow',
  authenticateCognitoJWT,
  requireAuth,
  unfollowUser
);

export default router;
