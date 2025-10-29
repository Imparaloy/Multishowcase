// frontend/src/routes/posts.routes.js
import express from 'express';
import { createPost, deletePost } from '../controllers/posts.controller.js';
import { authenticateCognitoJWT, requireAuth } from '../middlewares/authenticate.js';

const router = express.Router();

router.post('/api/posts', authenticateCognitoJWT, requireAuth, createPost);
router.delete('/api/posts/:id', authenticateCognitoJWT, requireAuth, deletePost);

export default router;