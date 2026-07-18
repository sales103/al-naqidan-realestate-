import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getDatabase } from '../database/connection.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/error.middleware.js';
import type { User } from '../types/index.js';

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
