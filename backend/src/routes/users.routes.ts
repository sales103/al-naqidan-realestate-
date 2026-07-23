import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { getDatabase } from '../database/connection.js';
import bcrypt from 'bcrypt';
import { config } from '../config/index.js';

const router = Router();
router.use(authenticate);

// GET /api/users — list active users
router.get('/', authorize('super_admin', 'admin', 'sales_manager'), async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const users = await db('users')
      .select('id','full_name','full_name_ar','email','role','whatsapp_instance','is_active','created_at','last_login_at')
      .where('is_active', true)
      .orderBy('created_at', 'asc');
    res.json({ success: true, data: users });
  } catch (error) { next(error); }
});

// GET /api/users/pending — pending approval
router.get('/pending', authorize('super_admin', 'admin', 'sales_manager'), async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const users = await db('users')
      .select('id','full_name','full_name_ar','email','role','created_at')
      .where('is_active', false)
      .orderBy('created_at', 'desc');
    res.json({ success: true, data: users });
  } catch (error) { next(error); }
});

// POST /api/users/:id/approve
router.post('/:id/approve', authorize('super_admin', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const { role } = req.body as { role?: string };
    const updates: any = { is_active: true, updated_at: new Date() };
    if (role) updates.role = role;
    const [user] = await db('users').where('id', req.params['id']).update(updates)
      .returning(['id','full_name','full_name_ar','email','role','is_active']);
    if (!user) { res.status(404).json({ success: false, error: 'المستخدم غير موجود' }); return; }
    res.json({ success: true, data: user, message: 'تم قبول الموظف' });
  } catch (error) { next(error); }
});

// POST /api/users/:id/reject — hard delete pending user
router.post('/:id/reject', authorize('super_admin', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    await db('users').where({ id: req.params['id'], is_active: false }).delete();
    res.json({ success: true, message: 'تم رفض الطلب وحذف الحساب' });
  } catch (error) { next(error); }
});

// POST /api/users — create user (admin-created, active immediately)
router.post('/', authorize('super_admin', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { full_name, full_name_ar, email, password, role, whatsapp_instance } = req.body as any;
    if (!email || !password || !full_name) { res.status(400).json({ success: false, error: 'الاسم والبريد وكلمة المرور مطلوبة' }); return; }
    const db = getDatabase();
    const exists = await db('users').where('email', email).first();
    if (exists) { res.status(400).json({ success: false, error: 'البريد الإلكتروني مستخدم بالفعل' }); return; }
    const hash = await bcrypt.hash(password, config.auth.bcryptRounds);
    const [user] = await db('users').insert({
      full_name, full_name_ar: full_name_ar ?? full_name, email,
      password_hash: hash, role: role ?? 'sales_agent',
      whatsapp_instance: whatsapp_instance ?? null,
      is_active: true,
    }).returning(['id','full_name','full_name_ar','email','role','whatsapp_instance','is_active','created_at']);
    res.status(201).json({ success: true, data: user, message: 'تم إنشاء المستخدم' });
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

    // An admin could otherwise reset the super_admin's password and sign in as
    // them, or promote themselves — this route already accepts both `role` and
    // `password` for any account.
    if (target.role === 'super_admin' && actor.role !== 'super_admin') {
      res.status(403).json({ success: false, error: 'لا تملك صلاحية تعديل حساب سوبر ادمن' });
      return;
    }
    if (role === 'super_admin' && actor.role !== 'super_admin') {
      res.status(403).json({ success: false, error: 'لا تملك صلاحية منح صلاحية سوبر ادمن' });
      return;
    }

    // Deactivating or demoting the last super_admin leaves nobody able to
    // perform super_admin actions, with no way back through the UI.
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
      // Login looks the address up case-insensitively, so two rows differing
      // only in case would make which account you reach arbitrary.
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
    res.json({ success: true, message: 'تم تعطيل المستخدم' });
  } catch (error) { next(error); }
});

export default router;