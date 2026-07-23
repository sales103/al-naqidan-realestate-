import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { getDatabase } from '../database/connection.js';
import { cacheSet } from '../database/redis.js';
import { sendMail } from '../services/email.service.js';
import { audit } from '../services/audit.service.js';
import { getCompanyName } from '../controllers/auth.controller.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const router = Router();
router.use(authenticate);

function buildInviteEmail(companyName: string, fullName: string, link: string): string {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;">
  <h2 style="color:#1d4ed8;margin:0 0 8px;">${companyName}</h2>
  <p style="color:#374151;margin:0 0 20px;">مرحباً ${fullName}،</p>
  <p style="color:#374151;margin:0 0 24px;">تم إنشاء حسابك في نظام إدارة العقارات. لتفعيل حسابك، اضغط الزر أدناه لتعيين كلمة المرور:</p>
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${link}" style="background:#1d4ed8;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">تعيين كلمة المرور</a>
  </div>
  <p style="color:#6b7280;font-size:13px;">هذا الرابط صالح لمدة 7 أيام.</p>
  <p style="color:#9ca3af;font-size:12px;">إذا لم تطلب هذا، تجاهل هذا البريد.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
  <p style="color:#9ca3af;font-size:12px;">${companyName}</p>
</div>`;
}

// GET /api/users — list all users (active and inactive for admin view)
router.get('/', authorize('super_admin', 'admin', 'sales_manager'), async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const users = await db('users')
      .select('id','full_name','full_name_ar','email','role','whatsapp_instance','is_active','created_at','last_login_at')
      .orderBy('created_at', 'asc');
    res.json({ success: true, data: users });
  } catch (error) { next(error); }
});

// POST /api/users — create user (admin-initiated invite)
router.post('/', authorize('super_admin', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { full_name, full_name_ar, email, role, whatsapp_instance } = req.body as any;
    if (!email || !full_name) { res.status(400).json({ success: false, error: 'الاسم والبريد مطلوبة' }); return; }
    const db = getDatabase();
    const exists = await db('users').whereRaw('LOWER(email) = ?', [String(email).trim().toLowerCase()]).first();
    if (exists) { res.status(400).json({ success: false, error: 'البريد الإلكتروني مستخدم بالفعل' }); return; }

    // Generate invite token
    const token = crypto.randomBytes(32).toString('hex');
    await cacheSet(`invite:${token}`, { email: String(email).trim().toLowerCase(), full_name }, 604800); // 7 days

    const [user] = await db('users').insert({
      full_name, full_name_ar: full_name_ar ?? full_name,
      email: String(email).trim().toLowerCase(),
      password_hash: 'INVITE_PENDING',
      role: role ?? 'sales_agent',
      whatsapp_instance: whatsapp_instance ?? null,
      is_active: false,
    }).returning(['id','full_name','full_name_ar','email','role','whatsapp_instance','is_active','created_at']);

    // Send invite email
    const companyName = await getCompanyName();
    const frontendUrl = config.frontendUrl || 'https://al-naqidan-realestate.vercel.app';
    const link = `${frontendUrl}/set-password?token=${token}`;
    try {
      await sendMail(
        String(email).trim().toLowerCase(),
        `تفعيل حسابك - ${companyName}`,
        buildInviteEmail(companyName, full_name_ar ?? full_name, link),
      );
    } catch (err) {
      logger.error('Failed to send invite email', { error: err });
    }

    logger.info('User created with invite', { userId: user.id, email });
    await audit({ req, action: 'user.create', entityType: 'user', entityId: user.id, details: { email: user.email, role: user.role } });
    res.status(201).json({ success: true, data: user, message: 'تم إنشاء المستخدم وإرسال رابط تعيين كلمة المرور إلى بريده' });
  } catch (error) { next(error); }
});

// POST /api/users/:id/resend-invite — resend invite email
router.post('/:id/resend-invite', authorize('super_admin', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const user = await db('users').where('id', req.params['id']).first();
    if (!user) { res.status(404).json({ success: false, error: 'المستخدم غير موجود' }); return; }
    if (user.is_active && user.password_hash !== 'INVITE_PENDING') {
      res.status(400).json({ success: false, error: 'الموظف مفعّل بالفعل' });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    await cacheSet(`invite:${token}`, { email: user.email, full_name: user.full_name_ar ?? user.full_name }, 604800);

    const companyName = await getCompanyName();
    const frontendUrl = config.frontendUrl || 'https://al-naqidan-realestate.vercel.app';
    const link = `${frontendUrl}/set-password?token=${token}`;
    await sendMail(
      user.email,
      `تفعيل حسابك - ${companyName}`,
      buildInviteEmail(companyName, user.full_name_ar ?? user.full_name, link),
    );

    await audit({ req, action: 'user.invite_resend', entityType: 'user', entityId: user.id, details: { email: user.email } });
    res.json({ success: true, message: 'تم إعادة إرسال رابط الدعوة' });
  } catch (error) { next(error); }
});

// PUT /api/users/:id — update user
router.put('/:id', authorize('super_admin', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { full_name, full_name_ar, email, role, whatsapp_instance, is_active, password } = req.body as any;
    const db = getDatabase();
    const actor = (req as any).user;

    const target = await db('users').where('id', id).first();
    if (!target) { res.status(404).json({ success: false, error: 'المستخدم غير موجود' }); return; }

    if (target.role === 'super_admin' && actor.role !== 'super_admin') {
      res.status(403).json({ success: false, error: 'لا تملك صلاحية تعديل حساب سوبر ادمن' });
      return;
    }
    if (role === 'super_admin' && actor.role !== 'super_admin') {
      res.status(403).json({ success: false, error: 'لا تملك صلاحية منح صلاحية سوبر ادمن' });
      return;
    }

    const losesSuperAdmin = target.role === 'super_admin'
      && ((role && role !== 'super_admin') || is_active === false);
    if (losesSuperAdmin) {
      const [{ count }] = await db('users')
        .where({ role: 'super_admin', is_active: true })
        .whereNot('id', id)
        .count('id as count') as any[];
      if (Number(count) === 0) {
        res.status(400).json({ success: false, error: 'لا يمكن تعطيل آخر حساب سوبر ادمن في النظام' });
        return;
      }
    }

    if (is_active === false && actor.user_id === id) {
      res.status(400).json({ success: false, error: 'لا يمكنك تعطيل حسابك' });
      return;
    }

    const updates: any = { updated_at: new Date() };
    if (full_name) updates.full_name = full_name;
    if (full_name_ar) updates.full_name_ar = full_name_ar;
    if (email) {
      const normalised = String(email).trim().toLowerCase();
      const clash = await db('users').whereRaw('LOWER(email) = ?', [normalised]).whereNot('id', id).first();
      if (clash) { res.status(400).json({ success: false, error: 'البريد الإلكتروني مستخدم بالفعل' }); return; }
      updates.email = normalised;
    }
    if (role) updates.role = role;
    if (whatsapp_instance !== undefined) updates.whatsapp_instance = whatsapp_instance || null;
    if (is_active !== undefined) updates.is_active = is_active;
    if (password) updates.password_hash = await bcrypt.hash(password, config.auth.bcryptRounds);
    const [user] = await db('users').where('id', id).update(updates)
      .returning(['id','full_name','full_name_ar','email','role','whatsapp_instance','is_active']);
    if (!user) { res.status(404).json({ success: false, error: 'المستخدم غير موجود' }); return; }

    // Audit: record which fields changed — never the password value itself.
    const changed: Record<string, any> = {};
    for (const key of ['full_name', 'full_name_ar', 'email', 'role', 'whatsapp_instance', 'is_active'] as const) {
      if (key in updates && updates[key] !== target[key]) {
        changed[key] = { from: target[key] ?? null, to: updates[key] ?? null };
      }
    }
    if (password) changed['password_changed'] = true;
    await audit({ req, action: 'user.update', entityType: 'user', entityId: String(id), details: { email: user.email, ...changed } });

    res.json({ success: true, data: user, message: 'تم التحديث' });
  } catch (error) { next(error); }
});

// DELETE /api/users/:id — deactivate user
router.delete('/:id', authorize('super_admin', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const reqUser = (req as any).user;
    if (reqUser.user_id === id) { res.status(400).json({ success: false, error: 'لا يمكنك حذف حسابك' }); return; }
    const db = getDatabase();

    const target = await db('users').where('id', id).first();
    if (!target) { res.status(404).json({ success: false, error: 'المستخدم غير موجود' }); return; }
    if (target.role === 'super_admin' && reqUser.role !== 'super_admin') {
      res.status(403).json({ success: false, error: 'لا تملك صلاحية تعطيل حساب سوبر ادمن' });
      return;
    }
    if (target.role === 'super_admin') {
      const [{ count }] = await db('users')
        .where({ role: 'super_admin', is_active: true })
        .whereNot('id', id)
        .count('id as count') as any[];
      if (Number(count) === 0) {
        res.status(400).json({ success: false, error: 'لا يمكن تعطيل آخر حساب سوبر ادمن في النظام' });
        return;
      }
    }

    await db('users').where('id', id).update({ is_active: false, updated_at: new Date() });
    await audit({ req, action: 'user.delete', entityType: 'user', entityId: String(id), details: { email: target.email, role: target.role } });
    res.json({ success: true, message: 'تم تعطيل المستخدم' });
  } catch (error) { next(error); }
});

export default router;
