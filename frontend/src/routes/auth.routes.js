// /routes/auth.routes.js
import express from 'express';
const router = express.Router();
import { renderLogin, login, logout, renderSignup, signup } from '../controllers/auth.controller.js';

router.get('/signup', renderSignup);
router.post('/signup', signup);
router.post('/login', login);
router.get('/login', renderLogin);
router.post('/logout', logout);

export default router;
