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
import type { User } from '../types/index.js';

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOtpEmail(to: string, otp: string, name?: string) {
  const greeting = name ? `<p style="color:#374151;margin:0 0 20px;">مرحباً ${name}،</p>` : '';
  await sendMail(
    to,
    `رمز التحقق: ${otp}`,
    `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;">
      <h2 style="color:#1d4ed8;margin:0 0 8px;">النقيدان للعقارات</h2>
      ${greeting}
      <p style="color:#374151;margin:0 0 24px;">رمز التحقق الخاص بك:</p>
      <div style="background:#f0f9ff;border:2px solid #bae6fd;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
        <span style="font-size:36px;font-weight:bold;color:#0369a1;letter-spacing:12px;">${otp}</span>
      </div>
      <p style="color:#6b7280;font-size:13px;">صالح لمدة 5 دقائق فقط. لا تشاركه مع أحد.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
      <p style="color:#9ca3af;font-size:12px;">شركة عبدالحكيم النقيدان للاستثمارات العقارية</p>
    </div>`
  );
}

// ─── Login ───────────────────────────────────────────────────────────────────
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = z.object({
      email: z.string().email(),
      password: z.string().min(6),
    }).parse(req.body);
    const db = getDatabase();

    const user = await db('users').where({ email }).first() as User | undefined;
    if (!user) throw new AppError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) throw new AppError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');

    if (!user.is_active) throw new AppError(403, 'حسابك قيد المراجعة — انتظر موافقة المدير للدخول');

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
        user: { id: user.id, email: user.email, full_name: user.full_name, full_name_ar: user.full_name_ar, role: user.role, avatar_url: user.avatar_url },
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
      .select('id', 'email', 'phone', 'full_name', 'full_name_ar', 'role', 'avatar_url', 'last_login_at', 'preferences')
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
  logger.info('User logged out', { userId: req.user?.user_id });
  res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
};

// ─── Send OTP ─────────────────────────────────────────────────────────────────
export const sendOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, purpose } = z.object({
      email: z.string().email('بريد إلكتروني غير صحيح'),
      purpose: z.enum(['register', 'reset']),
    }).parse(req.body);

    const db = getDatabase();
    const existing = await db('users').where('email', email).first() as User | undefined;

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
      email: z.string().email(),
      otp: z.string().length(6),
      purpose: z.enum(['register', 'reset']),
    }).parse(req.body);

    const stored = await cacheGet<string>(`otp:${purpose}:${email}`);
    if (!stored || stored !== otp) throw new AppError(400, 'رمز التحقق غير صحيح أو منتهي الصلاحية');

    await cacheDel(`otp:${purpose}:${email}`);
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
    const exists = await db('users').where('email', email).first();
    if (exists) throw new AppError(400, 'هذا البريد مسجل بالفعل');

    const hash = await bcrypt.hash(password, config.auth.bcryptRounds);
    const [user] = await db('users').insert({
      email,
      full_name,
      full_name_ar: full_name_ar ?? full_name,
      password_hash: hash,
      role: 'sales_agent',
      is_active: false,
    }).returning('*') as User[];

    await cacheDel(`verified:register:${verified_token}`);

    logger.info('New user registered (pending approval)', { userId: user.id, email: user.email });
    res.status(201).json({
      success: true,
      pending: true,
      message: 'تم إنشاء حسابك بنجاح — في انتظار موافقة المدير',
    });
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
    const user = await db('users').where({ email, is_active: true }).first() as User | undefined;
    if (!user) throw new AppError(404, 'المستخدم غير موجود');

    const hash = await bcrypt.hash(password, config.auth.bcryptRounds);
    await db('users').where('id', user.id).update({ password_hash: hash });
    await cacheDel(`verified:reset:${verified_token}`);

    logger.info('Password reset via OTP', { userId: user.id });
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error) { next(error); }
};

// ─── Forgot Password (legacy stub) ───────────────────────────────────────────
export const forgotPassword = async (_req: Request, res: Response): Promise<void> => {
  res.status(410).json({ success: false, error: 'استخدم /api/auth/send-otp' });
};