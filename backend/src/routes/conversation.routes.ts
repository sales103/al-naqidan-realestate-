import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getDatabase } from '../database/connection.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { conversationService } from '../services/conversation.service.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 20 } = req.pagination ?? {};
    const offset = (Number(page) - 1) * Number(limit);

    const convs = await db('conversations as cv')
      .join('clients as cl', 'cv.client_id', 'cl.id')
      .leftJoin('messages as m', function() {
        this.on('m.conversation_id', 'cv.id')
          .andOn(db.raw('m.created_at = (SELECT MAX(created_at) FROM messages WHERE conversation_id = cv.id)'));
      })
      .select('cv.*', 'cl.full_name', 'cl.phone', 'm.content as last_message', 'm.message_type as last_message_type', 'm.created_at as last_message_at')
      .orderBy('cv.last_message_at', 'desc')
      .limit(Number(limit))
      .offset(offset);

    res.json({ success: true, data: convs });
  } catch (error) { next(error); }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
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

    const client = await db('clients').where('id', conv.client_id).first();
    const msgId = await whatsappService.sendText(client.phone, text);

    await conversationService.saveMessage({
      conversation_id: req.params['id'],
      whatsapp_message_id: msgId,
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
    // messages.conversation_id has no cascade guarantee on the live DB, so
    // remove them first, then the conversation itself.
    await db('messages').where('conversation_id', id).del().catch(() => {});
    await db('conversations').where('id', id).del();
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.patch('/:id/toggle-ai', async (req, res, next) => {
  try {
    const db = getDatabase();
    const conv = await db('conversations').where('id', req.params['id']).first();
    if (!conv) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    await db('conversations').where('id', req.params['id']).update({
      is_ai_enabled: !conv.is_ai_enabled,
      ai_handoff_requested: false,
    });
    res.json({ success: true, data: { is_ai_enabled: !conv.is_ai_enabled } });
  } catch (error) { next(error); }
});

export default router;
