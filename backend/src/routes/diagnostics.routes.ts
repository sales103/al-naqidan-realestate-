import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/connection.js';
import { config } from '../config/index.js';

const router = Router();

/**
 * Read-only health snapshot for debugging a live deployment.
 * Gated on the Evolution API key so it is not publicly readable, and it never
 * returns secrets — only whether they are configured.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const key = req.header('x-diag-key');
  if (!config.whatsapp.evolutionApiKey || key !== config.whatsapp.evolutionApiKey) {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }

  const db = getDatabase();
  const out: any = { ok: true, checks: {} };

  const count = async (table: string, where?: Record<string, any>) => {
    try {
      const q = db(table);
      if (where) q.where(where);
      const [r] = await q.count('* as n') as any[];
      return Number(r.n);
    } catch (e: any) {
      return `ERROR: ${e?.message?.slice(0, 120)}`;
    }
  };

  out.checks.counts = {
    properties: await count('properties'),
    properties_available: await count('properties', { status: 'available' }),
    cities: await count('cities'),
    clients: await count('clients'),
    conversations: await count('conversations'),
    messages: await count('messages'),
  };

  // AI configuration — presence only, never the key itself.
  try {
    const row = await db('system_settings').where('key', 'ai').first();
    const v: any = row?.value ?? {};
    out.checks.ai = {
      row_exists: Boolean(row),
      key_configured: Boolean(v.openai_key || v.api_key),
      key_field: v.openai_key ? 'openai_key' : v.api_key ? 'api_key' : null,
      key_prefix: v.openai_key ? String(v.openai_key).slice(0, 4) : v.api_key ? String(v.api_key).slice(0, 4) : null,
      model: v.model ?? null,
      base_url: v.base_url ?? null,
      env_key_configured: Boolean(config.openai.apiKey),
    };
  } catch (e: any) {
    out.checks.ai = { error: e?.message?.slice(0, 200) };
  }

  // Conversation state — why the bot may be staying silent.
  try {
    const convs = await db('conversations')
      .select('whatsapp_chat_id', 'is_ai_enabled', 'ai_handoff_requested', 'conversation_context', 'updated_at')
      .orderBy('updated_at', 'desc')
      .limit(5);
    out.checks.recent_conversations = convs.map((c: any) => ({
      chat: c.whatsapp_chat_id,
      ai_enabled: c.is_ai_enabled,
      handoff: c.ai_handoff_requested,
      state: c.conversation_context?.state ?? null,
      updated_at: c.updated_at,
    }));
  } catch (e: any) {
    out.checks.recent_conversations = { error: e?.message?.slice(0, 200) };
  }

  res.json(out);
});

export default router;
