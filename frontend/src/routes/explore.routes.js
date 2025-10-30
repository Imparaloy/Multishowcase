import express from 'express';
import { attachUserToLocals } from '../middlewares/authenticate.js';
import { getExplorePage } from '../controllers/explore.controller.js';

const router = express.Router();

router.get('/explore', attachUserToLocals, getExplorePage);

export default router;
