import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { getDatabase } from '../database/connection.js';
import bcrypt from 'bcrypt';
import { config } from '../config/index.js';

const router = Router();
router.use(authenticate);

// GET /api/users — list all users (admin/manager)
router.get('/', authorize('super_admin', 'admin', 'sales_manager'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const users = await db('users')
      .select('id','full_name','full_name_ar','email','role','whatsapp_instance','is_active','created_at','last_login_at')
      .orderBy('created_at', 'asc');
    res.json({ success: true, data: users });
  } catch (error) { next(error); }
});

// POST /api/users — create user
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
    const updates: any = { updated_at: new Date() };
    if (full_name) updates.full_name = full_name;
    if (full_name_ar) updates.full_name_ar = full_name_ar;
    if (email) updates.email = email;
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
    if (reqUser.id === id) { res.status(400).json({ success: false, error: 'لا يمكنك حذف حسابك' }); return; }
    const db = getDatabase();
    await db('users').where('id', id).update({ is_active: false, updated_at: new Date() });
    res.json({ success: true, message: 'تم تعطيل المستخدم' });
  } catch (error) { next(error); }
});

export default router;