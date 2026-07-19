import dotenv from 'dotenv';
import path from 'path';

// Try both parent dir and current dir
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const optionalEnv = (key: string, defaultValue: string): string =>
  process.env[key] ?? defaultValue;

export const config = {
  app: {
    name: optionalEnv('APP_NAME', 'Al-Naqidan Real Estate AI'),
    version: optionalEnv('APP_VERSION', '1.0.0'),
    port: parseInt(process.env['PORT'] ?? optionalEnv('APP_PORT', '3000'), 10),
    url: optionalEnv('APP_URL', 'http://localhost:3000'),
    env: optionalEnv('NODE_ENV', 'development'),
    isProduction: optionalEnv('NODE_ENV', 'development') === 'production',
    isDevelopment: optionalEnv('NODE_ENV', 'development') === 'development',
  },

  auth: {
    jwtSecret: optionalEnv('JWT_SECRET', 'dev-secret-change-in-production-64-chars-minimum'),
    jwtExpiresIn: optionalEnv('JWT_EXPIRES_IN', '7d'),
    bcryptRounds: parseInt(optionalEnv('BCRYPT_ROUNDS', '12'), 10),
    webhookSecret: optionalEnv('WEBHOOK_SECRET', 'webhook-secret'),
  },

  database: {
    host: optionalEnv('DB_HOST', 'localhost'),
    port: parseInt(optionalEnv('DB_PORT', '5432'), 10),
    name: optionalEnv('DB_NAME', 'naqidan_realestate'),
    user: optionalEnv('DB_USER', 'naqidan_user'),
    password: optionalEnv('DB_PASSWORD', ''),
    ssl: optionalEnv('DB_SSL', 'false') === 'true',
    poolMin: parseInt(optionalEnv('DB_POOL_MIN', '2'), 10),
    poolMax: parseInt(optionalEnv('DB_POOL_MAX', '20'), 10),
  },

  redis: {
    host: optionalEnv('REDIS_HOST', 'localhost'),
    port: parseInt(optionalEnv('REDIS_PORT', '6379'), 10),
    password: optionalEnv('REDIS_PASSWORD', ''),
    ttl: parseInt(optionalEnv('REDIS_TTL', '3600'), 10),
    conversationTtl: parseInt(optionalEnv('REDIS_CONVERSATION_TTL', '86400'), 10),
  },

  openai: {
    apiKey: optionalEnv('GROQ_API_KEY', optionalEnv('OPENAI_API_KEY', '')),
    baseUrl: optionalEnv('GROQ_API_KEY', '') ? 'https://api.groq.com/openai/v1' : undefined,
    model: optionalEnv('OPENAI_MODEL', 'llama-3.3-70b-versatile'),
    visionModel: optionalEnv('OPENAI_VISION_MODEL', 'llama-3.2-11b-vision-preview'),
    whisperModel: optionalEnv('OPENAI_WHISPER_MODEL', 'whisper-large-v3'),
    maxTokens: parseInt(optionalEnv('OPENAI_MAX_TOKENS', '2000'), 10),
    temperature: parseFloat(optionalEnv('OPENAI_TEMPERATURE', '0.3')),
  },

  whatsapp: {
    evolutionUrl: optionalEnv('EVOLUTION_API_URL', 'http://localhost:8080'),
    evolutionApiKey: optionalEnv('EVOLUTION_API_KEY', ''),
    instanceName: optionalEnv('EVOLUTION_INSTANCE_NAME', 'naqidan-whatsapp'),
    phoneNumber: optionalEnv('WHATSAPP_PHONE_NUMBER', ''),
    // Public URL of THIS backend, used to register the Evolution webhook.
    // Falls back to Railway's public domain if BACKEND_URL isn't set explicitly.
    backendUrl:
      optionalEnv('BACKEND_URL', '') ||
      (process.env['RAILWAY_PUBLIC_DOMAIN']
        ? `https://${process.env['RAILWAY_PUBLIC_DOMAIN']}`
        : optionalEnv('RAILWAY_STATIC_URL', '')),
  },

  n8n: {
    url: optionalEnv('N8N_URL', 'http://localhost:5678'),
    webhookUrl: optionalEnv('N8N_WEBHOOK_URL', 'http://localhost:5678/webhook'),
  },

  storage: {
    type: optionalEnv('STORAGE_TYPE', 'local') as 'local' | 's3',
    localPath: optionalEnv('STORAGE_LOCAL_PATH', '/app/uploads'),
    maxFileSizeMb: parseInt(optionalEnv('MAX_FILE_SIZE_MB', '50'), 10),
    allowedImageTypes: optionalEnv('ALLOWED_IMAGE_TYPES', 'jpg,jpeg,png,webp').split(','),
    allowedVideoTypes: optionalEnv('ALLOWED_VIDEO_TYPES', 'mp4,mov,avi').split(','),
    allowedDocTypes: optionalEnv('ALLOWED_DOC_TYPES', 'pdf').split(','),
  },

  frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:5173'),

  smtp: {
    host: optionalEnv('SMTP_HOST', 'smtp.gmail.com'),
    port: parseInt(optionalEnv('SMTP_PORT', '587'), 10),
    user: optionalEnv('SMTP_USER', ''),
    password: optionalEnv('SMTP_PASSWORD', ''),
    from: optionalEnv('SMTP_FROM', 'noreply@naqidan.com'),
    adminEmail: optionalEnv('ADMIN_EMAIL', 'admin@naqidan.com'),
  },

  security: {
    corsOrigins: optionalEnv('CORS_ORIGINS', 'http://localhost:5173').split(','),
    rateLimitWindowMs: parseInt(optionalEnv('RATE_LIMIT_WINDOW_MS', '900000'), 10),
    rateLimitMaxRequests: parseInt(optionalEnv('RATE_LIMIT_MAX_REQUESTS', '100'), 10),
  },

  logging: {
    level: optionalEnv('LOG_LEVEL', 'info'),
    filePath: optionalEnv('LOG_FILE_PATH', './logs'),
    maxSize: optionalEnv('LOG_MAX_SIZE', '20m'),
    maxFiles: optionalEnv('LOG_MAX_FILES', '14d'),
  },
} as const;

export type Config = typeof config;
