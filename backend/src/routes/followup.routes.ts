import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getDatabase } from '../database/connection.js';

const router = Router();
router.use(authenticate);

router.get('/pending', async (_req, res, next) => {
  try {
    const db = getDatabase();
    const now = new Date();

    const followUps = await db('follow_ups as f')
      .join('clients as cl', 'f.client_id', 'cl.id')
      .select(
        'f.id as follow_up_id', 'f.follow_up_type',
        'cl.*'
      )
      .where('f.status', 'pending')
      .where('f.is_cancelled', false)
      .where('f.scheduled_at', '<=', now)
      .orderBy('f.scheduled_at');

    res.json({ success: true, data: followUps });
  } catch (error) { next(error); }
});

router.patch('/:id/complete', async (req, res, next) => {
  try {
    const db = getDatabase();
    await db('follow_ups').where('id', req.params['id']).update({
      status: 'sent',
      sent_at: new Date(),
    });
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const db = getDatabase();
    const { reason } = req.body as { reason?: string };
    await db('follow_ups').where('id', req.params['id']).update({
      is_cancelled: true,
      cancel_reason: reason ?? 'manual cancellation',
    });
    res.json({ success: true });
  } catch (error) { next(error); }
});

export default router;
