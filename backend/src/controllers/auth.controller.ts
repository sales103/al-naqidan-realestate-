import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { getDatabase } from '../database/connection.js';
import { cacheGet, cacheSet, cacheDel } from '../database/redis.js';
import { sendMail } from '../services/email.service.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/error.middleware.js';
import {
  recordFailedLogin, isAccountLocked, clearFailedLogins,
  recordOtpFailure, clearOtpFailures,
  blacklistToken, logSuspicious,
} from '../middleware/security.middleware.js';
import type { User } from '../types/index.js';

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function getCompanyName(): Promise<string> {
  try {
    const db = getDatabase();
    const row = await db('system_settings').where('key', 'company').first();
    return row?.value?.name_ar ?? 'نظام إدارة العقارات';
  } catch { return 'نظام إدارة العقارات'; }
}

async function notifyAdmins(db: any, title: string, body: string): Promise<void> {
  try {
    const admins = await db('users')
      .whereIn('role', ['super_admin', 'admin'])
      .where('is_active', true)
      .select('id');
    if (!admins.length) return;
    await db('notifications').insert(
      admins.map((a: any) => ({
        user_id: a.id,
        notification_type: 'new_user_request',
        title,
        body,
        read_at: null,
        created_at: new Date(),
      }))
    );
  } catch { /* non-critical */ }
}

async function sendOtpEmail(to: string, otp: string, name?: string) {
  const companyName = await getCompanyName();
  const greeting = name ? `<p style="color:#374151;margin:0 0 20px;">مرحباً ${name}،</p>` : '';
  await sendMail(
    to,
    `رمز التحقق - ${companyName}`,
    `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;">
      <h2 style="color:#1d4ed8;margin:0 0 8px;">${companyName}</h2>
      ${greeting}
      <p style="color:#374151;margin:0 0 24px;">رمز التحقق الخاص بك:</p>
      <div style="background:#f0f9ff;border:2px solid #bae6fd;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
        <span style="font-size:36px;font-weight:bold;color:#0369a1;letter-spacing:12px;">${otp}</span>
      </div>
      <p style="color:#6b7280;font-size:13px;">صالح لمدة 5 دقائق فقط. لا تشاركه مع أحد.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
      <p style="color:#9ca3af;font-size:12px;">${companyName}</p>
    </div>`
  );
}

// ─── Login ───────────────────────────────────────────────────────────────────
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = z.object({
      email: z.string().email().transform((s) => s.trim().toLowerCase()),
      password: z.string().min(6),
    }).parse(req.body);
    const db = getDatabase();

    // Account lockout check
    if (await isAccountLocked(email)) {
      logSuspicious('login_locked_account', req, { email });
      throw new AppError(429, 'الحساب مقفل مؤقتاً بسبب محاولات كثيرة — انتظر 15 دقيقة');
    }

    const user = await db('users').whereRaw('LOWER(email) = ?', [email]).first() as User | undefined;
    if (!user) {
      await recordFailedLogin(email);
      logSuspicious('login_unknown_email', req, { email });
      throw new AppError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      await recordFailedLogin(email);
      logSuspicious('login_wrong_password', req, { email, userId: user.id });
      throw new AppError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }

    if (!user.is_active) throw new AppError(403, 'حسابك قيد المراجعة — انتظر موافقة المدير للدخول');

    // Clear lockout on successful login
    await clearFailedLogins(email);

    const token = jwt.sign(
      { user_id: user.id, email: user.email, role: user.role },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiresIn } as jwt.SignOptions
    );
    await db('users').where('id', user.id).update({ last_login_at: new Date() });
    logger.info('User logged in', { userId: user.id });

    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, full_name: user.full_name, full_name_ar: user.full_name_ar, role: user.role, avatar_url: user.avatar_url, whatsapp_instance: user.whatsapp_instance ?? null },
      },
    });
  } catch (error) { next(error); }
};

// ─── Me ──────────────────────────────────────────────────────────────────────
export const me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const user = await db('users')
      .where('id', req.user!.user_id)
      .select('id', 'email', 'phone', 'full_name', 'full_name_ar', 'role', 'avatar_url', 'last_login_at', 'preferences', 'whatsapp_instance')
      .first() as User | undefined;
    if (!user) throw new AppError(404, 'User not found');
    res.json({ success: true, data: user });
  } catch (error) { next(error); }
};

// ─── Change Password ──────────────────────────────────────────────────────────
export const changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { current_password, new_password } = z.object({
      current_password: z.string().min(6),
      new_password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
    }).parse(req.body);
    const db = getDatabase();
    const user = await db('users').where('id', req.user!.user_id).first() as User;
    const isValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isValid) throw new AppError(400, 'كلمة المرور الحالية غير صحيحة');
    const hash = await bcrypt.hash(new_password, config.auth.bcryptRounds);
    await db('users').where('id', user.id).update({ password_hash: hash });
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error) { next(error); }
};

// ─── Logout ──────────────────────────────────────────────────────────────────
export const logout = async (req: Request, res: Response): Promise<void> => {
  const token = req.headers.authorization?.slice(7);
  if (token) await blacklistToken(token);
  logger.info('User logged out', { userId: req.user?.user_id });
  res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
};

// ─── Send OTP ─────────────────────────────────────────────────────────────────
export const sendOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, purpose } = z.object({
      // Email is case-insensitive in practice. Normalising here keeps the
      // cache key, the user lookup and the stored row in agreement —
      // security.middleware lowercases its keys, so anything that skipped
      // normalisation here silently missed the matching entry.
      email: z.string().email('بريد إلكتروني غير صحيح').transform((s) => s.trim().toLowerCase()),
      purpose: z.enum(['register', 'reset']),
    }).parse(req.body);

    const db = getDatabase();
    const existing = await db('users').whereRaw('LOWER(email) = ?', [email]).first() as User | undefined;

    if (purpose === 'register' && existing) throw new AppError(400, 'هذا البريد الإلكتروني مسجل بالفعل');

    const otp = generateOtp();
    await cacheSet(`otp:${purpose}:${email}`, otp, 300);

    try {
      await sendOtpEmail(email, otp, existing?.full_name_ar ?? existing?.full_name);
    } catch (err) {
      logger.error('Failed to send OTP email', { error: err });
      throw new AppError(500, 'فشل إرسال البريد — تأكد من إعدادات البريد في لوحة التحكم');
    }

    logger.info('OTP sent', { email, purpose });
    res.json({ success: true, message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني' });
  } catch (error) { next(error); }
};

// ─── Verify OTP ───────────────────────────────────────────────────────────────
export const verifyOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, otp, purpose } = z.object({
      email: z.string().email().transform((s) => s.trim().toLowerCase()),
      otp: z.string().length(6),
      purpose: z.enum(['register', 'reset']),
    }).parse(req.body);

    const stored = await cacheGet<string>(`otp:${purpose}:${email}`);
    if (!stored || stored !== otp) {
      await recordOtpFailure(email, purpose); // throws after 5 failures + invalidates OTP
      logSuspicious('otp_wrong', req, { email, purpose });
      throw new AppError(400, 'رمز التحقق غير صحيح أو منتهي الصلاحية');
    }

    await cacheDel(`otp:${purpose}:${email}`);
    await clearOtpFailures(email, purpose);
    const verifiedToken = crypto.randomBytes(32).toString('hex');
    await cacheSet(`verified:${purpose}:${verifiedToken}`, email, 600);

    res.json({ success: true, verified_token: verifiedToken });
  } catch (error) { next(error); }
};

// ─── Register ─────────────────────────────────────────────────────────────────
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { verified_token, full_name, full_name_ar, password } = z.object({
      verified_token: z.string().min(1),
      full_name: z.string().min(2, 'الاسم مطلوب'),
      full_name_ar: z.string().optional(),
      password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'كلمة المرور يجب أن تحتوي حروف كبيرة وصغيرة وأرقام'),
    }).parse(req.body);

    const email = await cacheGet<string>(`verified:register:${verified_token}`);
    if (!email) throw new AppError(400, 'انتهت صلاحية جلسة التحقق، أعد إرسال الرمز');

    const db = getDatabase();
    const exists = await db('users').whereRaw('LOWER(email) = ?', [email]).first();
    if (exists) throw new AppError(400, 'هذا البريد مسجل بالفعل');

    const hash = await bcrypt.hash(password, config.auth.bcryptRounds);
    const inserted = await db('users').insert({
      email,
      full_name,
      full_name_ar: full_name_ar ?? full_name,
      password_hash: hash,
      role: 'sales_agent',
      is_active: false,
    }).returning('*') as User[];
    const user = inserted[0];
    if (!user) throw new AppError(500, 'فشل إنشاء الحساب');

    await cacheDel(`verified:register:${verified_token}`);

    // Notify all admins about the new registration request
    await notifyAdmins(db,
      'طلب انضمام جديد',
      `${user.full_name_ar ?? user.full_name} (${email}) طلب الانضمام للنظام — في انتظار موافقتك`
    );

    logger.info('New user registered (pending approval)', { userId: user.id, email: user.email });
    res.status(201).json({
      success: true,
      pending: true,
      message: 'تم إنشاء حسابك بنجاح — في انتظار موافقة المدير',
    });
  } catch (error) { next(error); }
};

// ─── Verify Invite Token ─────────────────────────────────────────────────────
export const verifyInvite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.query);
    const data = await cacheGet<{ email: string; full_name: string }>(`invite:${token}`);
    if (!data) {
      res.json({ valid: false });
      return;
    }
    res.json({ valid: true, email: data.email, full_name: data.full_name });
  } catch (error) { next(error); }
};

// ─── Set Password (invite flow) ──────────────────────────────────────────────
export const setPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, password } = z.object({
      token: z.string().min(1),
      password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'كلمة المرور يجب أن تحتوي حروف كبيرة وصغيرة وأرقام'),
    }).parse(req.body);

    const data = await cacheGet<{ email: string; full_name: string }>(`invite:${token}`);
    if (!data) throw new AppError(400, 'الرابط منتهي أو غير صالح');

    const db = getDatabase();
    const user = await db('users').whereRaw('LOWER(email) = ?', [data.email.toLowerCase()]).first() as User | undefined;
    if (!user) throw new AppError(404, 'المستخدم غير موجود');

    const hash = await bcrypt.hash(password, config.auth.bcryptRounds);
    await db('users').where('id', user.id).update({ password_hash: hash, is_active: true, updated_at: new Date() });
    await cacheDel(`invite:${token}`);

    logger.info('User set password via invite', { userId: user.id, email: data.email });
    res.json({ success: true, message: 'تم تعيين كلمة المرور بنجاح — يمكنك الآن تسجيل الدخول' });
  } catch (error) { next(error); }
};

// ─── Reset Password ───────────────────────────────────────────────────────────
export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { verified_token, password } = z.object({
      verified_token: z.string().min(1),
      password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'كلمة المرور يجب أن تحتوي حروف كبيرة وصغيرة وأرقام'),
    }).parse(req.body);

    const email = await cacheGet<string>(`verified:reset:${verified_token}`);
    if (!email) throw new AppError(400, 'انتهت صلاحية جلسة التحقق، أعد إرسال الرمز');

    const db = getDatabase();
    const user = await db('users').whereRaw('LOWER(email) = ?', [email]).where('is_active', true).first() as User | undefined;
    if (!user) throw new AppError(404, 'المستخدم غير موجود');

    const hash = await bcrypt.hash(password, config.auth.bcryptRounds);
    await db('users').where('id', user.id).update({ password_hash: hash });
    await cacheDel(`verified:reset:${verified_token}`);

    logger.info('Password reset via OTP', { userId: user.id });
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error) { next(error); }
};

// ─── Update Profile ──────────────────────────────────────────────────────────
export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = z.object({
      full_name: z.string().min(2).optional(),
      full_name_ar: z.string().min(2).optional(),
      email: z.string().email().transform((s) => s.trim().toLowerCase()).optional(),
      phone: z.string().optional(),
      avatar_url: z.string().url().optional().nullable(),
    }).parse(req.body);

    const db = getDatabase();
    const userId = req.user!.user_id;

    // Validate email uniqueness if changed
    if (body.email) {
      const existing = await db('users')
        .whereRaw('LOWER(email) = ?', [body.email])
        .whereNot('id', userId)
        .first();
      if (existing) throw new AppError(400, 'هذا البريد الإلكتروني مستخدم بالفعل');
    }

    const updateData: Record<string, any> = {};
    if (body.full_name !== undefined) updateData.full_name = body.full_name;
    if (body.full_name_ar !== undefined) updateData.full_name_ar = body.full_name_ar;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.avatar_url !== undefined) updateData.avatar_url = body.avatar_url;

    if (Object.keys(updateData).length === 0) {
      throw new AppError(400, 'لم يتم تقديم أي بيانات للتحديث');
    }

    updateData.updated_at = new Date();

    await db('users').where('id', userId).update(updateData);

    const updated = await db('users')
      .where('id', userId)
      .select('id', 'email', 'phone', 'full_name', 'full_name_ar', 'role', 'avatar_url', 'whatsapp_instance')
      .first();

    logger.info('Profile updated', { userId });
    res.json({ success: true, data: updated });
  } catch (error) { next(error); }
};

// ─── Forgot Password (legacy stub) ───────────────────────────────────────────
export const forgotPassword = async (_req: Request, res: Response): Promise<void> => {
  res.status(410).json({ success: false, error: 'استخدم /api/auth/send-otp' });
};