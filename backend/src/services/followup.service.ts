import { getDatabase } from '../database/connection.js';
import { whatsappService } from './whatsapp.service.js';
import { logger } from '../config/logger.js';

// =============================================================================
// Follow-Up Messages — sent automatically based on schedule
// =============================================================================

const FOLLOWUP_MESSAGES: Record<string, string> = {
  auto_1day: `مرحباً
أردت فقط التأكد أن كل شيء على ما يرام بعد محادثتنا أمس.

هل لا تزال تبحث عن عقار؟ أنا هنا لمساعدتك.`,

  auto_3days: `السلام عليكم
نحن في مكتب عبدالحكيم النقيدان العقاري نفكر فيك.

لدينا عقارات جديدة أضيفت مؤخراً — هل تريد أن أعرض عليك ما يناسب طلبك؟`,

  auto_1week: `أسبوع مضى على تواصلنا الأول.
هل ما زلت تبحث عن عقارك المثالي؟

فريقنا مستعد لمساعدتك في إيجاد أفضل الخيارات بالسعر المناسب.
أخبرني بأي تحديث في طلبك وسنجد لك ما يناسبك.`,

  auto_1month: `السلام عليكم ورحمة الله
مر شهر منذ تواصلنا الأول، وما زلنا نفكر في مساعدتك.

السوق العقاري يتغير دائماً — ربما وجدنا ما يناسبك الآن.
هل تريد إعادة النظر في خياراتك؟`,
};

// =============================================================================
// Process Pending Follow-Ups
// =============================================================================

export async function processPendingFollowUps(): Promise<void> {
  const db = getDatabase();
  const now = new Date();

  try {
    // Get all pending follow-ups that are due
    const due = await db('follow_ups as fu')
      .join('clients as c', 'fu.client_id', 'c.id')
      .where('fu.status', 'pending')
      .where('fu.is_cancelled', false)
      .where('fu.scheduled_at', '<=', now)
      .whereNull('fu.sent_at')
      .leftJoin('conversations as cv', 'cv.client_id', 'c.id')
      .select(
        'fu.id',
        'fu.client_id',
        'fu.follow_up_type',
        'c.phone',
        'c.full_name',
        'c.status as client_status',
        'cv.id as conversation_id',
        'cv.is_ai_enabled',
      )
      .limit(20); // Process max 20 at a time

    if (due.length === 0) return;

    logger.info(`Processing ${due.length} pending follow-ups`);

    for (const fu of due) {
      try {
        // Skip if client is already in advanced stage (don't bother them)
        if (['closed_won', 'closed_lost', 'contract_pending'].includes(fu.client_status)) {
          await db('follow_ups').where('id', fu.id).update({
            is_cancelled: true,
            cancel_reason: 'client_advanced_stage',
          });
          continue;
        }

        // A member of staff has taken this conversation over — an automated
        // nudge arriving on top of a human handling the customer undoes the
        // takeover, so cancel rather than send.
        if (fu.is_ai_enabled === false) {
          await db('follow_ups').where('id', fu.id).update({
            is_cancelled: true,
            cancel_reason: 'human_took_over',
          });
          continue;
        }

        const message = FOLLOWUP_MESSAGES[fu.follow_up_type];
        if (!message) continue;

        // Send via WhatsApp
        const msgId = await whatsappService.sendText(fu.phone, message);

        // Record it, so the follow-up is visible in the dashboard thread
        // instead of the customer receiving a message no one on the team
        // can see. Never let a logging failure re-send the message.
        if (fu.conversation_id) {
          await db('messages').insert({
            conversation_id: fu.conversation_id,
            whatsapp_message_id: msgId || null,
            direction: 'outbound',
            message_type: 'text',
            status: 'sent',
            content: message,
            is_from_ai: true,
          }).catch((e: any) => logger.warn('follow-up message not recorded', { error: e?.message }));
        }

        // Mark as sent
        await db('follow_ups').where('id', fu.id).update({
          status: 'sent',
          sent_at: new Date(),
        });

        // Update client's last contact
        await db('clients').where('id', fu.client_id).update({
          last_contact_at: new Date(),
          updated_at: new Date(),
        });

        logger.info('Follow-up sent', {
          followUpId: fu.id,
          clientId: fu.client_id,
          type: fu.follow_up_type,
          phone: fu.phone,
        });

        // Small delay between messages
        await new Promise(r => setTimeout(r, 1500));
      } catch (err: any) {
        logger.error('Failed to send follow-up', {
          followUpId: fu.id,
          error: err?.message,
        });
        // Mark as failed so it doesn't retry forever
        await db('follow_ups').where('id', fu.id).update({ status: 'failed' });
      }
    }
  } catch (error) {
    logger.error('processPendingFollowUps error', { error });
  }
}

// =============================================================================
// Auto-update stale client statuses
// =============================================================================

export async function updateStaleClients(): Promise<void> {
  const db = getDatabase();
  const now = new Date();

  try {
    // Clients in "contacted" with no activity for 30+ days → on_hold
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const staleCount = await db('clients')
      .whereIn('status', ['contacted', 'interested'])
      .where('updated_at', '<', thirtyDaysAgo)
      .update({ status: 'on_hold', updated_at: now });

    if (staleCount > 0) {
      logger.info(`Moved ${staleCount} stale clients to on_hold`);
    }

    // Clients with follow_up scheduled but passed → set next_follow_up_at
    const nextFollowUps = await db('follow_ups')
      .where('status', 'pending')
      .where('is_cancelled', false)
      .where('scheduled_at', '>', now)
      .groupBy('client_id')
      .select('client_id')
      .min('scheduled_at as next_at');

    for (const row of nextFollowUps as any[]) {
      await db('clients').where('id', row.client_id).update({
        next_follow_up_at: row.next_at,
        updated_at: now,
      });
    }
  } catch (error) {
    logger.error('updateStaleClients error', { error });
  }
}

// =============================================================================
// Notify managers about hot leads (high urgency, no agent assigned)
// =============================================================================

export async function notifyHotLeads(): Promise<void> {
  const db = getDatabase();

  try {
    // Clients flagged as high urgency with no assigned agent in last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const hotLeads = await db('clients as c')
      .leftJoin('conversations as conv', 'c.id', 'conv.client_id')
      .whereNull('c.assigned_agent_id')
      .whereIn('c.status', ['interested', 'viewing_scheduled', 'negotiating'])
      .where('c.updated_at', '>=', twoHoursAgo)
      .select('c.id', 'c.full_name', 'c.phone', 'c.status')
      .limit(5);

    if (hotLeads.length === 0) return;

    // Get all active managers
    const managers = await db('users')
      .whereIn('role', ['super_admin', 'admin', 'sales_manager'])
      .where('is_active', true)
      .select('id');

    if (managers.length === 0) return;

    // Already-pending alerts for these same leads. This job runs every 30
    // minutes against a 2-hour window, so without this every lead was
    // re-announced to every manager four times over — and onConflict().ignore()
    // did nothing, since there is no unique constraint to conflict on.
    const leadIds = hotLeads.map((l: any) => l.id);
    const existing = await db('notifications')
      .whereIn('user_id', managers.map((m: any) => m.id))
      .where('notification_type', 'new_client')
      .whereNull('read_at')
      .select('user_id', 'data');
    const alreadyAlerted = new Set(
      existing
        .filter((n: any) => leadIds.includes(n.data?.client_id))
        .map((n: any) => `${n.user_id}:${n.data?.client_id}`)
    );

    const notifications = managers.flatMap((mgr: any) =>
      hotLeads
        .filter((lead: any) => !alreadyAlerted.has(`${mgr.id}:${lead.id}`))
        .map((lead: any) => ({
          user_id: mgr.id,
          notification_type: 'new_client',
          title: `🔥 عميل مهم بدون مستشار — ${lead.full_name}`,
          body: `العميل في مرحلة "${lead.status}" ولم يُعيَّن له مستشار بعد`,
          data: { client_id: lead.id },
          // The table records read state as a nullable timestamp. Writing
          // is_read threw on every run, so this job never delivered anything.
          read_at: null,
          created_at: new Date(),
        }))
    );

    if (notifications.length > 0) {
      await db('notifications').insert(notifications);
      logger.info(`Sent ${notifications.length} hot-lead notifications`);
    }
  } catch (error) {
    logger.error('notifyHotLeads error', { error });
  }
}
