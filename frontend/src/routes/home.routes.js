// home.routes.js
import { Router } from 'express';
import { getForYouPosts, getFollowingPosts } from '../controllers/home.controller.js';
import { authenticateCognitoJWT, requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/',           authenticateCognitoJWT, requireAuth, getForYouPosts);
router.get('/following',  authenticateCognitoJWT, requireAuth, getFollowingPosts);

export default router;
