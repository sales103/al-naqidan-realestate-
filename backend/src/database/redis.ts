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

// ─── Durable fallback ────────────────────────────────────────────────────────
// Some keys are pure cache (property searches, dashboard stats) and losing
// them costs nothing. Others carry state the app is *correct* only if it
// survives: OTPs, post-verification tokens, lockout counters, revoked JWTs.
// Redis is not provisioned in production here, so those keys silently vanished
// — registration and password reset could never succeed, and brute-force
// lockout never engaged. Persist exactly those prefixes in Postgres instead.
const DURABLE_PREFIXES = ['otp:', 'verified:', 'login_fail:', 'lockout:', 'otp_fail:', 'blacklist:'];
const isDurable = (key: string): boolean => DURABLE_PREFIXES.some((p) => key.startsWith(p));

async function dbGet<T>(key: string): Promise<T | null> {
  try {
    const { getDatabase } = await import('./connection.js');
    const row = await getDatabase()('ephemeral_kv')
      .where('key', key)
      .where((b) => b.whereNull('expires_at').orWhere('expires_at', '>', new Date()))
      .first();
    return row ? (row.value as T) : null;
  } catch (e: any) {
    logger.warn('ephemeral_kv read failed', { key, error: e?.message });
    return null;
  }
}

async function dbSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  try {
    const { getDatabase } = await import('./connection.js');
    const db = getDatabase();
    const expires_at = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;
    await db('ephemeral_kv')
      .insert({ key, value: JSON.stringify(value), expires_at })
      .onConflict('key')
      .merge({ value: JSON.stringify(value), expires_at });
    // Opportunistic cleanup so the table cannot grow without bound.
    if (Math.random() < 0.02) {
      await db('ephemeral_kv').whereNotNull('expires_at').where('expires_at', '<', new Date()).del();
    }
  } catch (e: any) {
    logger.warn('ephemeral_kv write failed', { key, error: e?.message });
  }
}

async function dbDel(keys: string[]): Promise<void> {
  try {
    const { getDatabase } = await import('./connection.js');
    await getDatabase()('ephemeral_kv').whereIn('key', keys).del();
  } catch (e: any) {
    logger.warn('ephemeral_kv delete failed', { error: e?.message });
  }
}

// Cache helpers — Redis when available, Postgres for keys that must survive,
// and a silent no-op only for keys that are genuinely just cache.
export const cacheGet = async <T>(key: string): Promise<T | null> => {
  if (!redisClient || !redisAvailable) {
    return isDurable(key) ? dbGet<T>(key) : null;
  }
  try {
    const value = await redisClient.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch { return null; }
};

export const cacheSet = async <T>(key: string, value: T, ttlSeconds?: number): Promise<void> => {
  if (!redisClient || !redisAvailable) {
    if (isDurable(key)) await dbSet(key, value, ttlSeconds);
    return;
  }
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
  if (keys.length === 0) return;
  if (!redisClient || !redisAvailable) {
    const durable = keys.filter(isDurable);
    if (durable.length) await dbDel(durable);
    return;
  }
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
