import { Router } from 'express';
import { login, me, changePassword, logout, sendOtp, verifyOtp, register, resetPassword } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { loginRateLimit, otpSendRateLimit, otpVerifyRateLimit } from '../middleware/security.middleware.js';

const router = Router();

router.post('/login',           loginRateLimit,    login);
router.post('/send-otp',        otpSendRateLimit,  sendOtp);
router.post('/verify-otp',      otpVerifyRateLimit, verifyOtp);
router.post('/register',        register);
router.post('/reset-password',  resetPassword);
router.get( '/me',              authenticate, me);
router.post('/change-password', authenticate, changePassword);
router.post('/logout',          authenticate, logout);

export default router;