import express from 'express';
import { getForYouPosts, getFollowingPosts } from '../controllers/home.controller.js';
import { authenticateCognitoJWT, requireAuth } from '../middlewares/authenticate.js';
const router = express.Router();

// Home (For you)
router.get('/', authenticateCognitoJWT, requireAuth, getForYouPosts);


// Following
router.get('/following', authenticateCognitoJWT, requireAuth, getFollowingPosts);

export default router;
