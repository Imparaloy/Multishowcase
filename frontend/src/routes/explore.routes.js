import express from 'express';
import { attachUserToLocals } from '../middlewares/authenticate.js';
import { getExplorePage, getExploreFeed } from '../controllers/explore.controller.js';

const router = express.Router();

router.get('/explore', attachUserToLocals, getExplorePage);
router.get('/explore/feed', attachUserToLocals, getExploreFeed);

export default router;
