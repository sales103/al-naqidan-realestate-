import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/connection.js';
import { config } from '../config/index.js';
import { processMessage } from '../ai/agent.js';
import { propertyService } from '../services/property.service.js';
import { lastPipelineError } from '../services/conversation.service.js';

const router = Router();

function authed(req: Request): boolean {
  const key = req.header('x-diag-key');
  return Boolean(config.whatsapp.evolutionApiKey) && key === config.whatsapp.evolutionApiKey;
}

/**
 * Read-only health snapshot for debugging a live deployment.
 * Gated on the Evolution API key; never returns secrets, only whether they exist.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  if (!authed(req)) { res.status(404).json({ success: false, error: 'Not found' }); return; }

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
    districts: await count('districts'),
    clients: await count('clients'),
    conversations: await count('conversations'),
    messages: await count('messages'),
  };

  try {
    const row = await db('system_settings').where('key', 'ai').first();
    const v: any = row?.value ?? {};
    out.checks.ai = {
      row_exists: Boolean(row),
      key_configured: Boolean(v.openai_key || v.api_key),
      key_prefix: v.openai_key ? String(v.openai_key).slice(0, 4) : null,
      model: v.model ?? null,
      base_url: v.base_url ?? null,
    };
  } catch (e: any) {
    out.checks.ai = { error: e?.message?.slice(0, 200) };
  }

  try {
    const convs = await db('conversations')
      .select('whatsapp_chat_id', 'is_ai_enabled', 'ai_handoff_requested', 'conversation_context', 'updated_at')
      .orderBy('updated_at', 'desc').limit(5);
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

  // Did inbound messages actually persist, and did we attempt any replies?
  try {
    const msgs = await db('messages')
      .select('direction', 'message_type', 'content', 'is_from_ai', 'created_at')
      .orderBy('created_at', 'desc').limit(10);
    out.checks.recent_messages = msgs.map((m: any) => ({
      dir: m.direction,
      type: m.message_type,
      ai: m.is_from_ai,
      text: (m.content ?? '').slice(0, 60),
      at: m.created_at,
    }));
  } catch (e: any) {
    out.checks.recent_messages = { error: e?.message?.slice(0, 200) };
  }

  out.checks.last_error = lastPipelineError;

  res.json(out);
});

/** Exercise the property search exactly as the bot does. */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  if (!authed(req)) { res.status(404).json({ success: false, error: 'Not found' }); return; }
  try {
    const plain = await propertyService.search({ status: 'available', limit: 3 } as any);
    res.json({
      ok: true,
      found: plain.properties.length,
      sample: plain.properties.slice(0, 3).map((p: any) => ({
        code: p.code, type: p.property_type, purpose: p.purpose,
        price: p.price, city_id: p.city_id, city: p.city_name, status: p.status,
      })),
    });
  } catch (e: any) {
    res.json({ ok: false, error: e?.message, code: e?.code, detail: e?.detail });
  }
});

/** Call the AI once and report the real failure reason if it errors. */
router.get('/ai', async (req: Request, res: Response): Promise<void> => {
  if (!authed(req)) { res.status(404).json({ success: false, error: 'Not found' }); return; }
  try {
    const r = await processMessage('مرحبا', { id: 'diag', full_name: 'تشخيص', phone: '0' } as any, []);
    res.json({ ok: true, intent: r?.intent?.primary ?? null, reply: (r?.response ?? '').slice(0, 160) });
  } catch (e: any) {
    res.json({
      ok: false,
      message: e?.message,
      status: e?.status ?? e?.response?.status,
      code: e?.code,
      body: e?.response?.data ? JSON.stringify(e.response.data).slice(0, 400) : undefined,
    });
  }
});

export default router;
