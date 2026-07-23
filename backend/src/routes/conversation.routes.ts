import { Router, Request } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getDatabase } from '../database/connection.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { conversationService } from '../services/conversation.service.js';
import { audit } from '../services/audit.service.js';

const router = Router();

router.use(authenticate);

// Managers see every number and may filter to one; everyone else is locked to
// the single WhatsApp number assigned to them.
const MANAGER_ROLES = ['super_admin', 'admin', 'sales_manager'];
const isManager = (req: Request): boolean => MANAGER_ROLES.includes(req.user?.role ?? '');

/**
 * The instance a request is scoped to.
 *  - manager, no ?instance  -> undefined (all numbers)
 *  - manager, ?instance=X    -> X
 *  - agent                   -> their assigned number (may be null)
 * The second return value says whether the caller is allowed to see anything
 * at all: an agent with no number assigned sees nothing rather than everything.
 */
function scope(req: Request): { instance: string | undefined; blocked: boolean } {
  if (isManager(req)) {
    const q = (req.query['instance'] as string | undefined)?.trim();
    return { instance: q || undefined, blocked: false };
  }
  const own = req.user?.whatsapp_instance ?? null;
  return { instance: own ?? undefined, blocked: !own };
}

/** Confirm the caller may act on this specific conversation. */
function canAccess(req: Request, conv: { wa_instance?: string | null }): boolean {
  if (isManager(req)) return true;
  const own = req.user?.whatsapp_instance ?? null;
  return Boolean(own) && conv.wa_instance === own;
}

router.get('/', async (req, res, next) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20 } = req.pagination ?? {};
    const offset = (Number(page) - 1) * Number(limit);

    const { instance, blocked } = scope(req);
    if (blocked) { res.json({ success: true, data: [] }); return; }

    const convs = await db('conversations as cv')
      .join('clients as cl', 'cv.client_id', 'cl.id')
      .joinRaw(`
        LEFT JOIN LATERAL (
          SELECT content, message_type, created_at
          FROM messages
          WHERE conversation_id = cv.id
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        ) m ON TRUE
      `)
      .modify((q) => { if (instance) q.where('cv.wa_instance', instance); })
      .select('cv.*', 'cl.full_name', 'cl.phone', 'm.content as last_message', 'm.message_type as last_message_type', 'm.created_at as last_message_at')
      .orderBy('cv.last_message_at', 'desc')
      .limit(Number(limit))
      .offset(offset);

    res.json({ success: true, data: convs });
  } catch (error) { next(error); }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const db = getDatabase();
    const conv = await db('conversations').where('id', req.params['id']).first();
    if (!conv) { res.status(404).json({ success: false, error: 'المحادثة غير موجودة' }); return; }
    if (!canAccess(req, conv)) { res.status(403).json({ success: false, error: 'لا تملك صلاحية على هذه المحادثة' }); return; }

    const messages = await conversationService.getConversationHistory(req.params['id']!, 50);
    res.json({ success: true, data: messages });
  } catch (error) { next(error); }
});

router.post('/:id/send', async (req, res, next) => {
  try {
    const { text } = req.body as { text: string };
    const db = getDatabase();
    const conv = await db('conversations').where('id', req.params['id']).first();
    if (!conv) { res.status(404).json({ success: false, error: 'Conversation not found' }); return; }
    if (!canAccess(req, conv)) { res.status(403).json({ success: false, error: 'لا تملك صلاحية على هذه المحادثة' }); return; }

    // "11" is a staff-only control command, not a message: it hands the
    // conversation over to the human who typed it. It must never reach the
    // customer, so return before anything is sent or stored.
    if (text.trim() === '11') {
      await db('conversations').where('id', req.params['id']).update({
        is_ai_enabled: false,
        ai_handoff_requested: false,
        updated_at: new Date(),
      });
      res.json({ success: true, data: { is_ai_enabled: false, command: 'takeover' } });
      return;
    }

    const client = await db('clients').where('id', conv.client_id).first();
    // Reply from the number that owns the conversation, not the default one.
    const msgId = await whatsappService.sendText(client.phone, text, conv.wa_instance || undefined);

    await conversationService.saveMessage({
      conversation_id: req.params['id'],
      whatsapp_message_id: msgId || undefined,
      direction: 'outbound',
      message_type: 'text',
      status: 'sent',
      content: text,
      sent_by: req.user!.user_id,
      is_from_ai: false,
    });

    res.json({ success: true });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDatabase();
    const id = req.params['id'];
    const conv = await db('conversations').where('id', id).first();
    if (!conv) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    if (!canAccess(req, conv)) { res.status(403).json({ success: false, error: 'لا تملك صلاحية على هذه المحادثة' }); return; }
    // messages.conversation_id has no cascade guarantee on the live DB, so
    // remove them first, then the conversation itself.
    await db('messages').where('conversation_id', id).del().catch(() => {});
    await db('conversations').where('id', id).del();
    await audit({ req, action: 'conversation.delete', entityType: 'conversation', entityId: String(id), details: { wa_instance: conv.wa_instance ?? null } });
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const db = getDatabase();
    const conv = await db('conversations').where('id', req.params['id']).first();
    if (!conv) { res.status(404).json({ success: false, error: 'المحادثة غير موجودة' }); return; }
    if (!canAccess(req, conv)) { res.status(403).json({ success: false, error: 'لا تملك صلاحية على هذه المحادثة' }); return; }
    await db('conversations').where('id', req.params['id']).update({ unread_count: 0 });
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.patch('/:id/toggle-ai', async (req, res, next) => {
  try {
    const db = getDatabase();
    const conv = await db('conversations').where('id', req.params['id']).first();
    if (!conv) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    if (!canAccess(req, conv)) { res.status(403).json({ success: false, error: 'لا تملك صلاحية على هذه المحادثة' }); return; }
    await db('conversations').where('id', req.params['id']).update({
      is_ai_enabled: !conv.is_ai_enabled,
      ai_handoff_requested: false,
    });
    res.json({ success: true, data: { is_ai_enabled: !conv.is_ai_enabled } });
  } catch (error) { next(error); }
});

export default router;
