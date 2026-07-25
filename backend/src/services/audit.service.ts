import type { Request } from 'express';
import { getDatabase } from '../database/connection.js';
import { logger } from '../config/logger.js';

/**
 * سجل النشاطات — records who did what and when for sensitive actions.
 *
 * Guarantees:
 *  - NEVER throws: an audit failure must not break the action being audited.
 *  - NEVER stores secrets: callers must not pass passwords/tokens/keys in
 *    `details` — pass flags like { password_changed: true } instead.
 */
export async function audit(opts: {
  req?: Request;
  /** e.g. 'user.create', 'settings.update', 'auth.login' */
  action: string;
  entityType?: string;
  entityId?: string;
  details?: object;
  /** Explicit actor when req.user is not populated (login, invite flows). */
  user?: { id?: string | null; name?: string | null };
}): Promise<void> {
  try {
    const db = getDatabase();
    const reqUser = opts.req?.user;
    await db('audit_logs').insert({
      user_id: opts.user?.id ?? reqUser?.user_id ?? null,
      user_name: opts.user?.name ?? reqUser?.email ?? null,
      action: opts.action,
      entity_type: opts.entityType ?? null,
      entity_id: opts.entityId ?? null,
      details: opts.details ? JSON.stringify(opts.details) : null,
      ip: opts.req?.ip ?? null,
    });
  } catch (err) {
    // Same truncation problem as the global error handler: knex prefixes the
    // message with the whole statement, so log Postgres's short fields first.
    const pg = err as any;
    logger.warn('audit: failed to record entry', {
      action: opts.action,
      pg_code: pg?.code,
      pg_detail: pg?.detail,
      pg_column: pg?.column,
      error: pg?.message,
    });
  }
}
