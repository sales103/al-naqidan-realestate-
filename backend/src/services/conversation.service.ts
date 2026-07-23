import { getDatabase } from '../database/connection.js';
import { cacheGet, cacheSet, cacheKeys } from '../database/redis.js';
import { logger } from '../config/logger.js';
import { config } from '../config/index.js';
import { processMessage, transcribeAudio, analyzeImage, formatPropertyDetails } from '../ai/agent.js';
import { propertyService } from './property.service.js';
import { clientService } from './client.service.js';
import { whatsappService } from './whatsapp.service.js';
import { appointmentService } from './appointment.service.js';
import { sseService } from './sse.service.js';
import {
  detectComplaint, acknowledgement, nextQuestion, buildAgentSummary, handoverLine,
  type AngerLevel, type ComplaintCategory,
} from './complaint.service.js';
import type {
  Conversation, Message, Client,
  WhatsAppWebhookPayload, AIProcessingResult, PropertySearchParams,
} from '../types/index.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Last pipeline failure, surfaced by /api/diagnostics so a live problem can be
// read directly instead of inferred from the bot going quiet.
export const lastPipelineError: { at?: string; where?: string; message?: string; stack?: string } = {};
function recordError(where: string, e: any): void {
  lastPipelineError.at = new Date().toISOString();
  lastPipelineError.where = where;
  lastPipelineError.message = e?.message ?? String(e);
  lastPipelineError.stack = String(e?.stack ?? "").split("\n").slice(0, 4).join(" | ");
}

// =============================================================================
// Flow State Machine
// welcome → purpose → type → entry → location → budget → ai → escalated
// =============================================================================

type FlowState =
  | 'welcome' | 'intent' | 'category' | 'type' | 'entry'
  | 'sell_details' | 'manage_details'
  | 'ai' | 'booking_time' | 'complaint' | 'complaint_intake' | 'escalated';

/** One selectable option. `keywords` let the customer answer in their own words. */
interface FlowOption {
  id: string;
  title: string;
  keywords?: string[];
}

interface FlowContext {
  state: FlowState;
  /** ISO time of the customer's last inbound message, used to decide whether
   *  the conversation has gone cold and should restart from the menu. */
  last_seen?: string;
  purpose?: 'rent' | 'buy';
  property_type?: string;
  location?: string;
  budget?: number;
  /** Which type the entry-type question (private/shared) was asked for. */
  entry_for?: 'house' | 'apt_family';
  /** Options last offered, so a bare "2" can be resolved back to its option. */
  pending?: FlowOption[];
  /** Property ids already sent to this client, so a later search never repeats them. */
  shown_property_ids?: string[];
  /** Ordered ids from the most recent batch actually sent — "قارن 1 و3" resolves against this. */
  last_shown_properties?: string[];
  /** True right after the bot itself asked about a viewing, so a bare "نعم" is understood. */
  booking_prompted?: boolean;
  /** Which property (if any) a viewing is being booked for. */
  booking?: { property_id?: string };
  /** When collecting an owner's listing: whether they're selling or handing it over to manage. */
  deal_kind?: 'sell' | 'manage';
  /** Complaint mode: the bot stays here until a human takes over. */
  complaint?: {
    level: AngerLevel;
    category: ComplaintCategory;
    description?: string;
    contract?: string;
  };
}

const PROPERTY_TYPE_MAP: Record<string, {
  db_types: string[];
  label: string;
  occupancy?: 'family' | 'singles';
  entrance?: 'private' | 'shared';
}> = {
  apartment_family:         { db_types: ['apartment', 'villa'], label: 'شقة عوائل', occupancy: 'family' },
  apartment_family_private: { db_types: ['apartment', 'villa'], label: 'شقة عوائل مدخل خاص',   occupancy: 'family', entrance: 'private' },
  apartment_family_shared:  { db_types: ['apartment', 'villa'], label: 'شقة عوائل مدخل مشترك', occupancy: 'family', entrance: 'shared'  },
  apartment_single: { db_types: ['apartment'],          label: 'شقة عزاب', occupancy: 'singles' },
  house_private:    { db_types: ['villa'],              label: 'بيت مدخل خاص',   entrance: 'private' },
  house_shared:     { db_types: ['villa'],              label: 'بيت مدخل مشترك', entrance: 'shared'  },
  shop:             { db_types: ['showroom'],           label: 'محل تجاري' },
  hall:             { db_types: ['showroom'],           label: 'صالة تجارية' },
  office:           { db_types: ['office'],             label: 'مكتب' },
  warehouse:        { db_types: ['warehouse'],          label: 'مستودع' },
  land:             { db_types: ['land'],               label: 'أرض' },
};

// =============================================================================
// Arabic text helpers
// =============================================================================

/** Arabic-Indic and Persian digits -> ASCII. */
function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

/**
 * Normalise Arabic so "عوايل" / "عوائل" / "العوائل" all compare equal:
 * strip diacritics, unify alef/ya/ta-marbuta/hamza, drop emoji and punctuation.
 */
function normalizeAr(s: string): string {
  return toLatinDigits(s)
    .replace(/[ً-ْـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئء]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{20E3}]/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getRiyadhGreeting(): string {
  const utc = Date.now() + new Date().getTimezoneOffset() * 60000;
  const h = new Date(utc + 3 * 3600000).getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء الخير';
  return 'مساء النور';
}

/**
 * Budget from free text. Handles "مليون", "20 ألف", "20000" and a bare "25",
 * which for rent means 25 thousand — customers rarely type the zeros.
 */
function extractBudget(text: string, purpose?: 'rent' | 'buy'): number | undefined {
  const t = toLatinDigits(text);

  const m = t.match(/(\d+(?:[.,]\d+)?)\s*مليون/);
  if (m) return parseFloat(m[1]!.replace(',', '.')) * 1_000_000;

  const k = t.match(/(\d+(?:[.,]\d+)?)\s*(?:ألف|الف|آلاف|الاف|ك)(?!\p{L})/u);
  if (k) return parseFloat(k[1]!.replace(',', '.')) * 1_000;

  const n = t.match(/(\d[\d,]*)/);
  if (!n) return undefined;
  const raw = parseFloat(n[1]!.replace(/,/g, ''));
  if (!isFinite(raw) || raw <= 0) return undefined;

  if (raw >= 1000) return raw;              // already a full amount
  if (purpose === 'buy') return raw * 1_000_000;  // "2" when buying = 2 million
  return raw * 1_000;                        // "25" when renting = 25 thousand
}

/** Rotate wording so the bot never repeats itself two steps in a row. */
const ACKS = ['أبشر', 'الله يعطيك العافية', 'يسعدني خدمتك', 'بكل سرور', 'تمام', 'ممتاز'];
const ack = (): string => ACKS[Math.floor(Math.random() * ACKS.length)]!;

/** Footer telling the customer how to get back to the main menu. */
const MENU_HINT = '\n\n———\nللعودة للقائمة الرئيسية أرسل 0';
/** Append the hint once — never twice on the same message. */
const withMenuHint = (text: string): string =>
  text.includes('أرسل 0') ? text : text + MENU_HINT;

// ─── Per-client rate limiting ────────────────────────────────────────────────
// Redis caching is disabled in production for this project (no valid host
// configured — see cacheGet/cacheSet, which silently no-op there), so a
// Redis-backed limiter would do nothing. This process runs as a single
// Railway replica, so an in-memory sliding window is correct and simple —
// it just wouldn't survive a redeploy, which is fine for abuse throttling.
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000;
const RATE_LIMIT_MAX = 20;
const rateLimitHits = new Map<string, number[]>();
/** True if the phone is over the limit for this window; also records the hit. */
function isRateLimited(phone: string): boolean {
  const now = Date.now();
  const hits = (rateLimitHits.get(phone) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(phone, hits);
  // Prevent unbounded growth from one-off senders that never come back.
  if (rateLimitHits.size > 5000) rateLimitHits.clear();
  return hits.length > RATE_LIMIT_MAX;
}

/**
 * A concrete Riyadh-time slot (UTC+3, no DST), computed with UTC getters/
 * setters throughout so it's correct regardless of the server's own timezone.
 */
function riyadhSlot(daysFromNow: number, hour: number, minute = 0): Date {
  const riyadhNow = new Date(Date.now() + 3 * 3600000);
  const target = Date.UTC(
    riyadhNow.getUTCFullYear(), riyadhNow.getUTCMonth(), riyadhNow.getUTCDate() + daysFromNow,
    hour, minute, 0,
  );
  return new Date(target - 3 * 3600000);
}

export class ConversationService {
  private get db() { return getDatabase(); }
  private readonly rateLimitWarnedAt = new Map<string, number>();

  private extractButtonId(payload: WhatsAppWebhookPayload): string | null {
    const msg = payload.data.message;
    if (!msg) return null;
    return msg.buttonsResponseMessage?.selectedButtonId
      ?? msg.templateButtonReplyMessage?.selectedId
      ?? msg.listResponseMessage?.singleSelectReply?.selectedRowId
      ?? null;
  }

  /** A conversation idle this long restarts from the welcome menu. */
  private static readonly STALE_AFTER_MS = 24 * 60 * 60 * 1000;

  private async getFlowContext(conversationId: string): Promise<FlowContext> {
    const conv = await this.db('conversations').where('id', conversationId).first();
    const ctx = conv?.conversation_context as FlowContext | undefined;
    // Empty/default context ('{}') has no state — treat it as a fresh welcome.
    if (!ctx?.state) return { state: 'welcome' };

    const lastSeen = ctx.last_seen ? Date.parse(ctx.last_seen) : NaN;
    if (Number.isFinite(lastSeen) && Date.now() - lastSeen > ConversationService.STALE_AFTER_MS) {
      logger.info('Conversation went cold — restarting from the menu', {
        conversationId, idleHours: Math.round((Date.now() - lastSeen) / 3600000),
      });
      // Keep what still matters a day later: which listings this customer has
      // already been sent, so a fresh search does not repeat them.
      return {
        state: 'welcome',
        shown_property_ids: ctx.shown_property_ids,
      };
    }
    return ctx;
  }

  private async saveFlowContext(conversationId: string, ctx: FlowContext): Promise<void> {
    try {
      const stamped: FlowContext = { ...ctx, last_seen: new Date().toISOString() };
      await this.db('conversations')
        .where('id', conversationId)
        .update({ conversation_context: JSON.stringify(stamped), updated_at: new Date() });
    } catch (e) {
      // Never let a state-save failure abort the reply pipeline.
      logger.error('saveFlowContext failed', { conversationId, error: (e as any)?.message });
    }
  }

  // ===========================================================================
  // Main Webhook Handler
  // ===========================================================================

  async handleWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
    try {
      // Evolution may send the event as 'messages.upsert' (v2) or 'MESSAGES_UPSERT'
      const event = String(payload.event ?? '').toLowerCase().replace(/_/g, '.');
      if (event !== 'messages.upsert') return;
      if (payload.data.key.fromMe) return;
      const chatId = payload.data.key.remoteJid;
      if (!chatId || chatId.includes('@g.us')) return;

      const phone = chatId.replace('@s.whatsapp.net', '');
      const whatsappMessageId = payload.data.key.id;

      // Duplicate check is an optimisation — never let it block a reply.
      // Skip it entirely when the id is missing: querying for '' would match
      // every outbound row that failed to get an id back from Evolution and
      // silently drop a real customer message as a "duplicate".
      if (whatsappMessageId) {
        try {
          const existing = await this.db('messages').where('whatsapp_message_id', whatsappMessageId).first();
          if (existing) return;
        } catch (e: any) {
          logger.warn('dedup check skipped', { error: e?.message });
        }
      }

      const { client, isNew } = await clientService.findOrCreateByWhatsapp(chatId, phone, payload.data.pushName);
      const conversation = await this.findOrCreateConversation(client.id, chatId, payload.instance || config.whatsapp.instanceName);
      // Which WhatsApp number received this message. Drives the reply-from
      // number and the dashboard's per-agent visibility, so persist it —
      // and backfill any conversation created before this column existed.
      const incomingInstance = payload.instance || config.whatsapp.instanceName;
      (conversation as any).wa_instance = incomingInstance;
      if (!(conversation as any).wa_instance_persisted && incomingInstance) {
        this.db('conversations')
          .where('id', conversation.id)
          .update({ wa_instance: incomingInstance })
          .catch((e: any) => logger.warn('wa_instance persist failed', { error: e?.message }));
      }
      const { content, messageType, mediaUrl, mimeType, lat, lng, locationName } = this.extractMessageContent(payload);

      // Persisting the message must not stop us from answering the customer.
      let message: Message;
      try {
        message = await this.saveMessage({
          conversation_id: conversation.id,
          whatsapp_message_id: whatsappMessageId,
          direction: 'inbound',
          message_type: messageType,
          status: 'delivered',
          content,
          media_url: mediaUrl,
          media_mime_type: mimeType,
          location_lat: lat,
          location_lng: lng,
          location_name: locationName,
        });
      } catch (e: any) {
        logger.error('saveMessage failed — continuing without persistence', { error: e?.message });
        message = {
          conversation_id: conversation.id,
          whatsapp_message_id: whatsappMessageId,
          direction: 'inbound',
          message_type: messageType,
          status: 'delivered',
          content,
        } as unknown as Message;
      }

      await whatsappService.markAsRead(whatsappMessageId, chatId, this.waInstance(conversation));
      whatsappService.sendTyping(client.phone, this.waInstance(conversation)).catch(() => {});

      if (isRateLimited(phone)) {
        logger.warn('Client rate-limited', { phone, clientId: client.id });
        // Warn once, not on every blocked message — a flood shouldn't turn
        // into a flood of "please slow down" replies.
        const lastWarned = this.rateLimitWarnedAt.get(phone) ?? 0;
        if (Date.now() - lastWarned > RATE_LIMIT_WINDOW_MS) {
          this.rateLimitWarnedAt.set(phone, Date.now());
          await this.reply(client, conversation, 'وصلتني رسائل كثيرة منك خلال وقت قصير. أعطني لحظة وبرد عليك.').catch(() => {});
        }
        return;
      }

      // Only an explicit false disables the AI — a missing column must not silence the bot.
      // ai_handoff_requested is a "please loop in a human" flag, not "stop
      // helping": a customer who once said "ممكن أتكلم مع حد؟" in passing, or
      // whose status ever became 'negotiating', shouldn't lose the bot for
      // every future message. Only an explicit staff takeover (is_ai_enabled
      // set to false from the dashboard) actually silences it.
      if (conversation.is_ai_enabled === false) {
        // Log it: a silent return is impossible to diagnose from the outside.
        logger.info('AI reply skipped — human has taken over', { conversationId: conversation.id });
        return;
      }

      // Bot replies 24/7 with AI. Working hours only matter when handing off to a human.
      await this.handleFlow(message, client, conversation, payload, isNew);
    } catch (error) {
      recordError('handleWebhook', error);
      logger.error('Webhook handling failed', {
        message: (error as any)?.message,
        code: (error as any)?.code,
        detail: (error as any)?.detail,
        column: (error as any)?.column,
        table: (error as any)?.table,
        constraint: (error as any)?.constraint,
        where: (error as any)?.where,
      });
    }
  }

  // Which WhatsApp number to reply from (the one that received the message).
  private waInstance(conversation: Conversation): string {
    return (conversation as any).wa_instance ?? config.whatsapp.instanceName;
  }

  /** Send text to the client AND persist it in the messages table (fire-and-forget save). */
  private async reply(
    client: Client, conversation: Conversation, text: string, isFromAI = true,
  ): Promise<void> {
    const msgId = await whatsappService.sendText(client.phone, text, this.waInstance(conversation));
    this.saveMessage({
      conversation_id: conversation.id,
      // Evolution returns '' when the response carries no key; storing that
      // would collide with the inbound dedup lookup, so leave it unset.
      whatsapp_message_id: msgId || undefined,
      direction: 'outbound', message_type: 'text', status: 'sent',
      content: text, is_from_ai: isFromAI,
    }).catch((e: any) => logger.warn('outbound save failed', { error: e?.message }));
  }

  // ===========================================================================
  // Flow Router
  // ===========================================================================

  private async handleFlow(
    message: Message, client: Client, conversation: Conversation,
    payload: WhatsAppWebhookPayload, isNew: boolean,
  ): Promise<void> {
    const ctx = await this.getFlowContext(conversation.id);

    // "ابدأ من جديد" resets the whole flow instead of being parsed as a request.
    const RESTART = ['من الصفر', 'من البدايه', 'من البداية', 'ابدا من جديد', 'ابدأ من جديد', 'نبدا من جديد', 'رجعني', 'الغي', 'إلغاء', 'restart', 'reset'];
    const normText = normalizeAr((message.content ?? ''));
    // A bare "0" is the documented shortcut back to the main menu. Menus are
    // 1-indexed, so 0 can never collide with an option the customer is picking.
    const isMenuShortcut = /^0+$/.test(normText);
    if (normText && (isMenuShortcut || RESTART.some(w => normText.includes(normalizeAr(w))))) {
      await this.saveFlowContext(conversation.id, { state: 'welcome' });
      await this.reply(client, conversation, 'تمام، نبدأ من جديد');
      await sleep(400);
      await this.stepWelcome(client, conversation, { state: 'welcome' }, true);
      return;
    }
    const clickedId = this.extractButtonId(payload);
    const text = (message.content ?? '').trim();

    // While collecting a seller's / owner's property details, treat the whole
    // message as that free text — checked before the code/compare/booking
    // intercepts so a description that happens to contain a number or the word
    // "موعد" isn't hijacked by them.
    if (ctx.state === 'complaint_intake') { await this.stepComplaintIntake(text, client, conversation, ctx); return; }
    if (ctx.state === 'sell_details') { await this.stepSellDetails(text, client, conversation, ctx); return; }
    if (ctx.state === 'manage_details') { await this.stepManageDetails(text, client, conversation, ctx); return; }

    // "تفاصيل الكود X" or "تفاصيل 2" (referencing the last batch) — checked
    // before the state machine so it works no matter which step the
    // conversation is on. A bare property code always matches on its own;
    // a bare number only counts as a details request alongside a detail word,
    // otherwise "2" during the type/purpose steps would misfire.
    const CODE_PATTERN = /\b[A-Za-z]{2,8}-[A-Za-z0-9]*\d[A-Za-z0-9]*(?:-\d+)?\b/;
    const DETAIL_WORDS = ['تفاصيل', 'تفصيل', 'معلومات عن', 'الكود'];
    const rawText = message.content ?? '';
    const normDetail = normalizeAr(rawText);
    const hasCode = CODE_PATTERN.test(rawText);
    const hasDetailWord = DETAIL_WORDS.some((w) => normDetail.includes(normalizeAr(w)));
    const hasNumber = /\d/.test(normDetail);
    if (hasCode || (hasDetailWord && hasNumber && (ctx.last_shown_properties?.length ?? 0) > 0)) {
      await this.handleDetails(message, client, conversation, ctx);
      return;
    }

    // "قارن 1 و3" against the last batch actually sent — checked before the
    // state machine so it works no matter which step the conversation is on.
    // 'قارن' as a substring also matches 'مقارنة' / 'المقارنة' after normalization.
    const COMPARE_WORDS = ['قارن', 'compare'];
    const normCompare = normalizeAr(message.content ?? '');
    if (normCompare && (ctx.last_shown_properties?.length ?? 0) >= 2 &&
        COMPARE_WORDS.some(w => normCompare.includes(normalizeAr(w)))) {
      await this.handleCompare(message, client, conversation, ctx);
      return;
    }

    // A complaint outranks every other flow: switch modes and stay there.
    const signal = detectComplaint(message.content ?? '');
    if (ctx.state === 'complaint' || signal.isComplaint) {
      await this.handleComplaint(message, client, conversation, ctx, signal);
      return;
    }

    // Booking a viewing — an explicit request any time (but never on a brand
    // new client's very first message, before they've even seen the welcome
    // menu), or a bare "نعم" right after the bot itself offered one.
    if (ctx.state !== 'booking_time' && !isNew) {
      const BOOKING_WORDS = ['معاينة', 'موعد', 'احجز', 'ارتب لي', 'ارتب', 'اعاين'];
      const AGREEMENT_WORDS = ['نعم', 'ايه', 'ايوه', 'اكيد', 'تمام', 'ابشر', 'yes', 'ok'];
      const normBooking = normalizeAr(message.content ?? '');
      const acceptsOffer = Boolean(ctx.booking_prompted) && AGREEMENT_WORDS.some((w) => normBooking === normalizeAr(w));
      const wantsBooking = Boolean(normBooking) && (
        BOOKING_WORDS.some((w) => normBooking.includes(normalizeAr(w))) || acceptsOffer
      );

      // The offer to book is only "live" for the one reply right after it was
      // made — otherwise booking_prompted would stay true forever (nothing
      // else clears it) and an unrelated "تمام" turns/days later, one of the
      // most common throwaway replies in Arabic chat, would be misread as
      // accepting a viewing no one asked about anymore.
      if (ctx.booking_prompted && !wantsBooking) {
        await this.saveFlowContext(conversation.id, { ...ctx, booking_prompted: false });
      }

      if (wantsBooking) {
        await this.startBooking(client, conversation, ctx);
        return;
      }
    }

    if (isNew || ctx.state === 'welcome') { await this.stepWelcome(client, conversation, ctx, isNew); return; }
    if (ctx.state === 'ai' || ctx.state === 'escalated') { await this.processWithAI(message, client, conversation, ctx, payload); return; }
    if (ctx.state === 'intent') { await this.stepIntent(clickedId, text, client, conversation, ctx); return; }
    if (ctx.state === 'category') { await this.stepCategory(clickedId, text, client, conversation, ctx); return; }
    if (ctx.state === 'type') { await this.stepType(clickedId, text, client, conversation, ctx, message); return; }
    if (ctx.state === 'entry') { await this.stepEntry(clickedId, text, client, conversation, ctx, message); return; }
    if (ctx.state === 'booking_time') { await this.stepBookingTime(clickedId, text, client, conversation, ctx); return; }
  }

  // ===========================================================================
  // Option handling — ask once, understand tap / number / free wording
  // ===========================================================================

  /** Send options as a tappable list and remember them for the next reply. */
  private async askOptions(
    client: Client, conversation: Conversation, ctx: FlowContext,
    nextState: FlowState, title: string, body: string, options: FlowOption[],
    extra: Partial<FlowContext> = {},
  ): Promise<void> {
    await whatsappService.sendList(
      client.phone, title, body, 'اختر',
      options.map(o => ({ id: o.id, title: o.title })),
      this.waInstance(conversation),
    );
    // Save the menu as a text message so it appears in the dashboard conversation view.
    const menuText = `${title}\n${body}\n${options.map((o, i) => `${i + 1}. ${o.title}`).join('\n')}`;
    this.saveMessage({
      conversation_id: conversation.id,
      direction: 'outbound', message_type: 'text', status: 'sent',
      content: menuText, is_from_ai: true, exclude_from_ai: true,
    }).catch((e: any) => logger.warn('menu save failed', { error: e?.message }));
    await this.saveFlowContext(conversation.id, { ...ctx, ...extra, state: nextState, pending: options });
  }

  /**
   * Resolve what the customer meant: a tapped row id, the option's number,
   * or their own wording matched against the option title and its keywords.
   */
  private resolveChoice(clickedId: string | null, text: string, ctx: FlowContext): string | null {
    const options = ctx.pending ?? [];
    if (clickedId && options.some(o => o.id === clickedId)) return clickedId;
    if (clickedId) return clickedId;

    const norm = normalizeAr(text);
    if (!norm) return null;

    // "2" / "٢" / "الخيار 2"
    const numMatch = norm.match(/^(?:الخيار\s*)?(\d{1,2})$/);
    if (numMatch) {
      const idx = parseInt(numMatch[1]!, 10) - 1;
      if (idx >= 0 && idx < options.length) return options[idx]!.id;
    }

    // exact title, then keyword, then substring — most specific first
    for (const o of options) if (normalizeAr(o.title) === norm) return o.id;
    for (const o of options) {
      for (const kw of o.keywords ?? []) {
        const k = normalizeAr(kw);
        if (k && (norm === k || norm.includes(k))) return o.id;
      }
    }
    for (const o of options) {
      const t = normalizeAr(o.title);
      if (t && (norm.includes(t) || t.includes(norm))) return o.id;
    }
    return null;
  }

  /** Re-offer the same options without sounding like a broken record. */
  private async reAsk(client: Client, conversation: Conversation, ctx: FlowContext): Promise<void> {
    const options = ctx.pending ?? [];
    if (options.length === 0) return;
    const menu = options.map((o, i) => `${i + 1}. ${o.title}`).join('\n');
    await this.reply(client, conversation, `لم أفهم اختيارك\nاختر من القائمة أو أرسل الرقم:\n\n${menu}`);
  }

  // ===========================================================================
  // Complaint mode — listen, gather, calm, hand over
  // ===========================================================================

  private async handleComplaint(
    message: Message, client: Client, conversation: Conversation,
    ctx: FlowContext, signal: { isComplaint: boolean; level: AngerLevel; category: ComplaintCategory },
  ): Promise<void> {
    const inst = this.waInstance(conversation);
    const text = (message.content ?? '').trim();
    const prev = ctx.complaint;

    // Keep the highest severity seen — a customer who was furious once stays a priority.
    const level = (Math.max(prev?.level ?? 1, signal.level) as AngerLevel);
    const category = prev?.category && prev.category !== 'other' ? prev.category : signal.category;

    // First message in complaint mode: apologise and ask one thing.
    if (!prev) {
      await this.saveFlowContext(conversation.id, {
        ...ctx, state: 'complaint', pending: undefined,
        complaint: { level, category },
      });
      await this.reply(client, conversation, acknowledgement(level));

      // Very angry: do not interrogate, escalate straight away.
      if (level >= 4) {
        await this.escalateComplaint(client, conversation, { level, category, description: text }, inst);
        return;
      }
      return;
    }

    // Fill in whatever is still missing, one question at a time.
    const known = { ...prev, level, category };
    if (!known.description) known.description = text;
    else if (!known.contract) known.contract = /^(لا|لأ|no|ما عندي)/i.test(text) ? 'لا يوجد' : text;

    const question = nextQuestion(known, category);
    if (question) {
      await this.saveFlowContext(conversation.id, { ...ctx, state: 'complaint', complaint: known });
      await this.reply(client, conversation, question);
      return;
    }

    await this.escalateComplaint(client, conversation, known, inst);
  }

  /** Hand the complaint to a human with a full written summary. */
  private async escalateComplaint(
    client: Client, conversation: Conversation,
    data: { level: AngerLevel; category: ComplaintCategory; description?: string; contract?: string },
    inst: string,
  ): Promise<void> {
    const summary = buildAgentSummary({
      clientName: client.full_name,
      phone: client.phone,
      level: data.level,
      category: data.category,
      description: data.description,
      contract: data.contract,
    });

    try {
      await this.db('conversations').where('id', conversation.id)
        .update({ ai_handoff_requested: true, updated_at: new Date() });
      await this.notifyAgent(client, conversation, summary);
    } catch (e: any) {
      logger.error('complaint escalation failed', { clientId: client.id, error: e?.message });
    }

    await this.saveFlowContext(conversation.id, {
      state: 'escalated', complaint: data,
    });
    await this.reply(client, conversation, handoverLine(data.level));
    logger.info('complaint escalated', { clientId: client.id, level: data.level, category: data.category });
  }

  // ===========================================================================
  // Step 1 — Welcome
  // ===========================================================================

  private async stepWelcome(
    client: Client, conversation: Conversation, ctx: FlowContext, isNew: boolean,
  ): Promise<void> {
    const returning = !isNew && Boolean((client as any).status) && (client as any).status !== 'new';

    if (returning) {
      const typeAr: Record<string, string> = {
        land: 'أرض', apartment: 'شقة', villa: 'فيلا', building: 'عمارة', office: 'مكتب',
        showroom: 'محل أو صالة تجارية', warehouse: 'مستودع', farm: 'مزرعة',
      };
      const lastTypes: string[] = (client as any).preferred_property_types ?? [];
      const lastLabel = lastTypes.map((t) => typeAr[t]).filter(Boolean)[0];
      const lastPurpose = (client as any).purpose === 'rent' ? 'إيجار' : (client as any).purpose === 'sale' ? 'شراء' : undefined;
      const lastBudget = (client as any).budget_max as number | undefined;
      const budgetStr = lastBudget
        ? lastBudget >= 1_000_000 ? `${(lastBudget / 1_000_000).toFixed(1)} مليون ريال` : `${Math.round(lastBudget / 1_000)} ألف ريال`
        : undefined;

      const parts = [lastLabel, lastPurpose ? `لل${lastPurpose}` : undefined, budgetStr ? `بميزانية ${budgetStr}` : undefined].filter(Boolean);
      const lastRequest = parts.join(' ');

      await this.reply(client, conversation,
        lastRequest
          ? `أهلاً بعودتك${client.full_name ? ' ' + client.full_name : ''}.\nآخر مرة كنت تدور على ${lastRequest} — نفس الطلب، أو تغيّر شيء؟`
          : `أهلاً بعودتك${client.full_name ? ' ' + client.full_name : ''}.\nكيف أقدر أساعدك اليوم؟`,
      );
      await sleep(500);
    } else {
      await this.reply(client, conversation, `حياك الله\nمعك مساعد *مكتب عبدالحكيم النقيدان العقاري*.`);
      await sleep(500);
    }

    await this.askIntent(client, conversation, ctx);
    await clientService.update(client.id, { status: 'contacted' } as any);
  }

  // ===========================================================================
  // Step 2 — What does the customer want? (the very first choice)
  // rent / buy / invest → continue the existing property-search flow.
  // sell / manage → collect the property's details and hand off to a consultant.
  // ===========================================================================

  private async askIntent(client: Client, conversation: Conversation, ctx: FlowContext): Promise<void> {
    await this.askOptions(client, conversation, ctx, 'intent', 'كيف نقدر نخدمك؟', 'اختر ما يناسبك:', [
      { id: 'intent_rent',   title: 'أبحث عن إيجار',  keywords: ['ايجار', 'استئجار', 'استاجر', 'مستاجر', 'ابي اجار', 'ابغى اجار'] },
      { id: 'intent_buy',    title: 'أبحث عن شراء',   keywords: ['شراء', 'شري', 'اشتري', 'تمليك', 'ابي اشتري'] },
      { id: 'intent_invest', title: 'أبحث عن استثمار', keywords: ['استثمار', 'استثمر', 'عائد', 'دخل'] },
      { id: 'intent_sell',   title: 'أبيع عقاري',      keywords: ['ابيع', 'بيع عقاري', 'ابغى ابيع', 'عندي عقار للبيع', 'اعرض للبيع'] },
      { id: 'intent_manage', title: 'أعرض عقاري لإدارة الأملاك', keywords: ['اداره املاك', 'ادارة املاك', 'اداره', 'تاجير عقاري', 'ادير عقاري'] },
      { id: 'intent_complaint', title: 'تقديم شكوى', keywords: ['شكوي', 'شكوى', 'اشتكي', 'شكاوي', 'مشكله', 'مشكلة', 'اعتراض'] },
    ]);
  }

  private async stepIntent(
    clickedId: string | null, text: string,
    client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    const choice = this.resolveChoice(clickedId, text, ctx);

    if (choice === 'intent_sell') {
      await this.saveFlowContext(conversation.id, { ...ctx, state: 'sell_details', deal_kind: 'sell', pending: undefined });
      await this.reply(client, conversation, 'تمام، عشان نساعدك في بيع عقارك أرسل لنا في رسالة واحدة:\nنوع العقار، الحي، المساحة، السعر المطلوب، ووصف مختصر.');
      return;
    }

    if (choice === 'intent_complaint') {
      await this.saveFlowContext(conversation.id, { ...ctx, state: 'complaint_intake', pending: undefined });
      await this.reply(client, conversation,
        'نعتذر عن أي إزعاج، ويهمّنا رضاك.\n'
        + 'اكتب لنا شكواك بالتفصيل في رسالة واحدة، وسنقوم بتسجيلها ورفعها للقسم المختص فوراً.');
      return;
    }

    if (choice === 'intent_manage') {
      await this.saveFlowContext(conversation.id, { ...ctx, state: 'manage_details', deal_kind: 'manage', pending: undefined });
      await this.reply(client, conversation, 'يسعدنا إدارة عقارك. أرسل لنا في رسالة واحدة:\nنوع العقار، الحي، عدد الوحدات، والوضع الحالي (مؤجر أم شاغر)، وأي تفاصيل تهمك.');
      return;
    }

    const purpose: 'rent' | 'buy' | undefined =
      choice === 'intent_rent' ? 'rent'
      : (choice === 'intent_buy' || choice === 'intent_invest') ? 'buy'
      : undefined;

    if (!purpose) { await this.reAsk(client, conversation, ctx); return; }

    // rent / buy / invest all continue into the existing category → type flow,
    // with the purpose already known so it isn't asked again at the end.
    await this.askOptions(client, conversation, { ...ctx, purpose }, 'category', 'نوع العقار', 'تبحث عن عقار سكني أم تجاري؟', [
      { id: 'cat_residential', title: 'سكني', keywords: ['سكني', 'سكن', 'شقه', 'شقة', 'بيت', 'فيلا', 'عوايل', 'عزاب'] },
      { id: 'cat_commercial',  title: 'تجاري', keywords: ['تجاري', 'محل', 'صاله', 'معرض', 'مكتب', 'مستودع'] },
    ]);
  }

  // ===========================================================================
  // Step 3 — Residential or commercial
  // ===========================================================================

  private async stepCategory(
    clickedId: string | null, text: string,
    client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    const choice = this.resolveChoice(clickedId, text, ctx);

    if (choice === 'cat_residential') {
      await this.askOptions(client, conversation, ctx, 'type', 'نوع العقار السكني', 'اختر ما يناسبك:', [
        { id: 'type_apt_family', title: 'شقة عوائل', keywords: ['شقه عوايل', 'عوايل', 'عائله', 'شقه عائليه', 'شقه'] },
        { id: 'type_apt_single', title: 'شقة عزاب',  keywords: ['عزاب', 'شقه عزاب', 'اعزب', 'مفرد'] },
        { id: 'type_house',      title: 'بيت أو فيلا', keywords: ['بيت', 'دار', 'منزل', 'فيلا', 'قصر'] },
        { id: 'type_land',       title: 'أرض',        keywords: ['ارض', 'اراضي', 'قطعه'] },
      ]);
      return;
    }

    if (choice === 'cat_commercial') {
      await this.askOptions(client, conversation, ctx, 'type', 'النشاط التجاري', 'حدد ما تحتاجه:', [
        { id: 'com_shop',    title: 'محل',     keywords: ['محل', 'دكان'] },
        { id: 'com_hall',    title: 'صالة',    keywords: ['صاله', 'معرض'] },
        { id: 'com_office',  title: 'مكتب',    keywords: ['مكتب', 'اداري'] },
        { id: 'com_storage', title: 'مستودع',  keywords: ['مستودع', 'مخزن'] },
      ]);
      return;
    }

    await this.reAsk(client, conversation, ctx);
  }

  // ===========================================================================
  // Step 3 — Property type (residential sub-type or commercial sub-type)
  // ===========================================================================

  private async stepType(
    clickedId: string | null, text: string,
    client: Client, conversation: Conversation, ctx: FlowContext, message: Message,
  ): Promise<void> {
    const choice = this.resolveChoice(clickedId, text, ctx);
    if (!choice) { await this.reAsk(client, conversation, ctx); return; }

    if (choice === 'type_house' || choice === 'type_apt_family') {
      const entry_for: 'house' | 'apt_family' = choice === 'type_house' ? 'house' : 'apt_family';
      await this.askOptions(client, conversation, ctx, 'entry', 'نوع المدخل', 'ما نوع المدخل المطلوب؟', [
        { id: 'entry_private', title: 'مدخل خاص',   keywords: ['خاص', 'مستقل', 'منفصل'] },
        { id: 'entry_shared',  title: 'مدخل مشترك', keywords: ['مشترك', 'عام'] },
      ], { entry_for });
      return;
    }

    const map: Record<string, string> = {
      type_apt_single: 'apartment_single',
      type_land: 'land',
      com_shop: 'shop', com_hall: 'hall', com_office: 'office', com_storage: 'warehouse',
    };
    const propType = map[choice];
    if (!propType) { await this.reAsk(client, conversation, ctx); return; }

    await this.startSearch(client, conversation, { ...ctx, property_type: propType }, message);
  }

  // ===========================================================================
  // Step 3b — Entry type (house, or family apartment)
  // ===========================================================================

  private async stepEntry(
    clickedId: string | null, text: string,
    client: Client, conversation: Conversation, ctx: FlowContext, message: Message,
  ): Promise<void> {
    const choice = this.resolveChoice(clickedId, text, ctx);
    const map: Record<string, string> = ctx.entry_for === 'apt_family'
      ? { entry_private: 'apartment_family_private', entry_shared: 'apartment_family_shared' }
      : { entry_private: 'house_private', entry_shared: 'house_shared' };
    const finalType = choice ? map[choice] : undefined;
    if (!finalType) { await this.reAsk(client, conversation, ctx); return; }

    await this.startSearch(client, conversation, { ...ctx, property_type: finalType, entry_for: undefined }, message);
  }

  // ===========================================================================
  // Step 4 — Kick off the search. Purpose was chosen up front (stepIntent), so
  // there's no purpose question here — the type completes the request.
  // The office operates in Buraydah only, so location is fixed too.
  // ===========================================================================

  private async startSearch(
    client: Client, conversation: Conversation, ctx: FlowContext, message: Message,
  ): Promise<void> {
    const purpose = ctx.purpose ?? 'buy';
    const newCtx: FlowContext = { ...ctx, state: 'ai', purpose, location: 'بريدة', pending: undefined };
    await this.saveFlowContext(conversation.id, newCtx);

    const typeInfo = PROPERTY_TYPE_MAP[ctx.property_type ?? ''];
    if (typeInfo) {
      await clientService.update(client.id, {
        preferred_property_types: typeInfo.db_types,
        purpose: purpose === 'rent' ? 'rent' : 'sale',
      } as any);
    }

    const purposeAr = purpose === 'rent' ? 'الإيجار' : 'الشراء';
    message.content = `أبحث عن ${typeInfo?.label ?? ctx.property_type ?? 'عقار'} لـ${purposeAr} في بريدة`;

    await this.reply(client, conversation, `${ack()}\n\n${typeInfo?.label ?? 'عقار'}\n\nلحظة أشوف لك أفضل المتاح`);
    await sleep(700);

    await this.processWithAI(message, client, conversation, newCtx, undefined);
  }

  // ===========================================================================
  // Seller / owner details — collect the property, then hand off to a human.
  // Any listing a customer wants to sell, or hand over for management, needs a
  // consultant; the bot's job is only to capture it cleanly and route it.
  // ===========================================================================

  // ===========================================================================
  // Complaint intake (menu option 6) — record it, route it, reassure the
  // customer. Deliberately no interrogation: the customer is already annoyed,
  // so we take the complaint in one message and hand it to a human.
  // ===========================================================================

  private async stepComplaintIntake(
    text: string, client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    const details = text.trim();

    if (details.length < 5) {
      await this.reply(client, conversation,
        'تفضّل بكتابة تفاصيل الشكوى في رسالة واحدة حتى نتمكن من رفعها للقسم المختص.');
      return;
    }

    const signal = detectComplaint(details);
    const summary = buildAgentSummary({
      clientName: client.full_name,
      phone: client.phone,
      level: signal.level,
      category: signal.category,
      description: details,
    });

    // Flag the conversation and notify the team. Recording the complaint must
    // never fail silently — but it also must not block the customer's reply.
    try {
      await this.db('conversations').where('id', conversation.id)
        .update({ ai_handoff_requested: true, updated_at: new Date() });
      await this.notifyAgent(client, conversation, summary);
      logger.info('complaint recorded', {
        clientId: client.id, level: signal.level, category: signal.category,
      });
    } catch (e: any) {
      logger.error('complaint recording failed', { clientId: client.id, error: e?.message });
    }

    // Bot's job ends here: it records and reassures, it does not try to solve.
    await this.saveFlowContext(conversation.id, { ...ctx, state: 'escalated', pending: undefined });

    await this.reply(client, conversation,
      'شكراً لك على إبلاغنا، ونعتذر لك عمّا حصل.\n\n'
      + 'تم تسجيل شكواك ورفعها للقسم المختص، وهي الآن قيد المعالجة.\n'
      + 'سيتواصل معك أحد مستشارينا لمتابعتها معك حتى إغلاقها.\n\n'
      + 'نقدّر ثقتك بنا وحرصك على تنبيهنا.\n'
      + 'مكتب عبدالحكيم النقيدان العقاري');
  }

  private async stepSellDetails(
    text: string, client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    await this.captureOwnerListing(text, client, conversation, ctx, 'عقار للبيع من العميل');
  }

  private async stepManageDetails(
    text: string, client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    await this.captureOwnerListing(text, client, conversation, ctx, 'عقار لإدارة الأملاك من العميل');
  }

  private async captureOwnerListing(
    text: string, client: Client, conversation: Conversation, ctx: FlowContext, label: string,
  ): Promise<void> {
    const inst = this.waInstance(conversation);
    const details = text.trim();

    if (details.length < 5) {
      await this.reply(client, conversation, 'أرسل تفاصيل العقار من فضلك (النوع، الحي، المساحة، السعر، ووصف مختصر) في رسالة واحدة.');
      return;
    }

    // Hand off to a consultant, but keep the bot available for anything else the
    // customer asks next (state 'ai') rather than going silent.
    await this.saveFlowContext(conversation.id, { ...ctx, state: 'ai', deal_kind: undefined, pending: undefined });
    await this.db('conversations').where('id', conversation.id)
      .update({ ai_handoff_requested: true, updated_at: new Date() })
      .catch(() => {});
    await this.notifyAgent(client, conversation, `${label}:\n${details}`);

    await this.reply(client, conversation, withMenuHint(`${ack()}، وصلتنا تفاصيل عقارك.\nبيتواصل معك أحد مستشارينا لإكمال الإجراءات.`));
  }

  // ===========================================================================
  // AI Processing Pipeline
  // ===========================================================================

  private async processWithAI(
    message: Message, client: Client, conversation: Conversation,
    ctx: FlowContext, payload?: WhatsAppWebhookPayload,
  ): Promise<void> {
    const startTime = Date.now();
    try {
      let messageContent = message.content ?? '';

      if (message.message_type === 'audio' && message.media_url) {
        try {
          const buf = await whatsappService.downloadMedia(message.whatsapp_message_id!, this.waInstance(conversation));
          messageContent = await transcribeAudio(buf, message.media_mime_type ?? 'audio/ogg');
          await this.db('messages').where('id', message.id).update({ transcription: messageContent });
        } catch { messageContent = 'رسالة صوتية'; }
      }

      if (message.message_type === 'image' && message.media_url) {
        try { messageContent = await analyzeImage(message.media_url, message.caption ?? undefined); }
        catch { messageContent = message.caption ?? 'أرسل صورة'; }
      }

      if (!messageContent.trim()) messageContent = '[رسالة وسائط]';

      // agent.ts keeps the last 20 of whatever it's handed — fetching only 10
      // here made that cap moot and meant the AI could never see further back
      // than 5 exchanges, "forgetting" things a customer said a bit earlier.
      const history = await this.getConversationHistory(conversation.id, 24, true);

      // Pre-search using flow context. The office operates in Buraydah only, so
      // there is no city/district to filter by — every listing already is one.
      let preloadedProperties: any[] = [];
      try {
        const typeInfo = PROPERTY_TYPE_MAP[ctx.property_type ?? ''];
        const clientTypes: string[] = (client as any).preferred_property_types ?? [];
        // The client wants every matching listing, not a capped sample.
        const params: any = { status: 'available', limit: 200, sort_by: 'featured' };

        const budget = ctx.budget ?? extractBudget(messageContent) ?? (client as any).budget_max;
        if (budget) params.price_max = budget;

        const resolvedType = typeInfo?.db_types[0] ?? clientTypes[0];
        if (resolvedType) params.property_type = resolvedType;
        if (typeInfo?.occupancy) params.occupancy_type = typeInfo.occupancy;
        if (typeInfo?.entrance)  params.entrance_type  = typeInfo.entrance;

        const preResult = await propertyService.search(params);
        preloadedProperties = preResult.properties;

        if (preloadedProperties.length === 0 && budget) {
          preloadedProperties = (await propertyService.search({ ...params, price_max: budget * 1.3 })).properties;
        }
      } catch { /* continue */ }

      const aiResult = await processMessage(messageContent, client, history, preloadedProperties.length > 0 ? preloadedProperties : undefined);

      if (aiResult.extracted_data) {
        // Enriching the client profile is a side effect — never let it stop the reply.
        try {
        const cityId = aiResult.extracted_data.city ? await propertyService.resolveCityId(aiResult.extracted_data.city) : undefined;
        await clientService.updateFromAI(client.id, {
          name: aiResult.extracted_data.client_name,
          budget_max: aiResult.extracted_data.budget_max ?? ctx.budget,
          budget_min: aiResult.extracted_data.budget_min,
          preferred_property_types: aiResult.extracted_data.property_type ? [aiResult.extracted_data.property_type] : undefined,
          city_id: cityId,
          intent: { intent: aiResult.intent.primary, confidence: aiResult.intent.confidence, timestamp: new Date().toISOString(), message_id: message.id },
        });
        } catch (e: any) {
          logger.warn('client profile enrichment skipped', { clientId: client.id, error: e?.message });
        }
      }

      await this.db('messages').where('id', message.id).update({
        ai_processed: true, ai_intent: aiResult.intent.primary, ai_entities: aiResult.extracted_data,
        ai_response_time_ms: aiResult.response_time_ms, ai_model_used: aiResult.model,
        ai_tokens_used: aiResult.tokens_used, ai_cost_usd: aiResult.cost_usd,
      });

      let properties: any[] = [];
      let searchSummary = '';

      if (aiResult.should_send_properties && aiResult.property_search_params) {
        const enriched = await this.enrichSearchParams(aiResult.property_search_params, aiResult.extracted_data, ctx);
        const result = await propertyService.search(enriched);
        properties = result.properties;
        searchSummary = this.buildSearchSummary(ctx, aiResult.extracted_data);

        // A narrowing the AI extracted (a specific feature, district, etc.) can
        // legitimately match nothing even though the broader preloaded search
        // found options. buildContextBlock told the AI those options exist, so
        // its own reply likely already implies results are coming — falling
        // back here avoids sending that text with no properties behind it.
        if (properties.length === 0 && preloadedProperties.length > 0) {
          properties = preloadedProperties;
          searchSummary = 'بنفس المواصفات المطلوبة بالضبط ما لقيت خيار، لكن هذي أقرب المتاح';
        }
      } else if (preloadedProperties.length > 0 && ctx.state === 'ai') {
        properties = preloadedProperties;
        searchSummary = this.buildSearchSummary(ctx, aiResult.extracted_data);
      }

      // Never repeat a listing already sent earlier in this conversation.
      const shownIds = new Set(ctx.shown_property_ids ?? []);
      const matchedBeforeDedup = properties.length;
      properties = properties.filter((p) => !shownIds.has(p.id));
      const allAlreadyShown = matchedBeforeDedup > 0 && properties.length === 0;

      // Analytics only — must never block sending properties to the client.
      if (properties.length > 0) {
        for (const prop of properties) {
          try {
            await propertyService.incrementInquiryCount(prop.id);
            await this.db('client_property_interests')
              .insert({ client_id: client.id, property_id: prop.id, interest_level: 3 })
              .onConflict(['client_id', 'property_id']).ignore();
          } catch (e: any) {
            logger.warn('interest tracking skipped', { error: e?.message });
          }
        }
      }

      let responseText = aiResult.response;
      if (allAlreadyShown) {
        responseText = `${responseText}\n\nهذي كل الخيارات المتوفرة حالياً وسبق أن أرسلتها لك، لا يوجد جديد غيرها حالياً.`;
      }
      // Tracks the flow state actually persisted, so the shown_property_ids
      // save below (which happens last) never clobbers an escalation.
      let currentState = ctx.state;
      if (aiResult.should_escalate) {
        await this.db('conversations').where('id', conversation.id).update({ ai_handoff_requested: true, updated_at: new Date() });
        await this.saveFlowContext(conversation.id, { ...ctx, state: 'escalated' });
        currentState = 'escalated';
        await this.notifyAgent(client, conversation, aiResult.escalation_reason);
        // Only when a human takes over do working hours matter.
        responseText = `${responseText}\n\n${this.handoffNote()}`;
      }

      responseText = withMenuHint(responseText);
      const outboundMsgId = await whatsappService.sendText(client.phone, responseText, this.waInstance(conversation));
      await this.saveMessage({
        conversation_id: conversation.id, whatsapp_message_id: outboundMsgId || undefined,
        direction: 'outbound', message_type: 'text', status: 'sent',
        content: responseText, is_from_ai: true,
      });

      if (properties.length > 0) {
        // sendProperties no longer throws on a single broken image/location —
        // it logs and moves on — so reaching this point means the text list
        // and whatever photos succeeded are already with the customer. Mark
        // them shown only now: if anything above had failed instead, the
        // properties stay unmarked and are still offerable on retry.
        await whatsappService.sendProperties(client.phone, properties, searchSummary, this.waInstance(conversation));
        await this.saveFlowContext(conversation.id, {
          ...ctx,
          state: currentState,
          shown_property_ids: [...shownIds, ...properties.map((p) => p.id)],
          last_shown_properties: properties.map((p) => p.id),
          // formatPropertiesResponse's footer always offers a viewing — a bare
          // "نعم" right after this should be understood as accepting it.
          booking_prompted: true,
        });
      }

      if (['new', 'contacted', 'interested'].includes(client.status)) {
        await this.scheduleFollowUps(client.id);
      }

      logger.info('AI processed', { clientId: client.id, intent: aiResult.intent.primary, props: properties.length, ms: Date.now() - startTime });
    } catch (error: any) {
      recordError('processWithAI', error);
      logger.error('AI pipeline failed', {
        clientId: client.id,
        message: error?.message,
        status: error?.status ?? error?.response?.status,
        code: error?.code,
        body: error?.response?.data ? JSON.stringify(error.response.data).slice(0, 300) : undefined,
      });
      // The guided flow already captured type, city and budget, so we can still
      // search and answer without the AI.
      await this.searchWithoutAI(client, conversation, ctx);
    }
  }

  /**
   * Direct property search from the flow context — used when the AI call fails,
   * so an AI outage never leaves the customer with just an error message.
   */
  private async searchWithoutAI(client: Client, conversation: Conversation, ctx: FlowContext): Promise<void> {
    try {
      // The client wants every matching listing, not a capped sample. No city
      // filter either — the office operates in Buraydah only.
      const params: any = { status: 'available', limit: 200, sort_by: 'featured' };

      const typeInfo = PROPERTY_TYPE_MAP[ctx.property_type ?? ''];
      if (typeInfo?.db_types?.[0]) params.property_type = typeInfo.db_types[0];
      if (typeInfo?.occupancy) params.occupancy_type = typeInfo.occupancy;
      if (typeInfo?.entrance)  params.entrance_type  = typeInfo.entrance;
      if (ctx.budget) params.price_max = ctx.budget;
      if (ctx.purpose) params.purpose = ctx.purpose === 'rent' ? 'rent' : 'sale';

      let { properties } = await propertyService.search(params);

      // Widen the search rather than come back empty-handed.
      if (properties.length === 0 && params.property_type) {
        ({ properties } = await propertyService.search({ ...params, property_type: undefined }));
      }
      if (properties.length === 0 && params.price_max) {
        ({ properties } = await propertyService.search({ ...params, price_max: params.price_max * 1.3 }));
      }

      // Never repeat a listing already sent earlier in this conversation.
      const shownIds = new Set(ctx.shown_property_ids ?? []);
      properties = properties.filter((p) => !shownIds.has(p.id));

      if (properties.length > 0) {
        await whatsappService.sendProperties(
          client.phone, properties, this.buildSearchSummary(ctx, {}), this.waInstance(conversation),
        );
        this.saveMessage({
          conversation_id: conversation.id,
          direction: 'outbound', message_type: 'text', status: 'sent',
          content: `[تم إرسال ${properties.length} عقار] ${this.buildSearchSummary(ctx, {})}`,
          is_from_ai: true, exclude_from_ai: true,
        }).catch(() => {});
        await this.saveFlowContext(conversation.id, {
          ...ctx,
          shown_property_ids: [...shownIds, ...properties.map((p) => p.id)],
          last_shown_properties: properties.map((p) => p.id),
          booking_prompted: true,
        });
        await sleep(400);
        await this.reply(client, conversation, withMenuHint('هل تود ترتيب موعد معاينة لأي منها؟ اكتب رقم العقار أو اسأل عن أي تفاصيل'));
        return;
      }

      await this.reply(client, conversation, withMenuHint('لم أجد حالياً عقاراً مطابقاً لطلبك تماماً.\n\nسجّلت طلبك وسيتواصل معك أحد مستشارينا بأقرب الخيارات المتاحة.\n\n' + this.handoffNote()));
      // Notify the team, but keep the bot listening: an empty result is not a
      // reason to go silent on the customer for the rest of the conversation.
      await this.notifyAgent(client, conversation, 'لا توجد عقارات مطابقة — يحتاج متابعة بشرية');
    } catch (e: any) {
      recordError('searchWithoutAI', e);
      logger.error('searchWithoutAI failed', { clientId: client.id, error: e?.message });
      await this.reply(client, conversation, 'شكراً لتواصلك\nسيتواصل معك أحد مستشارينا لمساعدتك.\n\n' + this.handoffNote());
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async findOrCreateConversation(clientId: string, chatId: string, instance?: string): Promise<Conversation> {
    const existing = await this.db('conversations').where('whatsapp_chat_id', chatId).first() as Conversation | undefined;
    if (existing) {
      // Mark that the stored value (if any) is authoritative, so the caller
      // does not redundantly write it on every message.
      (existing as any).wa_instance_persisted = Boolean((existing as any).wa_instance);
      return existing;
    }
    // Same concurrent-webhook race as findOrCreateByWhatsapp: re-read rather
    // than fail, so a burst of messages can't split one chat into two threads.
    let conv: Conversation | undefined;
    try {
      [conv] = await this.db('conversations')
        .insert({ client_id: clientId, whatsapp_chat_id: chatId, is_active: true, is_ai_enabled: true, unread_count: 0, wa_instance: instance })
        .returning('*') as Conversation[];
    } catch (e: any) {
      if (e?.code === '23505') {
        const raced = await this.db('conversations').where('whatsapp_chat_id', chatId).first() as Conversation | undefined;
        if (raced) return raced;
      }
      throw e;
    }
    if (!conv) throw new Error('Failed to create conversation');
    (conv as any).wa_instance_persisted = true;
    return conv;
  }

  async saveMessage(data: Partial<Message>): Promise<Message> {
    // Knex throws "Undefined binding(s) detected" if any value is undefined
    // (e.g. media/location fields on a plain text message). Strip them first.
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    );
    const [msg] = await this.db('messages').insert(clean).returning('*') as Message[];
    if (!msg) throw new Error('Failed to save message');

    if (data.conversation_id) {
      const updates: Record<string, any> = { last_message_at: msg.created_at ?? new Date() };
      if (data.direction === 'inbound') updates.unread_count = this.db.raw('unread_count + 1');
      this.db('conversations')
        .where('id', data.conversation_id)
        .update(updates)
        .catch((e: any) => logger.warn('conversation update failed', { error: e?.message }));

      if (data.direction === 'inbound') {
        this.db('conversations as cv')
          .join('clients as cl', 'cv.client_id', 'cl.id')
          .where('cv.id', data.conversation_id)
          .select('cl.full_name', 'cl.phone')
          .first()
          .then((info: any) => {
            sseService.broadcast('new_message', {
              conversation_id: data.conversation_id,
              direction: data.direction,
              message_type: data.message_type,
              content: data.content?.slice(0, 200),
              clientName: info?.full_name,
              phone: info?.phone,
            });
          })
          .catch(() => {});
      }
    }
    return msg;
  }

  /**
   * Recent messages, newest last.
   *
   * `forAI` drops rows that are recorded for the dashboard but were never
   * something the bot actually said — tappable menus and internal markers.
   * Replaying those as assistant turns teaches the model to imitate them.
   */
  async getConversationHistory(conversationId: string, limit = 10, forAI = false): Promise<Message[]> {
    const q = this.db('messages').where('conversation_id', conversationId);
    if (forAI) q.where((b) => b.whereNull('exclude_from_ai').orWhere('exclude_from_ai', false));
    return q.orderBy('created_at', 'desc').limit(limit)
      .then((msgs: Message[]) => msgs.reverse());
  }

  private extractMessageContent(payload: WhatsAppWebhookPayload): {
    content?: string; messageType: any; mediaUrl?: string; mimeType?: string;
    lat?: number; lng?: number; locationName?: string;
  } {
    const msg = payload.data.message;
    if (!msg) return { messageType: 'text' };
    if (msg.conversation) return { content: msg.conversation, messageType: 'text' };
    if (msg.extendedTextMessage) return { content: msg.extendedTextMessage.text, messageType: 'text' };

    const BTN: Record<string, string> = {
      intent_rent: 'أبحث عن إيجار', intent_buy: 'أبحث عن شراء', intent_invest: 'أبحث عن استثمار',
      intent_sell: 'أبيع عقاري', intent_manage: 'أعرض عقاري لإدارة الأملاك', intent_complaint: 'تقديم شكوى',
      cat_residential: 'عقار سكني', cat_commercial: 'عقار تجاري',
      type_apt_family: 'شقة عوائل', type_apt_single: 'شقة عزاب',
      type_house: 'بيت أو فيلا', type_land: 'أرض',
      entry_private: 'مدخل خاص', entry_shared: 'مدخل مشترك',
      com_shop: 'محل', com_hall: 'صالة', com_office: 'مكتب', com_storage: 'مستودع',
    };

    if (msg.buttonsResponseMessage) {
      const id = msg.buttonsResponseMessage.selectedButtonId ?? '';
      return { content: BTN[id] ?? msg.buttonsResponseMessage.selectedDisplayText ?? id, messageType: 'text' };
    }
    if (msg.templateButtonReplyMessage) {
      const id = msg.templateButtonReplyMessage.selectedId ?? '';
      return { content: BTN[id] ?? msg.templateButtonReplyMessage.selectedDisplayText ?? id, messageType: 'text' };
    }
    if (msg.listResponseMessage) {
      const id = msg.listResponseMessage.singleSelectReply?.selectedRowId ?? '';
      return { content: BTN[id] ?? msg.listResponseMessage.title ?? id, messageType: 'text' };
    }
    if (msg.imageMessage) return { content: msg.imageMessage.caption, mediaUrl: msg.imageMessage.url, mimeType: msg.imageMessage.mimetype, messageType: 'image' };
    if (msg.videoMessage) return { content: msg.videoMessage.caption, mediaUrl: msg.videoMessage.url, mimeType: msg.videoMessage.mimetype, messageType: 'video' };
    if (msg.audioMessage) return { mediaUrl: msg.audioMessage.url, mimeType: msg.audioMessage.mimetype, messageType: 'audio' };
    if (msg.documentMessage) return { mediaUrl: msg.documentMessage.url, mimeType: msg.documentMessage.mimetype, content: msg.documentMessage.title, messageType: 'document' };
    if (msg.locationMessage) return { lat: msg.locationMessage.degreesLatitude, lng: msg.locationMessage.degreesLongitude, locationName: msg.locationMessage.name, messageType: 'location' };
    if (msg.stickerMessage) return { mediaUrl: msg.stickerMessage.url, messageType: 'sticker' };
    return { messageType: 'text' };
  }

  private isWithinWorkingHours(): boolean {
    const utc = Date.now() + new Date().getTimezoneOffset() * 60000;
    const riyadh = new Date(utc + 3 * 3600000);
    if (riyadh.getDay() === 5) return false;
    const mins = riyadh.getHours() * 60 + riyadh.getMinutes();
    return (mins >= 570 && mins < 720) || (mins >= 960 && mins < 1290);
  }

  // Note appended when a conversation is handed off to a human agent.
  // Within working hours → contacted shortly; outside → shown the working hours.
  private handoffNote(): string {
    if (this.isWithinWorkingHours()) {
      return 'سيتواصل معك أحد مستشارينا خلال لحظات لمساعدتك.';
    }
    return 'سيتواصل معك أحد مستشارينا في أقرب وقت خلال ساعات العمل:\nصباحاً: 9:30 - 12:00\nمساءً: 4:00 - 9:30\n\nونحن سعداء بخدمتك دائماً.';
  }

  private async enrichSearchParams(params: PropertySearchParams, extracted: any, ctx: FlowContext): Promise<PropertySearchParams> {
    const enriched = { ...params };
    // Buraydah is implicit for the whole business — only filter when the
    // customer volunteers a specific district, so a mention still narrows results.
    const typeInfo = PROPERTY_TYPE_MAP[ctx.property_type ?? ''];
    if (typeInfo?.occupancy) enriched.occupancy_type = typeInfo.occupancy;
    if (typeInfo?.entrance)  enriched.entrance_type  = typeInfo.entrance;
    const district = extracted.district ?? extracted.city;
    if (district) {
      const distId = await propertyService.resolveDistrictId(district);
      if (distId) enriched.district_ids = [distId];
    }
    return enriched;
  }

  private buildSearchSummary(ctx: FlowContext, extracted: any): string {
    const parts: string[] = [];
    const typeInfo = PROPERTY_TYPE_MAP[ctx.property_type ?? ''];
    if (typeInfo) parts.push(typeInfo.label);
    const loc = extracted.district ?? extracted.city;
    if (loc) parts.push(`في ${loc}`);
    const budget = ctx.budget ?? extracted.budget_max;
    if (budget) parts.push(`بميزانية ${budget >= 1_000_000 ? (budget/1_000_000).toFixed(1)+' مليون' : (budget/1_000).toFixed(0)+' ألف'} ريال`);
    if (Array.isArray(extracted.special_requirements) && extracted.special_requirements.length) {
      parts.push(`فيها ${extracted.special_requirements.join(' و')}`);
    }
    return parts.join(' ') || 'طلبك';
  }

  // ===========================================================================
  // Viewing booking — concrete time slots instead of free-text date parsing,
  // consistent with how every other choice in this bot works (a tappable
  // list, not an open question that has to be guessed at).
  // ===========================================================================

  private async startBooking(client: Client, conversation: Conversation, ctx: FlowContext): Promise<void> {
    // Attach the property automatically when there's exactly one candidate;
    // with several recently shown, ask instead of guessing which one.
    const shown = ctx.last_shown_properties ?? [];
    const property_id = shown.length === 1 ? shown[0] : undefined;

    await this.askOptions(client, conversation, ctx, 'booking_time', 'موعد المعاينة', 'أي وقت يناسبك؟', [
      { id: 'slot_0', title: 'غداً 10:30 صباحاً', keywords: ['غدا صباح', 'بكرة صباح'] },
      { id: 'slot_1', title: 'غداً 5:00 مساءً',   keywords: ['غدا مساء', 'بكرة مساء'] },
      { id: 'slot_2', title: 'بعد غد 10:30 صباحاً', keywords: ['بعد بكرة صباح'] },
      { id: 'slot_3', title: 'بعد غد 5:00 مساءً',   keywords: ['بعد بكرة مساء'] },
      { id: 'slot_other', title: 'وقت آخر',        keywords: ['وقت اخر', 'غير كذا'] },
    ], { booking: { property_id }, booking_prompted: false });
  }

  private async stepBookingTime(
    clickedId: string | null, text: string,
    client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    const inst = this.waInstance(conversation);
    const choice = this.resolveChoice(clickedId, text, ctx);

    const slots: Record<string, Date> = {
      slot_0: riyadhSlot(1, 10, 30), slot_1: riyadhSlot(1, 17, 0),
      slot_2: riyadhSlot(2, 10, 30), slot_3: riyadhSlot(2, 17, 0),
    };

    if (choice === 'slot_other') {
      await this.saveFlowContext(conversation.id, { ...ctx, state: 'escalated', pending: undefined });
      await this.db('conversations').where('id', conversation.id).update({ ai_handoff_requested: true, updated_at: new Date() });
      await this.reply(client, conversation, 'تمام، دوّن الوقت اللي يناسبك وبيتواصل معك أحد مستشارينا لتثبيت الموعد مباشرة.');
      await this.notifyAgent(client, conversation, `العميل يطلب موعد معاينة بوقت مخصص: "${text}"`);
      return;
    }

    const scheduled_at = choice ? slots[choice] : undefined;
    if (!scheduled_at) { await this.reAsk(client, conversation, ctx); return; }

    let propertyTitle = 'معاينة عقار';
    const propertyId = ctx.booking?.property_id;
    if (propertyId) {
      const property = await propertyService.findById(propertyId).catch(() => null);
      if (property) propertyTitle = `معاينة: ${property.title_ar ?? property.title}`;
    }

    try {
      await appointmentService.create({
        client_id: client.id,
        property_id: propertyId,
        title: propertyTitle,
        status: 'scheduled',
        scheduled_at,
        duration_minutes: 30,
        location: 'حسب موقع العقار — سيتم التأكيد مع المستشار',
      } as any);
      // appointmentService.create already sends its own WhatsApp confirmation.
      await this.saveFlowContext(conversation.id, { ...ctx, state: 'ai', booking: undefined, pending: undefined });
    } catch (e: any) {
      logger.error('appointment booking failed', { clientId: client.id, error: e?.message });
      await this.reply(client, conversation, 'صار خطأ تقني وأنا أحاول أثبت الموعد، وبيتواصل معك أحد مستشارينا لتأكيده يدوياً.');
      await this.notifyAgent(client, conversation, 'فشل حجز موعد معاينة آلياً — يحتاج تثبيت يدوي');
      await this.saveFlowContext(conversation.id, { ...ctx, state: 'ai', booking: undefined, pending: undefined });
    }
  }

  // ===========================================================================
  // Property details — a specific code, or a number from the last batch sent
  // ===========================================================================

  private async handleDetails(
    message: Message, client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    const inst = this.waInstance(conversation);
    const raw = (message.content ?? '').trim();

    let property: any = null;

    const codeMatch = raw.match(/\b[A-Za-z]{2,8}-[A-Za-z0-9]*\d[A-Za-z0-9]*(?:-\d+)?\b/);
    if (codeMatch) {
      property = await propertyService.findByCode(codeMatch[0]);
    }

    if (!property) {
      const shown = ctx.last_shown_properties ?? [];
      const numMatch = normalizeAr(raw).match(/\d+/);
      const idx = numMatch ? parseInt(numMatch[0], 10) : NaN;
      if (shown.length && idx >= 1 && idx <= shown.length) {
        property = await propertyService.findById(shown[idx - 1]!);
      }
    }

    if (!property) {
      await this.reply(client, conversation, 'اكتب كود العقار، أو رقمه من آخر قائمة أرسلتها لك، عشان أعرض لك التفاصيل الكاملة.');
      return;
    }

    await this.reply(client, conversation, withMenuHint(formatPropertyDetails(property)));

    // findByCode doesn't join property_media, and a "details" request is the
    // one moment the customer explicitly wants everything — not just the
    // single cover photo the compact list uses. Re-fetch by id to get the
    // full gallery (findById does the join), capped so a property with a
    // huge album doesn't flood the chat.
    const full = await propertyService.findById(property.id).catch(() => null);
    const gallery = [property.main_image_url, ...((full?.media ?? []).map((m: any) => m.url))]
      .filter((url, i, arr): url is string => Boolean(url) && arr.indexOf(url) === i)
      .slice(0, 6);

    for (const url of gallery) {
      await whatsappService.sendImage(client.phone, url, undefined, inst).catch(() => {});
      await sleep(500);
    }

    if (property.latitude && property.longitude) {
      await whatsappService.sendLocation(
        client.phone, property.latitude, property.longitude,
        property.title_ar ?? property.title, property.address, inst,
      ).catch(() => {});
    }
    await propertyService.incrementViewCount(property.id).catch(() => {});
  }

  // ===========================================================================
  // Property comparison — "قارن 1 و3" against the last batch actually sent
  // ===========================================================================

  private async handleCompare(
    message: Message, client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    const inst = this.waInstance(conversation);
    const shown = ctx.last_shown_properties ?? [];

    const norm = normalizeAr(message.content ?? '');
    const numbers = [...new Set([...norm.matchAll(/\d+/g)].map((m) => parseInt(m[0], 10)))];
    const picks = numbers.filter((n) => n >= 1 && n <= shown.length);

    if (picks.length < 2) {
      await this.reply(client, conversation, `اكتب أرقام العقارات اللي تبي تقارن بينها من آخر قائمة أرسلتها لك، مثل: قارن 1 و3 (من 1 إلى ${shown.length}).`);
      return;
    }

    const capped = picks.slice(0, 5);
    const properties = await Promise.all(capped.map((n) => propertyService.findById(shown[n - 1]!)));
    const pairs = capped
      .map((n, i) => ({ n, p: properties[i] }))
      .filter((x): x is { n: number; p: NonNullable<typeof x.p> } => Boolean(x.p));

    if (pairs.length < 2) {
      await this.reply(client, conversation, 'تعذر إيجاد بعض العقارات المطلوبة للمقارنة، جرّب أرقاماً من آخر قائمة أرسلتها لك.');
      return;
    }

    await this.reply(client, conversation, withMenuHint(this.buildComparisonMessage(pairs)));
  }

  private buildComparisonMessage(pairs: { n: number; p: any }[]): string {
    const typeAr: Record<string, string> = {
      land: 'أرض', apartment: 'شقة', villa: 'فيلا', building: 'عمارة', office: 'مكتب',
      showroom: 'معرض', warehouse: 'مستودع', farm: 'مزرعة', investment_project: 'مشروع استثماري', other: 'عقار',
    };
    const fields: [string, (p: any) => string][] = [
      ['النوع', (p) => typeAr[p.property_type] ?? 'عقار'],
      ['الغرض', (p) => (p.purpose === 'rent' ? 'إيجار' : 'بيع')],
      ['السعر', (p) => (p.price ? `${Number(p.price).toLocaleString('en-US')} ريال` : '—')],
      ['الغرف', (p) => (p.rooms ? String(p.rooms) : '—')],
      ['الحمامات', (p) => (p.bathrooms ? String(p.bathrooms) : '—')],
      ['المطبخ', (p) => (p.kitchens ? String(p.kitchens) : '—')],
      ['الصالة', (p) => (p.living_rooms ? String(p.living_rooms) : '—')],
      ['الموقع', (p) => [p.district_name, p.city_name].filter(Boolean).join(' - ') || '—'],
      ['الكود', (p) => p.code ?? '—'],
    ];

    const blocks = fields.map(([label, get]) => {
      const lines = pairs.map(({ n, p }) => `${n}) ${get(p)}`).join('\n');
      return `*${label}*\n${lines}`;
    });

    return `مقارنة بين العقارات:\n\n${blocks.join('\n\n')}`;
  }

  private async scheduleFollowUps(clientId: string): Promise<void> {
    const now = new Date();
    for (const { type, days } of [
      { type: 'auto_1day', days: 1 }, { type: 'auto_3days', days: 3 },
      { type: 'auto_1week', days: 7 }, { type: 'auto_1month', days: 30 },
    ]) {
      const scheduledAt = new Date(now.getTime() + days * 86400000);
      scheduledAt.setHours(10, 0, 0, 0);
      await clientService.scheduleFollowUp(clientId, type, scheduledAt);
    }
  }

  private async notifyAgent(client: Client, conversation: Conversation, reason?: string): Promise<void> {
    const agentId = conversation.assigned_agent_id ?? client.assigned_agent_id;
    const targets = agentId
      ? [{ id: agentId }]
      : await this.db('users').whereIn('role', ['super_admin', 'admin', 'sales_manager']).where('is_active', true).select('id');

    for (const t of targets) {
      await this.db('notifications').insert({
        user_id: t.id,
        notification_type: 'new_message',
        title: `تحويل محادثة — ${client.full_name}`,
        body: reason ?? 'طلب العميل التحدث مع موظف',
        data: { client_id: client.id, conversation_id: conversation.id },
      });
    }
  }

  async getStats(): Promise<{ total_messages_today: number; ai_responses_today: number; active_conversations: number }> {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [msgs] = await this.db('messages').where('created_at', '>=', today).select(
      this.db.raw('COUNT(*) as total'),
      this.db.raw('COUNT(*) FILTER (WHERE is_from_ai = true) as ai_count')
    ) as any[];
    const [{ active }] = await this.db('conversations').where('is_active', true).count('id as active') as any[];
    return {
      total_messages_today: parseInt(msgs.total, 10),
      ai_responses_today: parseInt(msgs.ai_count, 10),
      active_conversations: parseInt(active, 10),
    };
  }
}

export const conversationService = new ConversationService();
