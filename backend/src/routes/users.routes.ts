import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { getDatabase } from '../database/connection.js';
import { audit } from '../services/audit.service.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import bcrypt from 'bcrypt';

const router = Router();
router.use(authenticate);

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

// POST /api/users — admin sets the employee's email + password directly.
// No email is ever sent — the admin hands the credentials to the employee
// themselves (in person, WhatsApp, whatever they prefer).
router.post('/', authorize('super_admin', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { full_name, full_name_ar, email, password, role, whatsapp_instance } = req.body as any;
    if (!email || !full_name) { res.status(400).json({ success: false, error: 'الاسم والبريد مطلوبة' }); return; }
    if (!password || String(password).length < 8) {
      res.status(400).json({ success: false, error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' });
      return;
    }
    const db = getDatabase();
    const exists = await db('users').whereRaw('LOWER(email) = ?', [String(email).trim().toLowerCase()]).first();
    if (exists) { res.status(400).json({ success: false, error: 'البريد الإلكتروني مستخدم بالفعل' }); return; }

    const hash = await bcrypt.hash(password, config.auth.bcryptRounds);
    const [user] = await db('users').insert({
      full_name, full_name_ar: full_name_ar ?? full_name,
      email: String(email).trim().toLowerCase(),
      password_hash: hash,
      role: role ?? 'sales_agent',
      whatsapp_instance: whatsapp_instance ?? null,
      is_active: true,
    }).returning(['id','full_name','full_name_ar','email','role','whatsapp_instance','is_active','created_at']);

    logger.info('User created by admin', { userId: user.id, email });
    await audit({ req, action: 'user.create', entityType: 'user', entityId: user.id, details: { email: user.email, role: user.role } });
    res.status(201).json({ success: true, data: user, message: 'تم إنشاء حساب الموظف' });
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

// DELETE /api/users/:id — permanently remove user
router.delete('/:id', authorize('super_admin', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const reqUser = (req as any).user;
    if (reqUser.user_id === id) { res.status(400).json({ success: false, error: 'لا يمكنك حذف حسابك' }); return; }
    const db = getDatabase();

    const target = await db('users').where('id', id).first();
    if (!target) { res.status(404).json({ success: false, error: 'المستخدم غير موجود' }); return; }
    if (target.role === 'super_admin' && reqUser.role !== 'super_admin') {
      res.status(403).json({ success: false, error: 'لا تملك صلاحية حذف حساب سوبر ادمن' });
      return;
    }
    // Never allow the last active super_admin to be removed — it would lock
    // everyone out of the admin surface permanently.
    if (target.role === 'super_admin') {
      const [{ count }] = await db('users')
        .where({ role: 'super_admin', is_active: true })
        .whereNot('id', id)
        .count('id as count') as any[];
      if (Number(count) === 0) {
        res.status(400).json({ success: false, error: 'لا يمكن حذف آخر حساب سوبر ادمن في النظام' });
        return;
      }
    }

    // Best-effort: detach the user's id from history rows so the delete never
    // trips an unexpected reference and the records survive as unattributed.
    // No DB-level FKs exist, so these are cosmetic cleanups, not requirements.
    for (const [table, col] of [['messages', 'sent_by'], ['system_settings', 'updated_by']] as const) {
      try { await db(table).where(col, id).update({ [col]: null }); } catch { /* column may not exist */ }
    }

    await db('users').where('id', id).del();
    await audit({ req, action: 'user.delete', entityType: 'user', entityId: String(id), details: { email: target.email, role: target.role } });
    res.json({ success: true, message: 'تم حذف المستخدم نهائياً' });
  } catch (error) { next(error); }
});

export default router;
