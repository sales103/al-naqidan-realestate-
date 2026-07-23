import { Router } from 'express';
import { login, me, changePassword, logout, sendOtp, verifyOtp, resetPassword, updateProfile, verifyInvite, setPassword } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { loginRateLimit, otpSendRateLimit, otpVerifyRateLimit, authActionRateLimit } from '../middleware/security.middleware.js';
import { verifyTurnstile } from '../middleware/turnstile.middleware.js';

const router = Router();

router.post('/login',           loginRateLimit,   verifyTurnstile, login);
router.post('/send-otp',        otpSendRateLimit, verifyTurnstile, sendOtp);
router.post('/verify-otp',      otpVerifyRateLimit, verifyOtp);
router.post('/reset-password',  authActionRateLimit, resetPassword);
router.get( '/verify-invite',   verifyInvite);
router.post('/set-password',    authActionRateLimit, setPassword);
router.get( '/me',              authenticate, me);
router.post('/change-password', authenticate, changePassword);
router.put( '/profile',        authenticate, updateProfile);
router.post('/logout',          authenticate, logout);

export default router;
