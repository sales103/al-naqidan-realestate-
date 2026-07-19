import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { getDatabase } from '../database/connection.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/error.middleware.js';
import type { User } from '../types/index.js';

function getMailer() {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.password },
  });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(6),
  new_password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
});

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const db = getDatabase();

    const user = await db('users').where({ email, is_active: true }).first() as User | undefined;
    if (!user) throw new AppError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) throw new AppError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');

    const token = jwt.sign(
      { user_id: user.id, email: user.email, role: user.role },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiresIn } as jwt.SignOptions
    );

    await db('users').where('id', user.id).update({ last_login_at: new Date() });

    logger.info('User logged in', { userId: user.id, email: user.email });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          full_name_ar: user.full_name_ar,
          role: user.role,
          avatar_url: user.avatar_url,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const user = await db('users')
      .where('id', req.user!.user_id)
      .select('id', 'email', 'phone', 'full_name', 'full_name_ar', 'role', 'avatar_url', 'last_login_at', 'preferences')
      .first() as User | undefined;

    if (!user) throw new AppError(404, 'User not found');
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { current_password, new_password } = changePasswordSchema.parse(req.body);
    const db = getDatabase();

    const user = await db('users').where('id', req.user!.user_id).first() as User;
    const isValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isValid) throw new AppError(400, 'كلمة المرور الحالية غير صحيحة');

    const hash = await bcrypt.hash(new_password, config.auth.bcryptRounds);
    await db('users').where('id', user.id).update({ password_hash: hash });

    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  // JWT stateless - client deletes token. Could add to blocklist if needed.
  logger.info('User logged out', { userId: req.user?.user_id });
  res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const db = getDatabase();

    const user = await db('users').where({ email, is_active: true }).first() as User | undefined;
    // Always respond success to avoid email enumeration
    if (!user) {
      res.json({ success: true, message: 'إذا كان البريد مسجلاً ستصلك رسالة خلال دقائق' });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db('users').where('id', user.id).update({
      password_reset_token: token,
      password_reset_expires: expires,
    });

    const frontendUrl = config.frontendUrl;
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    try {
      const mailer = getMailer();
      await mailer.sendMail({
        from: `"النقيدان للعقارات" <${config.smtp.from}>`,
        to: user.email,
        subject: 'إعادة تعيين كلمة المرور',
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
            <h2 style="color:#1d4ed8;margin-bottom:8px;">إعادة تعيين كلمة المرور</h2>
            <p style="color:#374151;">مرحباً ${user.full_name_ar ?? user.full_name}،</p>
            <p style="color:#374151;">تلقينا طلباً لإعادة تعيين كلمة مرور حسابك. اضغط على الزر أدناه:</p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${resetLink}" style="background:#1d4ed8;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
                إعادة تعيين كلمة المرور
              </a>
            </div>
            <p style="color:#6b7280;font-size:13px;">الرابط صالح لمدة ساعة واحدة فقط.</p>
            <p style="color:#6b7280;font-size:13px;">إذا لم تطلب هذا، تجاهل هذه الرسالة.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
            <p style="color:#9ca3af;font-size:12px;">شركة عبدالحكيم النقيدان للاستثمارات العقارية</p>
          </div>
        `,
      });
    } catch (mailErr) {
      logger.error('Failed to send reset email', { error: mailErr });
      throw new AppError(500, 'فشل إرسال البريد الإلكتروني، تأكد من إعدادات SMTP');
    }

    logger.info('Password reset email sent', { userId: user.id });
    res.json({ success: true, message: 'إذا كان البريد مسجلاً ستصلك رسالة خلال دقائق' });
  } catch (error) { next(error); }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, password } = z.object({
      token: z.string().min(1),
      password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'كلمة المرور يجب أن تحتوي حروف كبيرة وصغيرة وأرقام'),
    }).parse(req.body);

    const db = getDatabase();
    const user = await db('users')
      .where('password_reset_token', token)
      .where('password_reset_expires', '>', new Date())
      .where('is_active', true)
      .first() as User | undefined;

    if (!user) throw new AppError(400, 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية');

    const hash = await bcrypt.hash(password, config.auth.bcryptRounds);
    await db('users').where('id', user.id).update({
      password_hash: hash,
      password_reset_token: null,
      password_reset_expires: null,
    });

    logger.info('Password reset successful', { userId: user.id });
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح، يمكنك تسجيل الدخول الآن' });
  } catch (error) { next(error); }
};
