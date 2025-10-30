// render.routes.js - Routes for rendering components
import express from 'express';
import { renderPost } from '../controllers/render.controller.js';
import { authenticateCognitoJWT } from '../middlewares/authenticate.js';

const router = express.Router();

// Endpoint to render a post component (for SSE updates)
router.post('/render-post', authenticateCognitoJWT, renderPost);

export default router;