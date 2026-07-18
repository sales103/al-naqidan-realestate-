import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { config } from './index.js';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  return `${ts} [${level}]: ${stack ?? message}${metaStr}`;
});

const fileTransport = new DailyRotateFile({
  filename: path.join(config.logging.filePath, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: config.logging.maxSize,
  maxFiles: config.logging.maxFiles,
  format: combine(timestamp(), errors({ stack: true }), json()),
});

const errorFileTransport = new DailyRotateFile({
  filename: path.join(config.logging.filePath, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: config.logging.maxSize,
  maxFiles: config.logging.maxFiles,
  level: 'error',
  format: combine(timestamp(), errors({ stack: true }), json()),
});

const transports: winston.transport[] = [fileTransport, errorFileTransport];

if (!config.app.isProduction) {
  transports.push(
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), errors({ stack: true }), devFormat),
    })
  );
}

export const logger = winston.createLogger({
  level: config.logging.level,
  defaultMeta: { service: 'al-naqidan-backend' },
  transports,
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(config.logging.filePath, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(config.logging.filePath, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
    }),
  ],
});

export const requestLogger = (req: any, res: any, duration: number): void => {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.originalUrl,
    status: res.statusCode,
    duration_ms: duration,
    ip: req.ip,
    user_id: req.user?.user_id,
  });
};
