// frontend/src/routes/posts.routes.js
import express from 'express';
import { createPost } from '../controllers/posts.controller.js';

const router = express.Router();

router.post('/api/posts', createPost);

export default router;