import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getDatabase } from '../database/connection.js';

const router = Router();
router.use(authenticate);

// GET /api/notifications â€” list my unread notifications
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const userId = (req as any).user?.user_id;
    const notifications = await db('notifications')
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .limit(30);
    const unread = notifications.filter((n: any) => !n.read_at).length;
    res.json({ success: true, data: notifications, unread });
  } catch (error) { next(error); }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    await db('notifications').where('id', req.params['id']).update({ read_at: new Date() });
    res.json({ success: true });
  } catch (error) { next(error); }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const userId = (req as any).user?.user_id;
    await db('notifications').where('user_id', userId).whereNull('read_at').update({ read_at: new Date() });
    res.json({ success: true });
  } catch (error) { next(error); }
});

export default router;
