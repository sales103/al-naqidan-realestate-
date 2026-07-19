import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getDatabase } from '../database/connection.js';
import { AppError } from '../middleware/error.middleware.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// Only super_admin / admin can write settings
function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!['super_admin', 'admin'].includes((req as any).user?.role)) {
    throw new AppError(403, 'غير مصرح');
  }
  next();
}

// GET /api/settings — return all settings (value only, no secrets in plain text)
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const rows = await db('system_settings').select('key', 'value', 'description', 'updated_at');
    // Mask password fields
    const sanitized = rows.map((r: any) => {
      const val = { ...r.value };
      if (typeof val.password === 'string' && val.password) val.password = '••••••••';
      if (typeof val.smtp_password === 'string' && val.smtp_password) val.smtp_password = '••••••••';
      return { key: r.key, value: val, description: r.description, updated_at: r.updated_at };
    });
    res.json({ success: true, data: sanitized });
  } catch (error) { next(error); }
});

// GET /api/settings/:key
router.get('/:key', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const row = await db('system_settings').where('key', req.params['key']).first();
    if (!row) { res.json({ success: true, data: null }); return; }
    res.json({ success: true, data: row.value });
  } catch (error) { next(error); }
});

// PUT /api/settings/:key — upsert a setting
router.put('/:key', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { value, description } = z.object({
      value: z.record(z.any()),
      description: z.string().optional(),
    }).parse(req.body);

    const db = getDatabase();
    const userId = (req as any).user?.id;

    await db('system_settings')
      .insert({ key: req.params['key'], value: JSON.stringify(value), description, updated_by: userId, updated_at: new Date() })
      .onConflict('key')
      .merge(['value', 'description', 'updated_by', 'updated_at']);

    res.json({ success: true, message: 'تم حفظ الإعدادات' });
  } catch (error) { next(error); }
});

// POST /api/settings/test-email
router.post('/test-email', requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { to } = z.object({ to: z.string().email() }).parse(req.body);
    const { sendMail } = await import('../services/email.service.js');
    await sendMail(to, 'بريد تجريبي - نظام النقيدان', `
      <div dir="rtl" style="font-family:Arial,sans-serif;padding:32px;max-width:480px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;">
        <h2 style="color:#16a34a;">تم الإعداد بنجاح ✓</h2>
        <p>إعدادات البريد الإلكتروني تعمل بشكل صحيح.</p>
      </div>
    `);
    res.json({ success: true, message: 'تم إرسال البريد التجريبي' });
  } catch (error: any) {
    next(new AppError(500, error.message ?? 'فشل إرسال البريد'));
  }
});

export default router;