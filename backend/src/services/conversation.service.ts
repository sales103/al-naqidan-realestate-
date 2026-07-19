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
  Conversation,
  Message,
  Client,
  WhatsAppWebhookPayload,
  AIProcessingResult,
  PropertySearchParams,
} from '../types/index.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  // =============================================================================
  // Main Webhook Handler
  // =============================================================================

  async handleWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
    try {
      if (payload.event !== 'messages.upsert') return;
      if (payload.data.key.fromMe) return; // Ignore outbound messages

      const chatId = payload.data.key.remoteJid;
      if (!chatId || chatId.includes('@g.us')) return; // Skip group messages

      const phone = chatId.replace('@s.whatsapp.net', '');
      const pushName = payload.data.pushName;
      const whatsappMessageId = payload.data.key.id;

      // Deduplicate
      const existing = await this.db('messages').where('whatsapp_message_id', whatsappMessageId).first();
      if (existing) return;

      // Get or create client
      const { client, isNew } = await clientService.findOrCreateByWhatsapp(chatId, phone, pushName);

      // Get or create conversation
      const conversation = await this.findOrCreateConversation(client.id, chatId);

      // Extract message content
      const { content, messageType, mediaUrl, mimeType, lat, lng, locationName } =
        this.extractMessageContent(payload);

      // Save incoming message
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

      // Mark as read
      await whatsappService.markAsRead(whatsappMessageId, chatId);

      // Check if AI is enabled for this conversation
      if (!conversation.is_ai_enabled || conversation.ai_handoff_requested) {
        logger.info('AI disabled for conversation, skipping', { conversationId: conversation.id });
        return;
      }

      // Check working hours
      if (!this.isWithinWorkingHours()) {
        await this.sendOutOfHoursMessage(client.phone);
        return;
      }

      // ── Level-1 buttons: new client welcome ──────────────────────────────
            if (isNew) {
        const greeting = whatsappService.getRiyadhGreeting();
        await whatsappService.sendText(
          client.phone,
          `${greeting} 🏠\nأهلاً بك في مكتب عبدالحكيم النقيدان للاستثمارات العقارية\nكيف يمكنني مساعدتك؟`
        );
        await sleep(800);
        await whatsappService.sendButtons(client.phone, 'اختر نوع طلبك', 'حدّد ما تبحث عنه:', [
          { id: 'btn_residential', text: '🏘 سكني' },
          { id: 'btn_commercial',  text: '🏢 تجاري' },
          { id: 'btn_land',        text: '📍 أرض' },
          { id: 'btn_evaluation',  text: '📊 تقييم عقار' },
        ]);
        return;
      }

      // ── Level-2 buttons: sub-type selection ──────────────────────────────
      const clickedId = this.extractButtonId(payload);

      if (clickedId === 'btn_residential') {
        await whatsappService.sendButtons(client.phone, 'نوع السكن', 'ما نوع الوحدة السكنية؟', [
          { id: 'btn2_family', text: '👪 عوائل' },
          { id: 'btn2_single', text: '👤 عزاب' },
        ]);
        return;
      }

      if (clickedId === 'btn_commercial') {
        await whatsappService.sendButtons(client.phone, 'نوع التجاري', 'ما نوع العقار التجاري؟', [
          { id: 'btn2_shop',      text: '🏪 محل' },
          { id: 'btn2_hall',      text: '🏬 صالة' },
          { id: 'btn2_office',    text: '🏢 مكتب' },
          { id: 'btn2_warehouse', text: '🏭 مستودع' },
        ]);
        return;
      }

      if (clickedId === 'btn_land') {
        await whatsappService.sendButtons(client.phone, 'غرض الأرض', 'ما الغرض من الأرض؟', [
          { id: 'btn2_land_res', text: '🏘 سكني' },
          { id: 'btn2_land_com', text: '🏭 تجاري' },
          { id: 'btn2_land_inv', text: '💼 استثماري' },
        ]);
        return;
      }

      if (clickedId === 'btn_evaluation') {
        await clientService.update(client.id, { status: 'contacted' } as any);
        await whatsappService.sendText(
          client.phone,
          '📊 لتقييم العقار نحتاج بعض التفاصيل:\n\nما نوع العقار الذي تريد تقييمه وموقعه؟'
        );
        return;
      }

      // ── Level-2 clicks: save client profile then hand off to AI ──────────
      const L2_MAP: Record<string, { types: string[]; text: string }> = {
        btn2_family:    { types: ['apartment', 'villa'], text: 'أريد وحدة سكنية للعوائل' },
        btn2_single:    { types: ['apartment'],          text: 'أريد وحدة سكنية للعزاب' },
        btn2_shop:      { types: ['showroom'],           text: 'أريد محلاً تجارياً' },
        btn2_hall:      { types: ['showroom'],           text: 'أريد صالة عرض أو صالة تجارية' },
        btn2_office:    { types: ['office'],             text: 'أريد مكتباً' },
        btn2_warehouse: { types: ['warehouse'],          text: 'أريد مستودعاً' },
        btn2_land_res:  { types: ['land'],               text: 'أريد أرضاً سكنية' },
        btn2_land_com:  { types: ['land'],               text: 'أريد أرضاً تجارية' },
        btn2_land_inv:  { types: ['land'],               text: 'أريد أرضاً للاستثمار' },
      };

      if (clickedId && L2_MAP[clickedId]) {
        const mapped = L2_MAP[clickedId]!;
        // Save preferred types to client profile
        await clientService.update(client.id, {
          preferred_property_types: mapped.types,
          status: 'contacted',
        } as any);
        // Override message content so AI knows what was selected
        message.content = mapped.text;
      }

      // Process message with AI
      await this.processWithAI(message, client, conversation, payload);
    } catch (error) {
      logger.error('Webhook handling failed', { error, payload: JSON.stringify(payload).substring(0, 200) });
    }
  }

  // =============================================================================
  // AI Processing Pipeline
  // =============================================================================

  private async processWithAI(
    message: Message,
    client: Client,
    conversation: Conversation,
    payload: WhatsAppWebhookPayload
  ): Promise<void> {
    const startTime = Date.now();

    try {
      let messageContent = message.content ?? '';

      // Handle audio transcription
      if (message.message_type === 'audio' && message.media_url) {
        try {
          const audioBuffer = await whatsappService.downloadMedia(message.whatsapp_message_id!);
          messageContent = await transcribeAudio(audioBuffer, message.media_mime_type ?? 'audio/ogg');
          await this.db('messages').where('id', message.id).update({ transcription: messageContent });
        } catch (err) {
          logger.warn('Audio transcription failed', { messageId: message.id });
          messageContent = 'رسالة صوتية';
        }
      }

      // Handle image analysis
      if (message.message_type === 'image' && message.media_url) {
        try {
          const imageDescription = await analyzeImage(message.media_url, message.caption ?? undefined);
          messageContent = imageDescription + (message.caption ? `\nتعليق العميل: ${message.caption}` : '');
        } catch {
          messageContent = message.caption ?? 'أرسل صورة';
        }
      }

      if (!messageContent.trim()) messageContent = '[رسالة وسائط]';

      // Get conversation history
      const history = await this.getConversationHistory(conversation.id, 10);

      // Pre-search properties — load real data before AI call so it can mention them
      const SEARCH_KEYWORDS = [
        'شقة','فيلا','أرض','عقار','غرف','ميزانية','سعر','إيجار','شراء','بيع','مساحة',
        'حي','دور','استثمار','تجاري','سكني','مكتب','مستودع','معرض','مزرعة','عمارة',
        'روف','دوبلكس','ملحق','استوديو',
      ];
      // Budget extraction from message (e.g. "مليون" "500 الف" "800000")
      const extractBudgetFromMsg = (msg: string): number | undefined => {
        const millionMatch = msg.match(/(d+(?:.d+)?)s*مليون/);
        if (millionMatch) return parseFloat(millionMatch[1]!) * 1_000_000;
        const thousandMatch = msg.match(/(d+(?:.d+)?)s*ألف|الف/);
        if (thousandMatch) return parseFloat(thousandMatch[1]!) * 1_000;
        const numMatch = msg.match(/(d{5,})/);
        if (numMatch) return parseInt(numMatch[1]!, 10);
        return undefined;
      };

      let preloadedProperties: any[] = [];
      if (SEARCH_KEYWORDS.some((kw) => messageContent.includes(kw))) {
        try {
          const clientBudget = (client as any).budget_max ?? extractBudgetFromMsg(messageContent);
          const clientTypes: string[] = (client as any).preferred_property_types ?? [];

          // Extract property type from message if not stored
          const typeFromMsg = (): string | undefined => {
            if (messageContent.includes('شقة') || messageContent.includes('شقق')) return 'apartment';
            if (messageContent.includes('فيلا') || messageContent.includes('فلل')) return 'villa';
            if (messageContent.includes('أرض') || messageContent.includes('ارض')) return 'land';
            if (messageContent.includes('مكتب')) return 'office';
            if (messageContent.includes('مستودع')) return 'warehouse';
            if (messageContent.includes('معرض') || messageContent.includes('محل')) return 'showroom';
            if (messageContent.includes('عمارة')) return 'building';
            return undefined;
          };

          const resolvedType = clientTypes[0] ?? typeFromMsg();
          const params: any = { status: 'available', limit: 5, sort_by: 'featured' };
          if (clientBudget) params.price_max = clientBudget;
          if (resolvedType) params.property_type = resolvedType;

          // Try to resolve city from message
          const CITY_HINTS: Record<string, string> = {
            'الرياض': 'الرياض', 'رياض': 'الرياض',
            'جدة': 'جدة', 'مكة': 'مكة المكرمة',
            'المدينة': 'المدينة المنورة', 'الدمام': 'الدمام',
            'الخبر': 'الخبر', 'الطائف': 'الطائف',
            'تبوك': 'تبوك', 'أبها': 'أبها',
          };
          for (const [hint, cityName] of Object.entries(CITY_HINTS)) {
            if (messageContent.includes(hint)) {
              const cityId = await propertyService.resolveCityId(cityName);
              if (cityId) { params.city_ids = [cityId]; break; }
            }
          }

          const preResult = await propertyService.search(params);
          preloadedProperties = preResult.properties;

          // If nothing found with type filter, try without
          if (preloadedProperties.length === 0 && resolvedType) {
            const relaxed = { ...params, property_type: undefined };
            const fallback = await propertyService.search(relaxed);
            preloadedProperties = fallback.properties;
          }
        } catch { /* continue without properties */ }
      }

      // AI Processing — pass pre-fetched properties so AI mentions them in its response
      const aiResult = await processMessage(messageContent, client, history, preloadedProperties.length > 0 ? preloadedProperties : undefined);

      // Update client profile from AI extraction
      if (aiResult.extracted_data) {
        const cityId = aiResult.extracted_data.city
          ? await propertyService.resolveCityId(aiResult.extracted_data.city)
          : undefined;

        await clientService.updateFromAI(client.id, {
          name: aiResult.extracted_data.client_name,
          budget_max: aiResult.extracted_data.budget_max,
          budget_min: aiResult.extracted_data.budget_min,
          preferred_property_types: aiResult.extracted_data.property_type
            ? [aiResult.extracted_data.property_type]
            : undefined,
          special_requirements: aiResult.extracted_data.special_requirements?.join(', '),
          city_id: cityId,
          intent: {
            intent: aiResult.intent.primary,
            confidence: aiResult.intent.confidence,
            timestamp: new Date().toISOString(),
            message_id: message.id,
          },
        });
      }

      // Update message with AI data
      await this.db('messages').where('id', message.id).update({
        ai_processed: true,
        ai_intent: aiResult.intent.primary,
        ai_entities: aiResult.extracted_data,
        ai_response_time_ms: aiResult.response_time_ms,
        ai_model_used: aiResult.model,
        ai_tokens_used: aiResult.tokens_used,
        ai_cost_usd: aiResult.cost_usd,
      });

      // Search for properties if needed
      let properties: any[] = [];
      let searchSummary = '';

      if (aiResult.should_send_properties && aiResult.property_search_params) {
        const params = await this.enrichSearchParams(aiResult.property_search_params, aiResult.extracted_data);
        const searchResult = await propertyService.search(params);
        properties = searchResult.properties;
        searchSummary = this.buildSearchSummary(aiResult.extracted_data);

        // Track inquiries
        for (const prop of properties.slice(0, 3)) {
          await propertyService.incrementInquiryCount(prop.id);
          await this.db('client_property_interests')
            .insert({
              client_id: client.id,
              property_id: prop.id,
              interest_level: 3,
            })
            .onConflict(['client_id', 'property_id'])
            .ignore();
        }
      }

      // Handle escalation
      if (aiResult.should_escalate) {
        await this.db('conversations')
          .where('id', conversation.id)
          .update({ ai_handoff_requested: true, updated_at: new Date() });

        await this.notifyAgent(client, conversation, aiResult.escalation_reason);
      }

      // Send AI response
      const finalResponse = aiResult.response;
      const outboundMsgId = await whatsappService.sendText(client.phone, finalResponse);

      // Save outbound message
      await this.saveMessage({
        conversation_id: conversation.id,
        whatsapp_message_id: outboundMsgId,
        direction: 'outbound',
        message_type: 'text',
        status: 'sent',
        content: finalResponse,
        is_from_ai: true,
      });

      // Send properties if found
      if (properties.length > 0) {
        await whatsappService.sendProperties(client.phone, properties, searchSummary);
      }

      // Schedule follow-up for new clients
      if (client.status === 'new' || client.status === 'contacted') {
        await this.scheduleFollowUps(client.id);
      }

      logger.info('AI message processed', {
        clientId: client.id,
        intent: aiResult.intent.primary,
        propertiesFound: properties.length,
        escalated: aiResult.should_escalate,
        totalMs: Date.now() - startTime,
      });
    } catch (error: any) {
      logger.error('AI processing pipeline failed', {
        clientId: client.id,
        errorMsg: error?.message ?? String(error),
        errorCode: error?.code,
        errorStack: error?.stack?.split('\n').slice(0,3).join(' | '),
      });
      // Send fallback message
      await whatsappService.sendText(
        client.phone,
        'عذراً، حدث خطأ مؤقت. سيتواصل معك أحد مستشارينا قريباً. 🙏'
      );
    }
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  private async findOrCreateConversation(clientId: string, chatId: string): Promise<Conversation> {
    const existing = await this.db('conversations').where('whatsapp_chat_id', chatId).first() as Conversation | undefined;
    if (existing) return existing;

    const [conv] = await this.db('conversations')
      .insert({
        client_id: clientId,
        whatsapp_chat_id: chatId,
        is_active: true,
        is_ai_enabled: true,
        unread_count: 0,
      })
      .returning('*') as Conversation[];

    if (!conv) throw new Error('Failed to create conversation');
    return conv;
  }

  async saveMessage(data: Partial<Message>): Promise<Message> {
    const [message] = await this.db('messages').insert(data).returning('*') as Message[];
    if (!message) throw new Error('Failed to save message');
    return message;
  }

  async getConversationHistory(conversationId: string, limit = 10): Promise<Message[]> {
    return this.db('messages')
      .where('conversation_id', conversationId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .then((msgs: Message[]) => msgs.reverse());
  }

  private extractMessageContent(payload: WhatsAppWebhookPayload): {
    content?: string;
    messageType: any;
    mediaUrl?: string;
    mimeType?: string;
    lat?: number;
    lng?: number;
    locationName?: string;
  } {
    const msg = payload.data.message;
    if (!msg) return { messageType: 'text' };

    if (msg.conversation) return { content: msg.conversation, messageType: 'text' };
    if (msg.extendedTextMessage) return { content: msg.extendedTextMessage.text, messageType: 'text' };

    // Button click responses — translate button ID to Arabic text for AI processing
    if (msg.buttonsResponseMessage) {
      const id = msg.buttonsResponseMessage.selectedButtonId ?? '';
      const text = msg.buttonsResponseMessage.selectedDisplayText ?? id;
      const mapped: Record<string, string> = {
        btn_residential: 'أريد عقاراً سكنياً',
        btn_commercial:  'أريد عقاراً تجارياً',
        btn_land:        'أريد أرضاً للبيع أو الاستثمار',
        btn_evaluation:  'أريد تقييم عقار',
      };
      return { content: mapped[id] ?? text, messageType: 'text' };
    }
    if (msg.templateButtonReplyMessage) {
      const id = msg.templateButtonReplyMessage.selectedId ?? '';
      const mapped: Record<string, string> = {
        btn_residential: 'أريد عقاراً سكنياً',
        btn_commercial:  'أريد عقاراً تجارياً',
        btn_land:        'أريد أرضاً للبيع أو الاستثمار',
        btn_evaluation:  'أريد تقييم عقار',
      };
      return { content: mapped[id] ?? (msg.templateButtonReplyMessage.selectedDisplayText ?? id), messageType: 'text' };
    }
    // List reply (when buttons fall back to numbered list and user replies with number)
    if (msg.listResponseMessage) {
      const rowId = msg.listResponseMessage.singleSelectReply?.selectedRowId ?? '';
      const mapped: Record<string, string> = {
        btn_residential: 'أريد عقاراً سكنياً',
        btn_commercial:  'أريد عقاراً تجارياً',
        btn_land:        'أريد أرضاً للبيع أو الاستثمار',
        btn_evaluation:  'أريد تقييم عقار',
      };
      return { content: mapped[rowId] ?? (msg.listResponseMessage.title ?? rowId), messageType: 'text' };
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
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const riyadh = new Date(utc + 3 * 60 * 60000);
    const day = riyadh.getDay(); // 0=Sun,5=Fri,6=Sat
    if (day === 5) return false; // Friday off
    const h = riyadh.getHours();
    const m = riyadh.getMinutes();
    const mins = h * 60 + m;
    const morning = mins >= 9 * 60 + 30 && mins < 12 * 60;      // 9:30 - 12:00
    const evening = mins >= 16 * 60 && mins < 21 * 60 + 30;      // 4:00 - 9:30 م
    return morning || evening;
  }

  private async sendOutOfHoursMessage(phone: string): Promise<void> {
    const msg = await this.db('system_settings').where('key', 'out_of_hours_message').first();
    const message = msg ? JSON.parse(msg.value as string) : 'سيتواصل معك فريقنا خلال ساعات العمل (8 ص - 10 م). 🙏';
    await whatsappService.sendText(phone, message);
  }

  private async enrichSearchParams(params: PropertySearchParams, extracted: any): Promise<PropertySearchParams> {
    const enriched = { ...params };

    if (extracted.city) {
      const cityId = await propertyService.resolveCityId(extracted.city);
      if (cityId) enriched.city_ids = [cityId];
    }

    if (extracted.district && enriched.city_ids?.[0]) {
      const districtId = await propertyService.resolveDistrictId(extracted.district, enriched.city_ids[0]);
      if (districtId) enriched.district_ids = [districtId];
    }

    return enriched;
  }

  private buildSearchSummary(data: any): string {
    const parts: string[] = [];
    if (data.property_type) {
      const types: Record<string, string> = { apartment: 'شقة', villa: 'فيلا', land: 'أرض', building: 'عمارة' };
      parts.push(types[data.property_type] ?? data.property_type);
    }
    if (data.district) parts.push(`في ${data.district}`);
    else if (data.city) parts.push(`في ${data.city}`);
    if (data.budget_max) parts.push(`بسعر لا يتجاوز ${data.budget_max.toLocaleString('ar-SA')} ريال`);
    return parts.join(' ') || 'طلبك';
  }

  private async scheduleFollowUps(clientId: string): Promise<void> {
    const now = new Date();
    const followUps = [
      { type: 'auto_1day', days: 1 },
      { type: 'auto_3days', days: 3 },
      { type: 'auto_1week', days: 7 },
      { type: 'auto_1month', days: 30 },
    ];

    for (const fu of followUps) {
      const scheduledAt = new Date(now.getTime() + fu.days * 24 * 60 * 60 * 1000);
      scheduledAt.setHours(10, 0, 0, 0); // 10 AM
      await clientService.scheduleFollowUp(clientId, fu.type, scheduledAt);
    }
  }

  private async notifyAgent(client: Client, conversation: Conversation, reason?: string): Promise<void> {
    // Notify assigned agent or first available manager
    const agentId = conversation.assigned_agent_id ?? client.assigned_agent_id;
    if (!agentId) return;

    await this.db('notifications').insert({
      user_id: agentId,
      notification_type: 'new_message',
      title: `تحويل محادثة - ${client.full_name}`,
      body: `طلب التحدث مع موظف${reason ? ': ' + reason : ''}`,
      data: { client_id: client.id, conversation_id: conversation.id },
    });
  }

  async getStats(): Promise<{
    total_messages_today: number;
    ai_responses_today: number;
    active_conversations: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [msgs] = await this.db('messages').where('created_at', '>=', today).select(
      this.db.raw('COUNT(*) as total'),
      this.db.raw("COUNT(*) FILTER (WHERE is_from_ai = true) as ai_count")
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
