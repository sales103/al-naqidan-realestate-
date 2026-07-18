import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';
import { config } from '../config/index.js';
import { ZodError } from 'zod';

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
