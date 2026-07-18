import knex, { type Knex } from 'knex';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

let db: Knex | null = null;

export const getDatabase = (): Knex => {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
};

export const initDatabase = async (): Promise<Knex> => {
  if (db) return db;

  const connectionString = process.env['DATABASE_URL'];
  db = knex({
    client: 'pg',
    connection: connectionString
      ? { connectionString, ssl: { rejectUnauthorized: false } }
      : {
          host: config.database.host,
          port: config.database.port,
          database: config.database.name,
          user: config.database.user,
          password: config.database.password,
          ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
        },
    pool: {
      min: config.database.poolMin,
      max: config.database.poolMax,
      afterCreate: (conn: any, done: any) => {
        conn.query('SET timezone="Asia/Riyadh"', (err: Error) => done(err, conn));
      },
    },
    acquireConnectionTimeout: 30000,
  });

  // Test connection
  try {
    await db.raw('SELECT 1');
    logger.info('Database connected successfully', {
      host: config.database.host,
      database: config.database.name,
    });
  } catch (error) {
    logger.error('Database connection failed', { error });
    throw error;
  }

  return db;
};

export const closeDatabase = async (): Promise<void> => {
  if (db) {
    await db.destroy();
    db = null;
    logger.info('Database connection closed');
  }
};

export const withTransaction = async <T>(
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> => {
  const database = getDatabase();
  return database.transaction(callback);
};
