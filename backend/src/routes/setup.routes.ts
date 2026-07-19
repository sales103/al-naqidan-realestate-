import { Router, Request, Response, NextFunction } from 'express';
import { setupRateLimit } from '../middleware/security.middleware.js';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { getDatabase } from '../database/connection.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/error.middleware.js';

const router = Router();

async function isSetupDone(): Promise<boolean> {
  try {
    const db = getDatabase();
    const row = await db('system_settings').where('key', 'setup_completed').first();
    return row?.value?.completed === true;
  } catch { return false; }
}

// GET /api/setup/status — public
router.get('/status', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const completed = await isSetupDone();
    res.json({ success: true, completed });
  } catch (error) { next(error); }
});

// POST /api/setup/init — runs ONCE, creates first super_admin + saves settings
router.post('/init', setupRateLimit, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (await isSetupDone()) throw new AppError(400, 'تم الإعداد مسبقاً');

    const body = z.object({
      // Admin account
      admin_name:     z.string().min(2),
      admin_email:    z.string().email(),
      admin_password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
      // Company
      company_name_ar: z.string().min(2),
      company_name_en: z.string().optional(),
      company_phone:   z.string().optional(),
      company_address: z.string().optional(),
      // SMTP (optional at setup — can be configured later)
      smtp_host:     z.string().optional(),
      smtp_port:     z.coerce.number().optional(),
      smtp_user:     z.string().optional(),
      smtp_password: z.string().optional(),
      smtp_from:     z.string().optional(),
      smtp_from_name: z.string().optional(),
    }).parse(req.body);

    const db = getDatabase();

    // Check no users exist yet (extra safety)
    const userCount = await db('users').count('id as c').first() as { c: string };
    if (parseInt(userCount.c) > 0) {
      throw new AppError(400, 'يوجد مستخدمون بالفعل — تم الإعداد مسبقاً');
    }

    // 1. Create super_admin
    const hash = await bcrypt.hash(body.admin_password, config.auth.bcryptRounds);
    await db('users').insert({
      email:        body.admin_email,
      full_name:    body.admin_name,
      full_name_ar: body.admin_name,
      password_hash: hash,
      role:         'super_admin',
      is_active:    true,
    });

    // 2. Save company settings
    await db('system_settings')
      .insert({ key: 'company', value: JSON.stringify({
        name_ar:  body.company_name_ar,
        name:     body.company_name_en ?? body.company_name_ar,
        phone:    body.company_phone   ?? '',
        address:  body.company_address ?? '',
      }), description: 'بيانات الشركة', updated_at: new Date() })
      .onConflict('key').merge(['value', 'updated_at']);

    // 3. Save SMTP if provided
    if (body.smtp_host && body.smtp_user && body.smtp_password) {
      await db('system_settings')
        .insert({ key: 'smtp', value: JSON.stringify({
          host:      body.smtp_host,
          port:      body.smtp_port ?? 587,
          user:      body.smtp_user,
          password:  body.smtp_password,
          from:      body.smtp_from      ?? body.smtp_user,
          from_name: body.smtp_from_name ?? body.company_name_ar,
        }), description: 'إعدادات البريد', updated_at: new Date() })
        .onConflict('key').merge(['value', 'updated_at']);
    }

    // 4. Mark setup complete
    await db('system_settings')
      .insert({ key: 'setup_completed', value: JSON.stringify({ completed: true, completed_at: new Date() }), description: 'حالة الإعداد', updated_at: new Date() })
      .onConflict('key').merge(['value', 'updated_at']);

    logger.info('System setup completed', { admin: body.admin_email });
    res.json({ success: true, message: 'تم إعداد النظام بنجاح' });
  } catch (error) { next(error); }
});

export default router;