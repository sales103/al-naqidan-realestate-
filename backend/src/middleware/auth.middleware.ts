import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
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
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!signature && config.app.isProduction) {
    res.status(401).json({ success: false, error: 'Missing webhook signature' });
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
