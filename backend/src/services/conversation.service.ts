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

// =============================================================================
// Flow State Machine
// welcome → purpose → type → entry → location → budget → ai → escalated
// =============================================================================

type FlowState = 'welcome' | 'purpose' | 'type' | 'entry' | 'location' | 'budget' | 'ai' | 'escalated';

interface FlowContext {
  state: FlowState;
  purpose?: 'rent' | 'buy';
  property_type?: string;
  location?: string;
  budget?: number;
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

function getRiyadhGreeting(): string {
  const h = new Date(Date.now() + 3 * 3600000).getHours();
  if (h < 12) return 'صباح الخير ☀️';
  if (h < 17) return 'مساء الخير 🌤';
  return 'مساء النور 🌙';
}

function extractBudget(text: string): number | undefined {
  const m = text.match(/(\d+(?:\.\d+)?)\s*مليون/);
  if (m) return parseFloat(m[1]!) * 1_000_000;
  const k = text.match(/(\d+(?:\.\d+)?)\s*(?:ألف|الف)/i);
  if (k) return parseFloat(k[1]!) * 1_000;
  const n = text.match(/(\d{4,})/);
  if (n) return parseInt(n[1]!, 10);
  return undefined;
}

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
    return (conv?.conversation_context as FlowContext) ?? { state: 'welcome' };
  }

  private async saveFlowContext(conversationId: string, ctx: FlowContext): Promise<void> {
    await this.db('conversations')
      .where('id', conversationId)
      .update({ conversation_context: JSON.stringify(ctx), updated_at: new Date() });
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

      const existing = await this.db('messages').where('whatsapp_message_id', whatsappMessageId).first();
      if (existing) return;

      const { client, isNew } = await clientService.findOrCreateByWhatsapp(chatId, phone, payload.data.pushName);
      const conversation = await this.findOrCreateConversation(client.id, chatId);
      const { content, messageType, mediaUrl, mimeType, lat, lng, locationName } = this.extractMessageContent(payload);

      const message = await this.saveMessage({
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

      await whatsappService.markAsRead(whatsappMessageId, chatId);

      if (!conversation.is_ai_enabled || conversation.ai_handoff_requested) return;

      // Bot replies 24/7 with AI. Working hours only matter when handing off to a human.
      await this.handleFlow(message, client, conversation, payload, isNew);
    } catch (error) {
      logger.error('Webhook handling failed', { error });
    }
  }

  // ===========================================================================
  // Flow Router
  // ===========================================================================

  private async handleFlow(
    message: Message, client: Client, conversation: Conversation,
    payload: WhatsAppWebhookPayload, isNew: boolean,
  ): Promise<void> {
    const ctx = await this.getFlowContext(conversation.id);
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
  // Step 1 — Welcome
  // ===========================================================================

  private async stepWelcome(client: Client, conversation: Conversation, ctx: FlowContext): Promise<void> {
    const greeting = getRiyadhGreeting();
    await whatsappService.sendText(
      client.phone,
      `${greeting}\nأهلاً بك في *مكتب عبدالحكيم النقيدان للاستثمارات العقارية* 🏢\n\nنسعد بخدمتك — ما الذي تبحث عنه؟`
    );
    await sleep(600);
    await whatsappService.sendButtons(client.phone, 'نوع الطلب', 'اختر ما يناسبك:', [
      { id: 'purpose_rent', text: '🔑 إيجار' },
      { id: 'purpose_buy',  text: '🏠 شراء' },
    ]);
    await this.saveFlowContext(conversation.id, { ...ctx, state: 'purpose' });
    await clientService.update(client.id, { status: 'contacted' } as any);
  }

  // ===========================================================================
  // Step 2 — Purpose
  // ===========================================================================

  private async stepPurpose(
    clickedId: string | null, text: string,
    client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    let purpose: 'rent' | 'buy' | undefined;
    if (clickedId === 'purpose_rent' || text.includes('إيجار') || text.includes('ايجار')) purpose = 'rent';
    else if (clickedId === 'purpose_buy' || text.includes('شراء') || text.includes('شري')) purpose = 'buy';

    if (!purpose) {
      await whatsappService.sendButtons(client.phone, 'نوع الطلب', 'اختر ما يناسبك:', [
        { id: 'purpose_rent', text: '🔑 إيجار' },
        { id: 'purpose_buy',  text: '🏠 شراء' },
      ]);
      return;
    }

    await this.saveFlowContext(conversation.id, { ...ctx, state: 'type', purpose });

    if (purpose === 'rent') {
      await whatsappService.sendButtons(client.phone, 'نوع العقار', 'ما الذي تبحث عنه؟', [
        { id: 'type_apt_family', text: '🏘 شقة عوائل' },
        { id: 'type_apt_single', text: '👤 شقة عزاب' },
        { id: 'type_house',      text: '🏡 بيت' },
        { id: 'type_commercial', text: '🏪 تجاري (محل / صالة)' },
      ]);
    } else {
      await whatsappService.sendButtons(client.phone, 'نوع العقار', 'ما الذي تبحث عنه؟', [
        { id: 'type_apt_family', text: '🏘 شقة' },
        { id: 'type_house',      text: '🏡 فيلا / بيت' },
        { id: 'type_land',       text: '📍 أرض' },
        { id: 'type_commercial', text: '🏢 تجاري' },
      ]);
    }
  }

  // ===========================================================================
  // Step 3 — Property Type
  // ===========================================================================

  private async stepType(
    clickedId: string | null, text: string,
    client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    const typeMap: Record<string, string> = {
      type_apt_family: 'apartment_family',
      type_apt_single: 'apartment_single',
      type_house:      'house',
      type_land:       'land',
      type_commercial: 'commercial',
    };

    let propType = clickedId ? typeMap[clickedId] : undefined;
    if (!propType) {
      if (text.includes('شقة') || text.includes('شقق')) propType = 'apartment_family';
      else if (text.includes('بيت') || text.includes('فيلا')) propType = 'house';
      else if (text.includes('أرض') || text.includes('ارض')) propType = 'land';
      else if (text.includes('محل') || text.includes('صالة') || text.includes('مكتب')) propType = 'commercial';
    }

    if (!propType) {
      await whatsappService.sendText(client.phone, 'من فضلك اختر نوع العقار من الخيارات 👆');
      return;
    }

    if (propType === 'house') {
      await whatsappService.sendButtons(client.phone, 'نوع المدخل', 'ما نوع المدخل المطلوب؟', [
        { id: 'entry_private', text: '🔒 مدخل خاص' },
        { id: 'entry_shared',  text: '🚪 مدخل مشترك' },
      ]);
      await this.saveFlowContext(conversation.id, { ...ctx, state: 'entry' });
      return;
    }

    if (propType === 'commercial') {
      await whatsappService.sendButtons(client.phone, 'نوع التجاري', 'حدد ما تحتاجه:', [
        { id: 'com_shop',    text: '🏪 محل' },
        { id: 'com_hall',    text: '🏬 صالة' },
        { id: 'com_office',  text: '🏢 مكتب' },
        { id: 'com_storage', text: '📦 مستودع' },
      ]);
      await this.saveFlowContext(conversation.id, { ...ctx, state: 'entry', property_type: 'commercial' });
      return;
    }

    await this.saveFlowContext(conversation.id, { ...ctx, state: 'location', property_type: propType });
    await whatsappService.sendText(client.phone, '📍 ممتاز!\n\nفي أي *حي أو منطقة* تبحث؟\n_(اكتب اسم الحي أو المنطقة)_');
  }

  // ===========================================================================
  // Step 3b — Entry / Commercial Sub-type
  // ===========================================================================

  private async stepEntry(
    clickedId: string | null, text: string,
    client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    const entryMap: Record<string, string> = {
      entry_private: 'house_private', entry_shared: 'house_shared',
      com_shop: 'shop', com_hall: 'hall', com_office: 'office', com_storage: 'warehouse',
    };

    let finalType = clickedId ? entryMap[clickedId] : undefined;
    if (!finalType) {
      if (text.includes('خاص')) finalType = 'house_private';
      else if (text.includes('مشترك')) finalType = 'house_shared';
    }

    if (!finalType) {
      await whatsappService.sendText(client.phone, 'من فضلك اختر من الخيارات 👆');
      return;
    }

    await this.saveFlowContext(conversation.id, { ...ctx, state: 'location', property_type: finalType });
    await whatsappService.sendText(client.phone, '📍 ممتاز!\n\nفي أي *حي أو منطقة* تبحث؟\n_(اكتب اسم الحي أو المنطقة)_');
  }

  // ===========================================================================
  // Step 4 — Location
  // ===========================================================================

  private async stepLocation(
    text: string, client: Client, conversation: Conversation, ctx: FlowContext,
  ): Promise<void> {
    if (text.length < 2) {
      await whatsappService.sendText(client.phone, 'من فضلك اكتب اسم الحي أو المنطقة 📍');
      return;
    }
    await this.saveFlowContext(conversation.id, { ...ctx, state: 'budget', location: text });
    await clientService.update(client.id, { district: text } as any);
    await whatsappService.sendText(
      client.phone,
      `💰 شكراً!\n\nما هي *ميزانيتك التقريبية*؟\n_(مثال: 25 ألف سنوياً — أو 1.5 مليون — أو مفتوح)_`
    );
  }

  // ===========================================================================
  // Step 5 — Budget → hand to AI
  // ===========================================================================

  private async stepBudget(
    text: string, client: Client, conversation: Conversation, ctx: FlowContext, message: Message,
  ): Promise<void> {
    const budget = extractBudget(text);
    const isOpen = text.includes('مفتوح') || text.includes('مو محدد') || text.includes('ما عندي');

    if (!budget && !isOpen && text.length < 3) {
      await whatsappService.sendText(
        client.phone,
        '💰 اكتب ميزانيتك التقريبية\n_(مثال: 20 ألف — أو 1 مليون — أو مفتوح)_'
      );
      return;
    }

    if (budget) await clientService.update(client.id, { budget_max: budget } as any);

    const newCtx: FlowContext = { ...ctx, state: 'ai', budget };
    await this.saveFlowContext(conversation.id, newCtx);

    const typeInfo = PROPERTY_TYPE_MAP[ctx.property_type ?? ''];
    if (typeInfo) {
      await clientService.update(client.id, {
        preferred_property_types: typeInfo.db_types,
        purpose: ctx.purpose === 'rent' ? 'rent' : 'sale',
      } as any);
    }

    const purposeAr = ctx.purpose === 'rent' ? 'إيجار' : 'شراء';
    const budgetStr = budget
      ? budget >= 1_000_000 ? `${(budget / 1_000_000).toFixed(1)} مليون ريال` : `${(budget / 1_000).toFixed(0)} ألف ريال`
      : 'ميزانية مفتوحة';

    message.content = `أبحث عن ${typeInfo?.label ?? ctx.property_type ?? 'عقار'} للـ${purposeAr} في ${ctx.location ?? 'الرياض'} بميزانية ${budgetStr}`;

    await whatsappService.sendText(client.phone, '🔍 جاري البحث عن أفضل الخيارات المتاحة...');
    await sleep(800);

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
        const cityId = aiResult.extracted_data.city ? await propertyService.resolveCityId(aiResult.extracted_data.city) : undefined;
        await clientService.updateFromAI(client.id, {
          name: aiResult.extracted_data.client_name,
          budget_max: aiResult.extracted_data.budget_max ?? ctx.budget,
          budget_min: aiResult.extracted_data.budget_min,
          preferred_property_types: aiResult.extracted_data.property_type ? [aiResult.extracted_data.property_type] : undefined,
          city_id: cityId,
          intent: { intent: aiResult.intent.primary, confidence: aiResult.intent.confidence, timestamp: new Date().toISOString(), message_id: message.id },
        });
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
          await propertyService.incrementInquiryCount(prop.id);
          await this.db('client_property_interests')
            .insert({ client_id: client.id, property_id: prop.id, interest_level: 3 })
            .onConflict(['client_id', 'property_id']).ignore();
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

      const outboundMsgId = await whatsappService.sendText(client.phone, responseText);
      await this.saveMessage({
        conversation_id: conversation.id, whatsapp_message_id: outboundMsgId,
        direction: 'outbound', message_type: 'text', status: 'sent',
        content: responseText, is_from_ai: true,
      });

      if (properties.length > 0) {
        await whatsappService.sendProperties(client.phone, properties, searchSummary);
      } else if (ctx.state === 'ai' && preloadedProperties.length === 0 && aiResult.intent.primary === 'search_property') {
        await sleep(500);
        await whatsappService.sendText(
          client.phone,
          '📋 لم نجد حالياً عقارات مطابقة لطلبك — سيتواصل معك أحد مستشارينا قريباً لمساعدتك. 🤝'
        );
      }

      if (['new', 'contacted', 'interested'].includes(client.status)) {
        await this.scheduleFollowUps(client.id);
      }

      logger.info('AI processed', { clientId: client.id, intent: aiResult.intent.primary, props: properties.length, ms: Date.now() - startTime });
    } catch (error: any) {
      logger.error('AI pipeline failed', { clientId: client.id, error: error?.message });
      await whatsappService.sendText(client.phone, 'عذراً، حدث خطأ مؤقت. سيتواصل معك أحد مستشارينا قريباً. 🙏');
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
    const [msg] = await this.db('messages').insert(data).returning('*') as Message[];
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
