import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/index.js';
import type { AuthPayload, UserRole } from '../types/index.js';

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
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
