// Catch ALL errors early before any imports
// An uncaught exception leaves the process in genuinely unknown state, so
// exiting and letting the platform restart is right.
process.on('uncaughtException', (err) => { console.error('[FATAL] uncaughtException:', err); process.exit(1); });

// A rejected promise does NOT justify the same response. This service handles
// every customer's WhatsApp conversation in one process, and much of that work
// is deliberately fire-and-forget (delivery receipts, analytics, typing
// indicators). Exiting on one stray rejection turned a single customer's edge
// case into a total outage for everyone, plus a restart loop if it recurred.
// Log it loudly — with the stack, so it still gets fixed — and keep serving.
process.on('unhandledRejection', (reason: unknown) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error('[unhandledRejection] service kept running:', err.stack ?? err.message);
});
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
import { runMigrations } from './database/migrate.js';
import { initRedis } from './database/redis.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { requestId, checkTokenBlacklist, metricsGuard } from './middleware/security.middleware.js';

const app = express();

// Trust Railway/Vercel reverse proxy
app.set('trust proxy', 1);

// =============================================================================
// Security Middleware
// =============================================================================

app.use(requestId);

app.use(helmet({
  contentSecurityPolicy: config.app.isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc:    ["'self'", "data:"],
      objectSrc:  ["'none'"],
      frameAncestors: ["'none'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  hsts: config.app.isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Check JWT blacklist on all authenticated routes
app.use('/api', checkTokenBlacklist);

// Allow the configured origins plus this project's Vercel domains
// (production + preview deployments have generated *.vercel.app subdomains).
const VERCEL_PROJECT = /^https:\/\/al-naqidan-realestate[a-z0-9-]*\.vercel\.app$/;
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.security.corsOrigins.includes(origin) || VERCEL_PROJECT.test(origin)) {
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
  skip: (req) =>
    req.path === '/health' ||
    req.path === '/metrics' ||
    // Every WhatsApp webhook arrives from Evolution's single server IP, so a
    // global IP limiter counts all customers into one bucket — on a busy day
    // it 429s Evolution and the bot goes silent for everyone. The pipeline has
    // its own per-customer rate limiting (see conversation.service), so exempt
    // the webhook here.
    req.path.startsWith('/api/webhooks'),
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

app.get('/metrics', metricsGuard, async (_req, res) => {
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

    // Security sanity checks at boot
    if (config.auth.jwtSecret.length < 32) {
      logger.error('[SECURITY] JWT_SECRET is too short (< 32 chars) — set a strong secret in Railway env vars!');
      if (config.app.isProduction) process.exit(1);
    }
    if (config.auth.jwtSecret.includes('dev-secret') || config.auth.jwtSecret.includes('change-in-production')) {
      logger.error('[SECURITY] JWT_SECRET is using the default dev value — change it immediately!');
      if (config.app.isProduction) process.exit(1);
    }

    await initDatabase();
    // Apply any pending schema migrations before serving traffic. A failure
    // here is logged but non-fatal: an idempotent column-add going wrong
    // shouldn't take down an otherwise healthy deploy, and the app already
    // tolerates missing columns defensively (see propertyService).
    try {
      await runMigrations();
    } catch (e) {
      logger.error('Migrations failed on boot — continuing to serve', { error: (e as any)?.message });
    }
    await initRedis();
    startScheduler();

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
        stopScheduler();
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
