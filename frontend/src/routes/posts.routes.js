// frontend/src/routes/posts.routes.js
import express from 'express';
import { createPost, deletePost, getLatestPosts, toggleLike } from '../controllers/posts.controller.js';
import { authenticateCognitoJWT, requireAuth } from '../middlewares/authenticate.js';

const router = express.Router();

router.post('/api/posts', authenticateCognitoJWT, requireAuth, createPost);
router.delete('/api/posts/:id', authenticateCognitoJWT, requireAuth, deletePost);
router.post('/api/posts/:id/like', authenticateCognitoJWT, requireAuth, toggleLike);
router.get('/api/posts/latest', getLatestPosts);

export default router;