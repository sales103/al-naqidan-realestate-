import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { cacheGet, cacheSet, cacheDel } from '../database/redis.js';
import { logger } from '../config/logger.js';
import { AppError } from './error.middleware.js';

// ─── Request ID ───────────────────────────────────────────────────────────────
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const id = crypto.randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-ID', id);
  next();
};

// ─── Rate limiters ────────────────────────────────────────────────────────────
const makeRateLimit = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    message: { success: false, error: message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? req.socket.remoteAddress ?? 'unknown',
  });

// Login: 100 attempts / 15 min per IP
export const loginRateLimit = makeRateLimit(
  15 * 60 * 1000, 100,
  'محاولات كثيرة — انتظر 15 دقيقة'
);

// OTP send: 3 sends / 10 min per IP
export const otpSendRateLimit = makeRateLimit(
  10 * 60 * 1000, 3,
  'تجاوزت الحد — انتظر 10 دقائق قبل إعادة الإرسال'
);

// OTP verify: 5 attempts / 10 min per IP
export const otpVerifyRateLimit = makeRateLimit(
  10 * 60 * 1000, 5,
  'محاولات OTP كثيرة — انتظر 10 دقائق'
);

// Setup: 5 attempts / hour (one-time endpoint)
export const setupRateLimit = makeRateLimit(
  60 * 60 * 1000, 5,
  'محاولات كثيرة على الإعداد'
);

// ─── Account lockout ──────────────────────────────────────────────────────────
const LOCKOUT_THRESHOLD = 5;           // attempts before lock
const LOCKOUT_TTL       = 15 * 60;    // 15 min in seconds
const ATTEMPT_TTL       = 10 * 60;    // track attempts for 10 min

export async function recordFailedLogin(email: string): Promise<void> {
  const key = `login_fail:${email.toLowerCase()}`;
  const raw = await cacheGet<number>(key);
  const attempts = (raw ?? 0) + 1;
  await cacheSet(key, attempts, ATTEMPT_TTL);

  if (attempts >= LOCKOUT_THRESHOLD) {
    await cacheSet(`lockout:${email.toLowerCase()}`, true, LOCKOUT_TTL);
    logger.warn('Account locked after failed attempts', { email, attempts });
  }
}

export async function isAccountLocked(email: string): Promise<boolean> {
  const locked = await cacheGet<boolean>(`lockout:${email.toLowerCase()}`);
  return locked === true;
}

export async function clearFailedLogins(email: string): Promise<void> {
  await cacheDel(`login_fail:${email.toLowerCase()}`);
  await cacheDel(`lockout:${email.toLowerCase()}`);
}

// ─── OTP attempt counter ─────────────────────────────────────────────────────
const OTP_MAX_ATTEMPTS = 5;
const OTP_ATTEMPT_TTL  = 10 * 60; // 10 min

export async function recordOtpFailure(email: string, purpose: string): Promise<void> {
  const key = `otp_fail:${purpose}:${email.toLowerCase()}`;
  const raw = await cacheGet<number>(key);
  const attempts = (raw ?? 0) + 1;
  await cacheSet(key, attempts, OTP_ATTEMPT_TTL);

  if (attempts >= OTP_MAX_ATTEMPTS) {
    // Invalidate the OTP itself to prevent further guessing
    await cacheDel(`otp:${purpose}:${email.toLowerCase()}`);
    logger.warn('OTP invalidated after max failed attempts', { email, purpose, attempts });
    throw new AppError(429, 'تجاوزت الحد المسموح من المحاولات — أعد إرسال رمز جديد');
  }
}

export async function clearOtpFailures(email: string, purpose: string): Promise<void> {
  await cacheDel(`otp_fail:${purpose}:${email.toLowerCase()}`);
}

// ─── JWT token blacklist (logout) ─────────────────────────────────────────────
const TOKEN_BLACKLIST_TTL = 7 * 24 * 60 * 60; // 7 days (match JWT expiry)

export async function blacklistToken(token: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await cacheSet(`blacklist:${hash}`, true, TOKEN_BLACKLIST_TTL);
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return (await cacheGet<boolean>(`blacklist:${hash}`)) === true;
}

// ─── Token blacklist check middleware ─────────────────────────────────────────
export const checkTokenBlacklist = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) { next(); return; }
  const token = authHeader.slice(7);
  if (await isTokenBlacklisted(token)) {
    res.status(401).json({ success: false, error: 'الجلسة منتهية — سجّل الدخول مجدداً' });
    return;
  }
  next();
};

// ─── Suspicious activity logger ───────────────────────────────────────────────
export const logSuspicious = (event: string, req: Request, extra?: object): void => {
  logger.warn(`[SECURITY] ${event}`, {
    ip:       req.ip ?? req.socket.remoteAddress,
    ua:       req.headers['user-agent'],
    path:     req.originalUrl,
    method:   req.method,
    reqId:    req.headers['x-request-id'],
    ...extra,
  });
};

// ─── Metrics endpoint guard ───────────────────────────────────────────────────
export const metricsGuard = (req: Request, res: Response, next: NextFunction): void => {
  const ip = req.ip ?? req.socket.remoteAddress ?? '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  const apiKey  = req.headers['x-metrics-key'];
  const envKey  = process.env['METRICS_API_KEY'];

  if (isLocal || (envKey && apiKey === envKey)) { next(); return; }
  res.status(403).json({ success: false, error: 'Forbidden' });
};