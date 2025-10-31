// sse.routes.js - Routes for Server-Sent Events
import express from 'express';
import { postUpdatesSSE } from '../controllers/sse.controller.js';

const router = express.Router();

// SSE endpoint for real-time post updates (no authentication required for public posts)
router.get('/events', postUpdatesSSE);

export default router;