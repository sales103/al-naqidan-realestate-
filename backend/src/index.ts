// Catch ALL errors early before any imports
process.on('uncaughtException', (err) => { console.error('[FATAL] uncaughtException:', err); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error('[FATAL] unhandledRejection:', err); process.exit(1); });
console.log('[BOOT] Starting Al-Naqidan backend...');

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { register as metricsRegister } from 'prom-client';
import { config } from './config/index.js';
import { logger } from './config/logger.js';
import { initDatabase } from './database/connection.js';
import { initRedis } from './database/redis.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';

const app = express();

// =============================================================================
// Security Middleware
// =============================================================================

app.use(helmet({
  contentSecurityPolicy: config.app.isProduction,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.security.corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-hub-signature-256'],
}));

app.use(rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMaxRequests,
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path === '/metrics',
}));

// =============================================================================
// General Middleware
// =============================================================================

app.use(compression());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(morgan('combined', {
  stream: { write: (message) => logger.http(message.trim()) },
  skip: (req) => req.path === '/health',
}));

// Static files
app.use('/uploads', express.static(config.storage.localPath, {
  maxAge: '7d',
  etag: true,
}));

// =============================================================================
// Routes
// =============================================================================

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: config.app.name,
    version: config.app.version,
    timestamp: new Date(),
    uptime: process.uptime(),
  });
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', metricsRegister.contentType);
  res.end(await metricsRegister.metrics());
});

app.use('/api', routes);

// =============================================================================
// Error Handling
// =============================================================================

app.use(notFound);
app.use(errorHandler);

// =============================================================================
// Bootstrap
// =============================================================================

const bootstrap = async (): Promise<void> => {
  try {
    logger.info(`Starting ${config.app.name} v${config.app.version}...`);

    await initDatabase();
    await initRedis();

    const server = app.listen(config.app.port, '0.0.0.0', () => {
      logger.info(`Server running on port ${config.app.port}`, {
        env: config.app.env,
        url: `http://0.0.0.0:${config.app.port}`,
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received, shutting down gracefully...`);
      server.close(async () => {
        const { closeDatabase } = await import('./database/connection.js');
        const { closeRedis } = await import('./database/redis.js');
        await Promise.all([closeDatabase(), closeRedis()]);
        logger.info('Server closed');
        process.exit(0);
      });

      // Force exit after 30s
      setTimeout(() => {
        logger.error('Force shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Bootstrap failed', { error });
    process.exit(1);
  }
};

bootstrap();

export default app;
