import { getDatabase, initDatabase, closeDatabase } from './connection.js';
import { logger } from '../config/logger.js';

/**
 * Incremental schema migrations, applied automatically on every boot.
 *
 * Why inline SQL instead of reading .sql files: this project's deploy has
 * repeatedly been bitten by path/packaging issues (the Arabic-named repo root,
 * the backend building from its own subdirectory, .sql files not landing in
 * dist). Embedding the SQL in the compiled bundle removes every one of those
 * failure modes — the migration is always exactly where the runtime looks.
 *
 * Rules for anything added here:
 *  - Start numbering at 003. The baseline schema (001) and the reconcile pass
 *    (002) were applied to the live database by hand before this runner
 *    existed; they are NOT repeated here.
 *  - Every statement must be idempotent (IF NOT EXISTS / IF EXISTS), so a
 *    migration is harmless even if it partially ran before, and a fresh column
 *    add can never take the service down.
 *  - Append only. Never edit or reorder an already-shipped migration — add a
 *    new one instead.
 */
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '003_add_kitchen_living_room',
    sql: `
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS kitchens INTEGER;
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS living_rooms INTEGER;
    `,
  },
  {
    // Durable store for short-lived auth state (OTPs, post-verification
    // tokens, lockout counters, revoked JWTs). These used to live only in
    // Redis, which is not provisioned in production — so every write was a
    // silent no-op and every read came back null, which broke registration
    // and password reset outright and quietly disabled brute-force lockout.
    name: '004_ephemeral_kv',
    sql: `
      CREATE TABLE IF NOT EXISTS ephemeral_kv (
        key        TEXT PRIMARY KEY,
        value      JSONB NOT NULL,
        expires_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS ephemeral_kv_expires_idx ON ephemeral_kv (expires_at);
    `,
  },
  {
    // Without these, two webhooks racing for the same new customer each insert
    // a row and the chat silently splits into two threads. The code now
    // re-reads on a 23505, but that only helps if the constraint exists.
    //
    // Creating a unique index outright would abort the whole migration — and
    // with it the boot — if the live data already contains duplicates. So try
    // it, and on failure log and carry on rather than take the service down;
    // the duplicates can then be reconciled deliberately.
    name: '005_unique_whatsapp_identities',
    sql: `
      DO $$
      BEGIN
        BEGIN
          CREATE UNIQUE INDEX IF NOT EXISTS clients_whatsapp_id_uniq
            ON clients (whatsapp_id) WHERE whatsapp_id IS NOT NULL;
        EXCEPTION WHEN unique_violation OR duplicate_table THEN
          RAISE NOTICE 'clients.whatsapp_id has duplicates — unique index skipped';
        END;

        BEGIN
          CREATE UNIQUE INDEX IF NOT EXISTS conversations_whatsapp_chat_id_uniq
            ON conversations (whatsapp_chat_id) WHERE whatsapp_chat_id IS NOT NULL;
        EXCEPTION WHEN unique_violation OR duplicate_table THEN
          RAISE NOTICE 'conversations.whatsapp_chat_id has duplicates — unique index skipped';
        END;
      END $$;
    `,
  },
  {
    // Menus and internal markers are recorded so staff can see the full thread,
    // but they are not things the bot "said" — replaying them to the model as
    // assistant turns makes it imitate menus and emit bracketed placeholders,
    // and they crowd real conversation out of the history window.
    name: '006_messages_exclude_from_ai',
    sql: `
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS exclude_from_ai BOOLEAN NOT NULL DEFAULT FALSE;
    `,
  },
  {
    // The guided flow already distinguishes "شقة عزاب" from "شقة عوائل" and a
    // private entrance from a shared one, but the listing had nowhere to record
    // either — so the search could only filter on property_type and a customer
    // asking for شقة عزاب received every apartment on file.
    //
    // Two orthogonal columns rather than one combined enum: occupancy and
    // entrance vary independently (a family apartment may have either kind of
    // entrance), and either may legitimately be unknown on an older listing.
    name: '007_property_occupancy_and_entrance',
    sql: `
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS occupancy_type VARCHAR(16);
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS entrance_type  VARCHAR(16);
      CREATE INDEX IF NOT EXISTS properties_occupancy_idx ON properties (occupancy_type);
      CREATE INDEX IF NOT EXISTS properties_entrance_idx  ON properties (entrance_type);
    `,
  },
  {
    // Which WhatsApp number a conversation belongs to. It was only ever set on
    // the in-memory object at runtime, so there was no way to scope the
    // dashboard: every agent saw every conversation. Persist it so a sales
    // agent sees only their own number's chats and a manager can filter by one.
    name: '008_conversation_wa_instance',
    sql: `
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS wa_instance VARCHAR(64);
      CREATE INDEX IF NOT EXISTS conversations_wa_instance_idx ON conversations (wa_instance);
    `,
  },
];

async function ensureMigrationsTable(): Promise<void> {
  const db = getDatabase();
  await db.raw(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        VARCHAR(255) PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Applies every migration not yet recorded. Safe to call on every startup.
 * A failure in one migration is logged and rethrown so it's visible, but the
 * caller decides whether to keep the service up (see bootstrap) — a bad
 * migration shouldn't necessarily take down an otherwise healthy deploy.
 */
export async function runMigrations(): Promise<{ applied: string[] }> {
  const db = getDatabase();
  await ensureMigrationsTable();

  const doneRows = await db('schema_migrations').select('name');
  const done = new Set<string>(doneRows.map((r: any) => r.name));

  const applied: string[] = [];
  for (const migration of MIGRATIONS) {
    if (done.has(migration.name)) continue;
    logger.info(`Applying migration: ${migration.name}`);
    await db.transaction(async (trx) => {
      await trx.raw(migration.sql);
      await trx('schema_migrations').insert({ name: migration.name });
    });
    applied.push(migration.name);
    logger.info(`Migration applied: ${migration.name}`);
  }

  if (applied.length === 0) logger.info('No pending migrations');
  else logger.info(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);

  return { applied };
}

// Allow running standalone: `npm run migrate` → node dist/database/migrate.js
// (CommonJS build, so guard on require.main rather than import.meta.)
if (require.main === module) {
  void (async () => {
    await initDatabase();
    try {
      await runMigrations();
    } catch (e) {
      logger.error('Migration run failed', { error: (e as any)?.message });
      process.exitCode = 1;
    } finally {
      await closeDatabase();
    }
  })();
}
