// /routes/auth.routes.js
import express from 'express';
const router = express.Router();
import {
	renderLogin,
	login,
	logout,
	renderSignup,
	signup,
	renderConfirm,
	confirm,
	renderForgotPassword,
	requestPasswordReset,
	renderForgotPasswordConfirm,
	confirmPasswordReset,
} from '../controllers/auth.controller.js';

router.get('/signup', renderSignup);
router.post('/signup', signup);
router.post('/login', login);
router.get('/login', renderLogin);
router.post('/logout', logout);
// Confirm sign-up (user enters code from email)
router.get('/confirm', renderConfirm);
router.post('/confirm', confirm);

router.get('/forgot-password', renderForgotPassword);
router.post('/forgot-password', requestPasswordReset);
router.get('/forgot-password/confirm', renderForgotPasswordConfirm);
router.post('/forgot-password/confirm', confirmPasswordReset);

export default router;
