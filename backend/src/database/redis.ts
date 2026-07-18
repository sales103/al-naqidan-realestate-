import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

let redisClient: Redis | null = null;

export const getRedis = (): Redis => {
  if (!redisClient) throw new Error('Redis not initialized. Call initRedis() first.');
  return redisClient;
};

export const initRedis = async (): Promise<Redis> => {
  if (redisClient) return redisClient;

  redisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    enableOfflineQueue: true,
    connectTimeout: 10000,
  });

  redisClient.on('connect', () => logger.info('Redis connected'));
  redisClient.on('error', (err) => logger.error('Redis error', { error: err.message }));
  redisClient.on('reconnecting', () => logger.warn('Redis reconnecting...'));

  try {
    await redisClient.ping();
    logger.info('Redis initialized successfully');
  } catch (error) {
    logger.error('Redis connection failed', { error });
    throw error;
  }

  return redisClient;
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
};

// Cache helpers
export const cacheGet = async <T>(key: string): Promise<T | null> => {
  const redis = getRedis();
  const value = await redis.get(key);
  return value ? (JSON.parse(value) as T) : null;
};

export const cacheSet = async <T>(key: string, value: T, ttlSeconds?: number): Promise<void> => {
  const redis = getRedis();
  const serialized = JSON.stringify(value);
  if (ttlSeconds) {
    await redis.setex(key, ttlSeconds, serialized);
  } else {
    await redis.set(key, serialized);
  }
};

export const cacheDel = async (...keys: string[]): Promise<void> => {
  const redis = getRedis();
  if (keys.length > 0) await redis.del(...keys);
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
