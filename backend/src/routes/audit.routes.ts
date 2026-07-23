import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { getDatabase } from '../database/connection.js';

const router = Router();
router.use(authenticate);

// GET /api/audit — activity log (سجل النشاطات), admins only
router.get('/', authorize('super_admin', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const page = Math.max(1, parseInt((req.query['page'] as string) ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt((req.query['limit'] as string) ?? '50', 10) || 50));
    const action = (req.query['action'] as string | undefined)?.trim();
    const userId = (req.query['user_id'] as string | undefined)?.trim();

    const base = db('audit_logs')
      .modify((q) => {
        if (action) q.where('action', action);
        if (userId) q.where('user_id', userId);
      });

    const [rows, [{ count }]] = await Promise.all([
      base.clone()
        .select('id', 'user_id', 'user_name', 'action', 'entity_type', 'entity_id', 'details', 'ip', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset((page - 1) * limit),
      base.clone().count('id as count') as Promise<any[]>,
    ]);

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total: Number(count), pages: Math.ceil(Number(count) / limit) },
    });
  } catch (error) { next(error); }
});

export default router;
