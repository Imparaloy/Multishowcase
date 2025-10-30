// sse.routes.js - Routes for Server-Sent Events
import express from 'express';
import { postUpdatesSSE } from '../controllers/sse.controller.js';
import { authenticateCognitoJWT } from '../middlewares/authenticate.js';

const router = express.Router();

// SSE endpoint for real-time post updates
router.get('/events', authenticateCognitoJWT, postUpdatesSSE);

export default router;