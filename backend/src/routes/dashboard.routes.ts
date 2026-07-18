import { Router } from 'express';
import { getDashboardStats, getRecentActivity } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.get('/stats', getDashboardStats);
router.get('/activity', getRecentActivity);

export default router;
