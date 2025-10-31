import express from 'express';
import {
  renderProfilePage,
  renderProfileEditPage,
  updateProfile,
  deleteAccount,
} from '../controllers/profile.controller.js';
import {
  authenticateCognitoJWT,
  requireAuth,
} from '../middlewares/authenticate.js';

const router = express.Router();

router.get('/profile', authenticateCognitoJWT, requireAuth, renderProfilePage);
router.get('/profile/:username', authenticateCognitoJWT, requireAuth, renderProfilePage);

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

export default router;
