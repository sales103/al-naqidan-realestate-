import { getDatabase } from '../database/connection.js';
import { cacheGet, cacheSet, cacheKeys } from '../database/redis.js';
import { logger } from '../config/logger.js';
import { config } from '../config/index.js';
import { processMessage, transcribeAudio, analyzeImage } from '../ai/agent.js';
import { propertyService } from './property.service.js';
import { clientService } from './client.service.js';
import { whatsappService } from './whatsapp.service.js';
import { sseService } from './sse.service.js';
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

type FlowState = 'welcome' | 'purpose' | 'type' | 'entry' | 'location' | 'budget' | 'ai' | 'escalated';

/** One selectable option. `keywords` let the customer answer in their own words. */
interface FlowOption {
  id: string;
  title: string;
  keywords?: string[];
}

interface FlowContext {
  state: FlowState;
  purpose?: 'rent' | 'buy';
  property_type?: string;
  location?: string;
  budget?: number;
  /** Options last offered, so a bare "2" can be resolved back to its option. */
  pending?: FlowOption[];
}

const PROPERTY_TYPE_MAP: Record<string, { db_types: string[]; label: string }> = {
  apartment_family: { db_types: ['apartment', 'villa'], label: 'شقة عوائل' },
  apartment_single: { db_types: ['apartment'],          label: 'شقة عزاب' },
  house_private:    { db_types: ['villa'],              label: 'بيت مدخل خاص' },
  house_shared:     { db_types: ['villa'],              label: 'بيت مدخل مشترك' },
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
  const h = new Date(Date.now() + 3 * 3600000).getHours();
  if (h < 12) return 'صباح الخير ☀️';
  if (h < 17) return 'مساء الخير 🌤';
  return 'مساء النور 🌙';
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

const OPEN_BUDGET = ['مفتوح', 'مو محدد', 'ما عندي', 'حسب', 'اي شي', 'مافي', 'غير محدد'];

export class ConversationService {
  private get db() { return getDatabase(); }

  private extractButtonId(payload: WhatsAppWebhookPayload): string | null {
    const msg = payload.data.message;
    if (!msg) return null;
    return msg.buttonsResponseMessage?.selectedButtonId
      ?? msg.templateButtonReplyMessage?.selectedId
      ?? msg.listResponseMessage?.singleSelectReply?.selectedRowId
      ?? null;
  }

  private async getFlowContext(conversationId: string): Promise<FlowContext> {
    const conv = await this.db('conversations').where('id', conversationId).first();
    const ctx = conv?.conversation_context as FlowContext | undefined;
    // Empty/default context ('{}') has no state — treat it as a fresh welcome.
    return ctx && ctx.state ? ctx : { state: 'welcome' };
  }

  private async saveFlowContext(conversationId: string, ctx: FlowContext): Promise<void> {
    try {
      await this.db('conversations')
        .where('id', conversationId)
        .update({ conversation_context: JSON.stringify(ctx), updated_at: new Date() });
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
      try {
        const existing = await this.db('messages').where('whatsapp_message_id', whatsappMessageId).first();
        if (existing) return;
      } catch (e: any) {
        logger.warn('dedup check skipped', { error: e?.message });
      }

      const { client, isNew } = await clientService.findOrCreateByWhatsapp(chatId, phone, payload.data.pushName);
      const conversation = await this.findOrCreateConversation(client.id, chatId);
      // Remember which WhatsApp number received this message so we reply from the same one.
      (conversation as any).wa_instance = payload.instance || config.whatsapp.instanceName;
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

      // Only an explicit false disables the AI — a missing column must not silence the bot.
      if (conversation.is_ai_enabled === false || conversation.ai_handoff_requested === true) {
        // Log it: a silent return is impossible to diagnose from the outside.
        logger.info('AI reply skipped', {
          conversationId: conversation.id,
          is_ai_enabled: conversation.is_ai_enabled,
          handoff: conversation.ai_handoff_requested,
        });
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
    if (normText && RESTART.some(w => normText.includes(normalizeAr(w)))) {
      await this.saveFlowContext(conversation.id, { state: 'welcome' });
      await whatsappService.sendText(client.phone, 'تمام، نبدأ من جديد 👌', this.waInstance(conversation));
      await sleep(400);
      await this.stepWelcome(client, conversation, { state: 'welcome' });
      return;
    }
    const clickedId = this.extractButtonId(payload);
    const text = (message.content ?? '').trim();

    if (isNew || ctx.state === 'welcome') { await this.stepWelcome(client, conversation, ctx); return; }
    if (ctx.state === 'ai' || ctx.state === 'escalated') { await this.processWithAI(message, client, conversation, ctx, payload); return; }
    if (ctx.state === 'purpose') { await this.stepPurpose(clickedId, text, client, conversation, ctx); return; }
    if (ctx.state === 'type') { await this.stepType(clickedId, text, client, conversation, ctx); return; }
    if (ctx.state === 'entry') { await this.stepEntry(clickedId, text, client, conversation, ctx); return; }
    if (ctx.state === 'location') { await this.stepLocation(text, client, conversation, ctx); return; }
    if (ctx.state === 'budget') { await this.stepBudget(text, client, conversation, ctx, message); return; }
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
    await whatsappService.sendText(
      client.phone,
      `لم أفهم اختيارك 🙂\nاختر من القائمة أو أرسل الرقم:\n\n${menu}`,
      this.waInstance(conversation),
    );
  }

  // ===========================================================================
  // Step 1 — Welcome
  // ===========================================================================

  private async stepWelcome(client: Client, conversation: Conversation, ctx: FlowContext): Promise<void> {
    await whatsappService.sendText(
      client.phone,
      `${getRiyadhGreeting()}\nأهلاً بك في *مكتب عبدالحكيم النقيدان للاستثمارات العقارية* 🏢\n\nنسعد بخدمتك — اختر ما تبحث عنه:`,
      this.waInstance(conversation),
    );
    await sleep(500);
    await this.askOptions(client, conversation, ctx, 'purpose', 'نوع الطلب', 'اختر ما يناسبك:', [
      { id: 'purpose_rent', title: '🔑 إيجار', keywords: ['ايجار', 'استئجار', 'مستاجر', 'ابغى استاجر', 'للايجار'] },
      { id: 'purpose_buy',  title: '🏠 شراء', keywords: ['شراء', 'شري', 'اشتري', 'تمليك', 'بيع', 'للبيع'] },
    ]);
    await clientService.update(client.id, { status: 'contacted' } as any);
  }

  // ===========================================================================
  // Step 2 — Purpose
  // ===========================================================================

  private async stepPurpose(
    clickedId: string | null, text: string,
    client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    const choice = this.resolveChoice(clickedId, text, ctx);
    const purpose: 'rent' | 'buy' | undefined =
      choice === 'purpose_rent' ? 'rent' : choice === 'purpose_buy' ? 'buy' : undefined;

    if (!purpose) { await this.reAsk(client, conversation, ctx); return; }

    const options: FlowOption[] = purpose === 'rent'
      ? [
          { id: 'type_apt_family', title: '🏘 شقة عوائل', keywords: ['شقه عوايل', 'عوايل', 'عائله', 'شقه عائليه', 'شقه'] },
          { id: 'type_apt_single', title: '👤 شقة عزاب',  keywords: ['عزاب', 'شقه عزاب', 'اعزب', 'مفرد'] },
          { id: 'type_house',      title: '🏡 بيت',        keywords: ['بيت', 'دار', 'منزل', 'فيلا'] },
          { id: 'type_commercial', title: '🏪 محل أو صالة تجارية', keywords: ['تجاري', 'محل', 'صاله', 'معرض', 'مكتب', 'مستودع'] },
        ]
      : [
          { id: 'type_apt_family', title: '🏘 شقة', keywords: ['شقه', 'شقق', 'دور'] },
          { id: 'type_house',      title: '🏡 فيلا أو بيت', keywords: ['فيلا', 'بيت', 'منزل', 'دار', 'قصر'] },
          { id: 'type_land',       title: '📍 أرض', keywords: ['ارض', 'اراضي', 'قطعه'] },
          { id: 'type_commercial', title: '🏢 عقار تجاري', keywords: ['تجاري', 'محل', 'صاله', 'مكتب', 'مستودع', 'عماره'] },
        ];

    await this.askOptions(
      client, conversation, ctx, 'type',
      'نوع العقار', purpose === 'rent' ? 'ما الذي تبحث عنه للإيجار؟' : 'ما الذي ترغب بشرائه؟',
      options, { purpose },
    );
  }

  // ===========================================================================
  // Step 3 — Property type
  // ===========================================================================

  private async stepType(
    clickedId: string | null, text: string,
    client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    const choice = this.resolveChoice(clickedId, text, ctx);
    if (!choice) { await this.reAsk(client, conversation, ctx); return; }

    if (choice === 'type_house') {
      await this.askOptions(client, conversation, ctx, 'entry', 'نوع المدخل', 'ما نوع المدخل المطلوب؟', [
        { id: 'entry_private', title: '🔒 مدخل خاص',   keywords: ['خاص', 'مستقل', 'منفصل'] },
        { id: 'entry_shared',  title: '🚪 مدخل مشترك', keywords: ['مشترك', 'عام'] },
      ]);
      return;
    }

    if (choice === 'type_commercial') {
      await this.askOptions(client, conversation, ctx, 'entry', 'النشاط التجاري', 'حدد ما تحتاجه:', [
        { id: 'com_shop',    title: '🏪 محل',     keywords: ['محل', 'دكان'] },
        { id: 'com_hall',    title: '🏬 صالة',    keywords: ['صاله', 'معرض'] },
        { id: 'com_office',  title: '🏢 مكتب',    keywords: ['مكتب', 'اداري'] },
        { id: 'com_storage', title: '📦 مستودع',  keywords: ['مستودع', 'مخزن'] },
      ], { property_type: 'commercial' });
      return;
    }

    const map: Record<string, string> = {
      type_apt_family: 'apartment_family',
      type_apt_single: 'apartment_single',
      type_land: 'land',
    };
    const propType = map[choice];
    if (!propType) { await this.reAsk(client, conversation, ctx); return; }

    await this.askLocation(client, conversation, { ...ctx, property_type: propType });
  }

  // ===========================================================================
  // Step 3b — Entry / commercial sub-type
  // ===========================================================================

  private async stepEntry(
    clickedId: string | null, text: string,
    client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    const choice = this.resolveChoice(clickedId, text, ctx);
    const map: Record<string, string> = {
      entry_private: 'house_private', entry_shared: 'house_shared',
      com_shop: 'shop', com_hall: 'hall', com_office: 'office', com_storage: 'warehouse',
    };
    const finalType = choice ? map[choice] : undefined;
    if (!finalType) { await this.reAsk(client, conversation, ctx); return; }

    await this.askLocation(client, conversation, { ...ctx, property_type: finalType });
  }

  // ===========================================================================
  // Step 4 — Location
  // ===========================================================================

  private async askLocation(client: Client, conversation: Conversation, ctx: FlowContext): Promise<void> {
    await this.saveFlowContext(conversation.id, { ...ctx, state: 'location', pending: undefined });
    const label = PROPERTY_TYPE_MAP[ctx.property_type ?? '']?.label ?? 'العقار';
    await whatsappService.sendText(
      client.phone,
      `ممتاز — ${label} ✅\n\n📍 في أي *مدينة أو حي* تبحث؟\n_اكتب الاسم، مثال: بريدة — أو حي النخيل_`,
      this.waInstance(conversation),
    );
  }

  private async stepLocation(
    text: string, client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    const location = text.trim();
    if (normalizeAr(location).length < 2) {
      await whatsappService.sendText(
        client.phone, '📍 اكتب اسم المدينة أو الحي من فضلك\n_مثال: بريدة — أو حي الروضة_',
        this.waInstance(conversation),
      );
      return;
    }

    await this.saveFlowContext(conversation.id, { ...ctx, state: 'budget', location, pending: undefined });
    await clientService.update(client.id, { district: location } as any);

    const hint = ctx.purpose === 'rent'
      ? '_مثال: 20 ألف — أو اكتب 20 فقط — أو مفتوح_'
      : '_مثال: 800 ألف — أو 1.5 مليون — أو مفتوح_';
    await whatsappService.sendText(
      client.phone,
      `شكراً 🙏\n\n💰 ما هي *ميزانيتك التقريبية*؟\n${hint}`,
      this.waInstance(conversation),
    );
  }

  // ===========================================================================
  // Step 5 — Budget, then hand over to the AI
  // ===========================================================================

  private async stepBudget(
    text: string, client: Client, conversation: Conversation, ctx: FlowContext, message: Message,
  ): Promise<void> {
    const norm = normalizeAr(text);
    const isOpen = OPEN_BUDGET.some(w => norm.includes(normalizeAr(w)));
    const budget = isOpen ? undefined : extractBudget(text, ctx.purpose);

    if (!budget && !isOpen) {
      await whatsappService.sendText(
        client.phone,
        `💰 اكتب الميزانية بالأرقام من فضلك\n${ctx.purpose === 'rent' ? '_مثال: 20 ألف — أو 20_' : '_مثال: 800 ألف — أو 1.5 مليون_'}\nأو اكتب *مفتوح* إذا لم تحددها بعد`,
        this.waInstance(conversation),
      );
      return;
    }

    if (budget) await clientService.update(client.id, { budget_max: budget } as any);

    const newCtx: FlowContext = { ...ctx, state: 'ai', budget, pending: undefined };
    await this.saveFlowContext(conversation.id, newCtx);

    const typeInfo = PROPERTY_TYPE_MAP[ctx.property_type ?? ''];
    if (typeInfo) {
      await clientService.update(client.id, {
        preferred_property_types: typeInfo.db_types,
        purpose: ctx.purpose === 'rent' ? 'rent' : 'sale',
      } as any);
    }

    const purposeAr = ctx.purpose === 'rent' ? 'الإيجار' : 'الشراء';
    const budgetStr = budget
      ? budget >= 1_000_000 ? `${(budget / 1_000_000).toFixed(1)} مليون ريال` : `${Math.round(budget / 1_000)} ألف ريال`
      : 'ميزانية مفتوحة';

    message.content = `أبحث عن ${typeInfo?.label ?? ctx.property_type ?? 'عقار'} لـ${purposeAr} في ${ctx.location ?? ''} بميزانية ${budgetStr}`;

    await whatsappService.sendText(
      client.phone,
      `تمام ✅\n\n*ملخص طلبك*\n🏠 ${typeInfo?.label ?? 'عقار'}\n📍 ${ctx.location ?? '—'}\n💰 ${budgetStr}\n\n🔍 جاري البحث عن أفضل الخيارات المتاحة...`,
      this.waInstance(conversation),
    );
    await sleep(700);

    await this.processWithAI(message, client, conversation, newCtx, undefined);
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
          const buf = await whatsappService.downloadMedia(message.whatsapp_message_id!);
          messageContent = await transcribeAudio(buf, message.media_mime_type ?? 'audio/ogg');
          await this.db('messages').where('id', message.id).update({ transcription: messageContent });
        } catch { messageContent = 'رسالة صوتية'; }
      }

      if (message.message_type === 'image' && message.media_url) {
        try { messageContent = await analyzeImage(message.media_url, message.caption ?? undefined); }
        catch { messageContent = message.caption ?? 'أرسل صورة'; }
      }

      if (!messageContent.trim()) messageContent = '[رسالة وسائط]';

      const history = await this.getConversationHistory(conversation.id, 10);

      // Pre-search using flow context
      let preloadedProperties: any[] = [];
      try {
        const typeInfo = PROPERTY_TYPE_MAP[ctx.property_type ?? ''];
        const clientTypes: string[] = (client as any).preferred_property_types ?? [];
        const params: any = { status: 'available', limit: 5, sort_by: 'featured' };

        const budget = ctx.budget ?? extractBudget(messageContent) ?? (client as any).budget_max;
        if (budget) params.price_max = budget;

        const resolvedType = typeInfo?.db_types[0] ?? clientTypes[0];
        if (resolvedType) params.property_type = resolvedType;

        const location = ctx.location ?? (client as any).district;
        if (location) {
          const cityId = await propertyService.resolveCityId(location);
          if (cityId) params.city_ids = [cityId];
          else {
            const distId = await propertyService.resolveDistrictId(location);
            if (distId) params.district_ids = [distId];
          }
        }

        const preResult = await propertyService.search(params);
        preloadedProperties = preResult.properties;

        if (preloadedProperties.length === 0) {
          const relaxed = { ...params, city_ids: undefined, district_ids: undefined, price_max: budget ? budget * 1.3 : undefined };
          preloadedProperties = (await propertyService.search(relaxed)).properties;
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
        for (const prop of properties.slice(0, 3)) {
          // Analytics only — must never block sending properties to the client.
          try {
            await propertyService.incrementInquiryCount(prop.id);
            await this.db('client_property_interests')
              .insert({ client_id: client.id, property_id: prop.id, interest_level: 3 })
              .onConflict(['client_id', 'property_id']).ignore();
          } catch (e: any) {
            logger.warn('interest tracking skipped', { error: e?.message });
          }
        }
      } else if (preloadedProperties.length > 0 && ctx.state === 'ai') {
        properties = preloadedProperties.slice(0, 3);
        searchSummary = this.buildSearchSummary(ctx, aiResult.extracted_data);
      }

      let responseText = aiResult.response;
      if (aiResult.should_escalate) {
        await this.db('conversations').where('id', conversation.id).update({ ai_handoff_requested: true, updated_at: new Date() });
        await this.saveFlowContext(conversation.id, { ...ctx, state: 'escalated' });
        await this.notifyAgent(client, conversation, aiResult.escalation_reason);
        // Only when a human takes over do working hours matter.
        responseText = `${responseText}\n\n${this.handoffNote()}`;
      }

      const outboundMsgId = await whatsappService.sendText(client.phone, responseText, this.waInstance(conversation));
      await this.saveMessage({
        conversation_id: conversation.id, whatsapp_message_id: outboundMsgId,
        direction: 'outbound', message_type: 'text', status: 'sent',
        content: responseText, is_from_ai: true,
      });

      if (properties.length > 0) {
        await whatsappService.sendProperties(client.phone, properties, searchSummary, this.waInstance(conversation));
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
      const params: any = { status: 'available', limit: 3, sort_by: 'featured' };

      const typeInfo = PROPERTY_TYPE_MAP[ctx.property_type ?? ''];
      if (typeInfo?.db_types?.[0]) params.property_type = typeInfo.db_types[0];
      if (ctx.budget) params.price_max = ctx.budget;
      if (ctx.purpose) params.purpose = ctx.purpose === 'rent' ? 'rent' : 'sale';

      if (ctx.location) {
        const cityId = await propertyService.resolveCityId(ctx.location);
        if (cityId) params.city_ids = [cityId];
        else {
          const distId = await propertyService.resolveDistrictId(ctx.location);
          if (distId) params.district_ids = [distId];
        }
      }

      let { properties } = await propertyService.search(params);

      // Widen the search rather than come back empty-handed.
      if (properties.length === 0 && params.property_type) {
        ({ properties } = await propertyService.search({ ...params, property_type: undefined }));
      }
      if (properties.length === 0 && params.price_max) {
        ({ properties } = await propertyService.search({ ...params, price_max: params.price_max * 1.3 }));
      }

      if (properties.length > 0) {
        await whatsappService.sendProperties(
          client.phone, properties, this.buildSearchSummary(ctx, {}), this.waInstance(conversation),
        );
        await sleep(400);
        await whatsappService.sendText(
          client.phone,
          'هل تود ترتيب *موعد معاينة* لأي منها؟ اكتب رقم العقار أو اسأل عن أي تفاصيل 🏠',
          this.waInstance(conversation),
        );
        return;
      }

      await whatsappService.sendText(
        client.phone,
        'لم أجد حالياً عقاراً مطابقاً لطلبك تماماً 🔍\n\nسجّلت طلبك وسيتواصل معك أحد مستشارينا بأقرب الخيارات المتاحة.\n\n' + this.handoffNote(),
        this.waInstance(conversation),
      );
      // Notify the team, but keep the bot listening: an empty result is not a
      // reason to go silent on the customer for the rest of the conversation.
      await this.notifyAgent(client, conversation, 'لا توجد عقارات مطابقة — يحتاج متابعة بشرية');
    } catch (e: any) {
      recordError('searchWithoutAI', e);
      logger.error('searchWithoutAI failed', { clientId: client.id, error: e?.message });
      await whatsappService.sendText(
        client.phone,
        'شكراً لتواصلك 🙏\nسيتواصل معك أحد مستشارينا لمساعدتك.\n\n' + this.handoffNote(),
        this.waInstance(conversation),
      );
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async findOrCreateConversation(clientId: string, chatId: string): Promise<Conversation> {
    const existing = await this.db('conversations').where('whatsapp_chat_id', chatId).first() as Conversation | undefined;
    if (existing) return existing;
    const [conv] = await this.db('conversations')
      .insert({ client_id: clientId, whatsapp_chat_id: chatId, is_active: true, is_ai_enabled: true, unread_count: 0 })
      .returning('*') as Conversation[];
    if (!conv) throw new Error('Failed to create conversation');
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
    return msg;
  }

  async getConversationHistory(conversationId: string, limit = 10): Promise<Message[]> {
    return this.db('messages')
      .where('conversation_id', conversationId)
      .orderBy('created_at', 'desc').limit(limit)
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
      purpose_rent: 'أريد عقاراً للإيجار', purpose_buy: 'أريد شراء عقار',
      type_apt_family: 'شقة عوائل', type_apt_single: 'شقة عزاب',
      type_house: 'بيت', type_land: 'أرض', type_commercial: 'عقار تجاري',
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
    const riyadh = new Date(Date.now() + 3 * 3600000);
    if (riyadh.getDay() === 5) return false;
    const mins = riyadh.getHours() * 60 + riyadh.getMinutes();
    return (mins >= 570 && mins < 720) || (mins >= 960 && mins < 1290);
  }

  // Note appended when a conversation is handed off to a human agent.
  // Within working hours → contacted shortly; outside → shown the working hours.
  private handoffNote(): string {
    if (this.isWithinWorkingHours()) {
      return '👤 سيتواصل معك أحد مستشارينا خلال لحظات لمساعدتك. 🤝';
    }
    return '👤 سيتواصل معك أحد مستشارينا في أقرب وقت خلال ساعات العمل:\n🌅 صباحاً: 9:30 - 12:00\n🌆 مساءً: 4:00 - 9:30\n\nونحن سعداء بخدمتك دائماً. 🏠';
  }

  private async enrichSearchParams(params: PropertySearchParams, extracted: any, ctx: FlowContext): Promise<PropertySearchParams> {
    const enriched = { ...params };
    const location = ctx.location ?? extracted.city ?? extracted.district;
    if (location) {
      const cityId = await propertyService.resolveCityId(location);
      if (cityId) enriched.city_ids = [cityId];
      else {
        const distId = await propertyService.resolveDistrictId(location);
        if (distId) enriched.district_ids = [distId];
      }
    }
    return enriched;
  }

  private buildSearchSummary(ctx: FlowContext, extracted: any): string {
    const parts: string[] = [];
    const typeInfo = PROPERTY_TYPE_MAP[ctx.property_type ?? ''];
    if (typeInfo) parts.push(typeInfo.label);
    const loc = ctx.location ?? extracted.district ?? extracted.city;
    if (loc) parts.push(`في ${loc}`);
    const budget = ctx.budget ?? extracted.budget_max;
    if (budget) parts.push(`بميزانية ${budget >= 1_000_000 ? (budget/1_000_000).toFixed(1)+' مليون' : (budget/1_000).toFixed(0)+' ألف'} ريال`);
    return parts.join(' ') || 'طلبك';
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
