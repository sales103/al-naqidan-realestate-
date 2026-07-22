import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

export async function verifyTurnstile(req: Request, res: Response, next: NextFunction): Promise<void> {
  const secret = config.security.turnstileSecret;

  // Skip in dev or when not configured
  if (!secret || !config.app.isProduction) {
    next();
    return;
  }

  const token = req.body?.cf_turnstile_token as string | undefined;

  // If widget isn't loaded on the client yet, allow through
  if (!token) {
    next();
    return;
  }

  try {
    const form = new URLSearchParams();
    form.append('secret', secret);
    form.append('response', token);
    form.append('remoteip', req.ip ?? '');

    const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });

    const data = await cfRes.json() as { success: boolean; 'error-codes'?: string[] };

    if (!data.success) {
      logger.warn('Turnstile verification failed', { codes: data['error-codes'], ip: req.ip });
      res.status(400).json({ success: false, error: 'فشل التحقق الأمني — حاول مجدداً' });
      return;
    }

    next();
  } catch (err) {
    logger.error('Turnstile fetch error', { err });
    // Fail open if Cloudflare is unreachable — don't block legit users
    next();
  }
}
