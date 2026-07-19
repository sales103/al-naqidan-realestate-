import { Router } from 'express';
import { login, me, changePassword, logout, sendOtp, verifyOtp, register, resetPassword } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login',           login);
router.post('/send-otp',        sendOtp);
router.post('/verify-otp',      verifyOtp);
router.post('/register',        register);
router.post('/reset-password',  resetPassword);
router.get( '/me',              authenticate, me);
router.post('/change-password', authenticate, changePassword);
router.post('/logout',          authenticate, logout);

export default router;