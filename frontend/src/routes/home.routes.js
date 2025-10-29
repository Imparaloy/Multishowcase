import express from 'express';
import { getForYouPosts, getFollowingPosts } from '../controllers/home.controller.js';
import { authenticateCognitoJWT } from '../middlewares/authenticate.js';
const router = express.Router();

// Home (For you)
router.get('/', getForYouPosts);

// Following
router.get('/following', getFollowingPosts, authenticateCognitoJWT);

export default router;
