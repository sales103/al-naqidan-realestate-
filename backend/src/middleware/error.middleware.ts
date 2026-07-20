import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';
import { config } from '../config/index.js';
import { ZodError } from 'zod';
import multer from 'multer';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Multer rejects oversized/wrong-type uploads with its own error type. The
  // generic 500 handler below hides the message in production — a photo that
  // is "too large" or "wrong format" needs to reach the person uploading it.
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'حجم الصورة كبير جداً — الحد الأقصى 8 ميجابايت'
      : err.message;
    res.status(400).json({ success: false, error: message });
    return;
  }
  if (err.message?.includes('صيغة غير مدعومة')) {
    res.status(400).json({ success: false, error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
    return;
  }

  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    user_id: req.user?.user_id,
  });

  res.status(500).json({
    success: false,
    error: config.app.isProduction ? 'Internal server error' : err.message,
  });
};

export const notFound = (_req: Request, res: Response): void => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
};
