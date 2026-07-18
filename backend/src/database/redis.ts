import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

let redisClient: Redis | null = null;
let redisAvailable = false;

export const getRedis = (): Redis | null => redisClient;

export const isRedisAvailable = (): boolean => redisAvailable;

export const initRedis = async (): Promise<Redis | null> => {
  if (redisClient) return redisClient;

  // Skip Redis if host is localhost/redis and we're in production without explicit config
  const host = config.redis.host;
  if (config.app.isProduction && (host === 'localhost' || host === 'redis' || host === '127.0.0.1')) {
    logger.warn('Redis skipped in production (no valid host configured) — caching disabled');
    return null;
  }

  redisClient = new Redis({
    host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 5000,
  });

  redisClient.on('connect', () => { logger.info('Redis connected'); redisAvailable = true; });
  redisClient.on('error', (err) => logger.warn('Redis error (non-fatal)', { error: err.message }));

  try {
    await redisClient.connect();
    await redisClient.ping();
    redisAvailable = true;
    logger.info('Redis initialized successfully');
  } catch (error) {
    logger.warn('Redis unavailable — running without cache', { error });
    redisClient = null;
    redisAvailable = false;
  }

  return redisClient;
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    redisAvailable = false;
    logger.info('Redis connection closed');
  }
};

// Cache helpers — silently skip if Redis unavailable
export const cacheGet = async <T>(key: string): Promise<T | null> => {
  if (!redisClient || !redisAvailable) return null;
  try {
    const value = await redisClient.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch { return null; }
};

export const cacheSet = async <T>(key: string, value: T, ttlSeconds?: number): Promise<void> => {
  if (!redisClient || !redisAvailable) return;
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redisClient.setex(key, ttlSeconds, serialized);
    } else {
      await redisClient.set(key, serialized);
    }
  } catch { /* silent */ }
};

export const cacheDel = async (...keys: string[]): Promise<void> => {
  if (!redisClient || !redisAvailable || keys.length === 0) return;
  try { await redisClient.del(...keys); } catch { /* silent */ }
};

export const cacheKeys = {
  conversation: (chatId: string) => `conv:${chatId}`,
  clientProfile: (clientId: string) => `client:${clientId}`,
  propertySearch: (hash: string) => `search:${hash}`,
  propertyDetail: (id: string) => `prop:${id}`,
  userSession: (userId: string) => `session:${userId}`,
  rateLimit: (ip: string) => `rl:${ip}`,
  dashboardStats: () => `dashboard:stats`,
  cityList: () => `cities:all`,
};
