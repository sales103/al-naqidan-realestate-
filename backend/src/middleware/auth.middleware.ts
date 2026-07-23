import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import type { AuthPayload, UserRole } from '../types/index.js';

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, config.auth.jwtSecret) as AuthPayload;
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return;
  }

  // The token alone is not enough. It stays valid for a day, so trusting it
  // outright meant deactivating an employee did not actually revoke their
  // access until it expired — and because authorize() reads the role from the
  // token, demoting someone had no effect either. One indexed lookup on the
  // primary key settles both, and refreshes the role to the current one.
  try {
    const { getDatabase } = await import('../database/connection.js');
    const user = await getDatabase()('users')
      .where('id', payload.user_id)
      .select('id', 'role', 'is_active')
      .first();

    if (!user || user.is_active === false) {
      res.status(401).json({ success: false, error: 'الحساب غير مفعّل — راجع الإدارة' });
      return;
    }
    req.user = { ...payload, role: user.role };
    next();
  } catch (err) {
    // A database blip must not lock every user out of the system; the token
    // was cryptographically valid, so fall back to it and log the gap.
    logger.warn('authenticate: user re-check skipped', { error: (err as any)?.message });
    req.user = payload;
    next();
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }
    next();
  };
};

export const verifyWebhook = (req: Request, res: Response, next: NextFunction): void => {
  const secret = config.auth.webhookSecret;
  const signature = req.headers['x-hub-signature-256'] as string | undefined;

  // Skip verification if no secret is configured (dev only)
  if (!secret || secret === 'webhook-secret') {
    if (config.app.isProduction) {
      res.status(401).json({ success: false, error: 'Webhook secret not configured' });
      return;
    }
    next();
    return;
  }

  if (!signature) {
    res.status(401).json({ success: false, error: 'Missing webhook signature' });
    return;
  }

  const body = JSON.stringify(req.body);
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expected);

  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    res.status(401).json({ success: false, error: 'Invalid webhook signature' });
    return;
  }

  next();
};

export const pagination = (req: Request, _res: Response, next: NextFunction): void => {
  const page = Math.max(1, parseInt(req.query['page'] as string ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string ?? '20', 10)));
  req.pagination = { page, limit, offset: (page - 1) * limit };
  next();
};
