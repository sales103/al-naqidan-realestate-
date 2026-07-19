import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { cacheGet, cacheSet, cacheKeys } from '../database/redis.js';
import type {
  AIProcessingResult,
  AIIntent,
  AIExtractedData,
  Message,
  Client,
  Property,
  PropertySearchParams,
} from '../types/index.js';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  ...(config.openai.baseUrl ? { baseURL: config.openai.baseUrl } : {}),
});

// Load system prompt - works with both CommonJS and compiled output
let systemPrompt = '';
try {
  const promptPaths = [
    path.resolve(process.cwd(), 'ai/prompts/system_prompt.txt'),
    path.resolve(process.cwd(), '../ai/prompts/system_prompt.txt'),
    path.resolve(__dirname, '../../ai/prompts/system_prompt.txt'),
  ];
  for (const p of promptPaths) {
    if (fs.existsSync(p)) { systemPrompt = fs.readFileSync(p, 'utf-8'); break; }
  }
} catch { systemPrompt = 'أنت مساعد عقاري ذكي لشركة النقيدان.'; }

// =============================================================================
// Intent Classification
// =============================================================================

const INTENT_EXTRACTION_PROMPT = `
أنت محلل نصوص متخصص في العقارات السعودية. حلل الرسالة التالية واستخرج:
1. النية الرئيسية (intent)
2. البيانات المهمة (entities)

النوايا الممكنة:
- search_property: يبحث عن عقار
- property_details: يريد تفاصيل عقار معين
- price_inquiry: يسأل عن السعر
- appointment_request: يريد تحديد موعد
- location_inquiry: يسأل عن الموقع
- greeting: تحية أو مجاملة
- complaint: شكوى أو مشكلة
- human_agent_request: يطلب التحدث مع موظف
- general_inquiry: سؤال عام
- feedback: رأي أو تقييم
- unknown: غير محدد

البيانات المطلوب استخراجها:
- property_type: نوع العقار (land/apartment/villa/building/office/showroom/warehouse/farm/investment_project)
- city: المدينة
- district: الحي
- direction: الاتجاه (شمال/جنوب/شرق/غرب/وسط)
- budget_max: الحد الأقصى للميزانية (رقم بالريال)
- budget_min: الحد الأدنى للميزانية (رقم بالريال)
- area_min: المساحة الدنيا بالمتر المربع
- area_max: المساحة القصوى بالمتر المربع
- rooms: عدد الغرف
- purpose: الغرض (sale/rent)
- special_requirements: متطلبات خاصة (مصفوفة نصية)
- client_name: اسم العميل إن ذُكر
- urgency: مدى الإلحاح (low/medium/high)

أجب بـ JSON فقط بدون أي نص إضافي:
{
  "intent": { "primary": "...", "secondary": "...", "confidence": 0.0-1.0 },
  "extracted_data": { ... },
  "sentiment": "positive|neutral|negative",
  "language": "ar|en|mixed"
}
`;

// =============================================================================
// Main AI Processing Function
// =============================================================================

export const processMessage = async (
  messageContent: string,
  client: Client,
  conversationHistory: Message[],
  availableProperties?: Property[]
): Promise<AIProcessingResult> => {
  const startTime = Date.now();

  try {
    // Step 1: Extract intent and entities
    const { intent, extracted_data, sentiment, language, intentTokens } =
      await extractIntentAndEntities(messageContent);

    // Step 2: Build conversation context for response generation
    const historyMessages = buildConversationHistory(conversationHistory);

    // Step 3: Build context about client and properties
    const contextMessage = buildContextMessage(client, availableProperties);

    // Step 4: Generate response
    const { response, responseTokens } = await generateResponse(
      messageContent,
      historyMessages,
      contextMessage,
      intent,
      extracted_data,
      client
    );

    // Step 5: Determine if properties should be sent
    const shouldSendProperties =
      (intent.primary === 'search_property' || intent.primary === 'price_inquiry') &&
      (availableProperties?.length ?? 0) > 0;

    // Step 6: Build search params if needed
    const property_search_params = buildSearchParams(extracted_data);

    // Step 7: Determine escalation
    const { shouldEscalate, escalationReason } = determineEscalation(intent, client, messageContent);

    const totalTokens = intentTokens + responseTokens;
    const cost = calculateCost(totalTokens, config.openai.model);

    return {
      intent,
      extracted_data,
      response,
      should_send_properties: shouldSendProperties,
      property_search_params: shouldSendProperties ? property_search_params : undefined,
      should_escalate: shouldEscalate,
      escalation_reason: escalationReason,
      sentiment,
      language,
      tokens_used: totalTokens,
      model: config.openai.model,
      response_time_ms: Date.now() - startTime,
      cost_usd: cost,
    };
  } catch (error) {
    logger.error('AI processing error', { error, messageContent: messageContent.substring(0, 100) });
    throw error;
  }
};

// =============================================================================
// Intent Extraction
// =============================================================================

export const extractIntentAndEntities = async (
  messageContent: string
): Promise<{
  intent: AIIntent;
  extracted_data: AIExtractedData;
  sentiment: 'positive' | 'neutral' | 'negative';
  language: 'ar' | 'en' | 'mixed';
  intentTokens: number;
}> => {
  // Check cache
  const cacheKey = `intent:${Buffer.from(messageContent).toString('base64').substring(0, 40)}`;
  const cached = await cacheGet<ReturnType<typeof extractIntentAndEntities>>(cacheKey);
  if (cached) return cached;

  const response = await openai.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: 'system', content: INTENT_EXTRACTION_PROMPT + '\nأجب بـ JSON فقط بدون أي نص آخر.' },
      { role: 'user', content: messageContent },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });

  const rawContent = response.choices[0]?.message?.content ?? '{}';
  // Extract JSON from response (model may wrap it in markdown)
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  const content = jsonMatch ? jsonMatch[0] : '{}';
  let parsed: { intent: AIIntent; extracted_data: AIExtractedData; sentiment: 'positive' | 'neutral' | 'negative'; language: 'ar' | 'en' | 'mixed'; };
  try { parsed = JSON.parse(content); } catch { parsed = {} as any; }

  const result = {
    intent: parsed.intent ?? { primary: 'unknown', confidence: 0.5 },
    extracted_data: parsed.extracted_data ?? {},
    sentiment: parsed.sentiment ?? 'neutral',
    language: parsed.language ?? 'ar',
    intentTokens: response.usage?.total_tokens ?? 0,
  };

  await cacheSet(cacheKey, result, 300); // cache 5 min
  return result;
};

// =============================================================================
// Response Generation
// =============================================================================

export const generateResponse = async (
  userMessage: string,
  historyMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  contextMessage: string,
  intent: AIIntent,
  extracted_data: AIExtractedData,
  client: Client
): Promise<{ response: string; responseTokens: number }> => {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: systemPrompt + '\n\n' + contextMessage,
    },
    ...historyMessages,
    {
      role: 'user',
      content: userMessage,
    },
  ];

  const response = await openai.chat.completions.create({
    model: config.openai.model,
    messages,
    temperature: config.openai.temperature,
    max_tokens: config.openai.maxTokens,
  });

  return {
    response: response.choices[0]?.message?.content ?? 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.',
    responseTokens: response.usage?.total_tokens ?? 0,
  };
};

// =============================================================================
// Voice Transcription
// =============================================================================

export const transcribeAudio = async (audioBuffer: Buffer, mimeType: string): Promise<string> => {
  try {
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'wav';
    const file = new File([audioBuffer], `audio.${ext}`, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: config.openai.whisperModel,
      language: 'ar',
      response_format: 'text',
    });

    return typeof transcription === 'string' ? transcription : (transcription as any).text ?? '';
  } catch (error) {
    logger.error('Audio transcription error', { error });
    throw error;
  }
};

// =============================================================================
// Image Analysis
// =============================================================================

export const analyzeImage = async (imageUrl: string, caption?: string): Promise<string> => {
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.visionModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'auto' },
            },
            {
              type: 'text',
              text: caption
                ? `وصف هذه الصورة في سياق عقاري. التعليق: ${caption}`
                : 'وصف هذه الصورة في سياق عقاري.',
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content ?? 'لم أتمكن من تحليل الصورة';
  } catch (error) {
    logger.error('Image analysis error', { error });
    return 'لم أتمكن من تحليل الصورة في الوقت الحالي';
  }
};

// =============================================================================
// Property Response Formatter
// =============================================================================

export const formatPropertyMessage = (property: Property, index: number): string => {
  const typeAr = {
    land: 'أرض',
    apartment: 'شقة',
    villa: 'فيلا',
    building: 'عمارة',
    office: 'مكتب',
    showroom: 'معرض',
    warehouse: 'مستودع',
    farm: 'مزرعة',
    investment_project: 'مشروع استثماري',
    other: 'عقار',
  }[property.property_type] ?? 'عقار';

  const price = property.price
    ? `💰 *${property.price.toLocaleString('ar-SA')} ريال*`
    : '';

  const area = property.area_sqm
    ? `📐 المساحة: ${property.area_sqm.toLocaleString('ar-SA')} م²`
    : '';

  const rooms = property.rooms ? `🛏 الغرف: ${property.rooms}` : '';

  const location = [property.district_name, property.city_name]
    .filter(Boolean)
    .join(' - ');

  const features = (property.features ?? []).slice(0, 3).join(' • ');

  return `*${index}. ${typeAr} - ${property.title_ar ?? property.title}*
📍 ${location}
${area}${rooms ? '\n' + rooms : ''}
${price}${features ? '\n✨ ' + features : ''}
🔗 الكود: ${property.code}`;
};

export const formatPropertiesResponse = (
  properties: Property[],
  searchSummary: string
): string => {
  if (properties.length === 0) {
    return `عذراً، لم أجد عقارات تطابق ${searchSummary} حالياً.\n\nسأبلغ فريق المبيعات لمساعدتك في إيجاد أفضل الخيارات المتاحة. 🤝`;
  }

  const header = `وجدت لك ${properties.length} ${properties.length === 1 ? 'عقار' : 'عقارات'} مناسبة:\n\n`;
  const propertyList = properties
    .slice(0, 3)
    .map((p, i) => formatPropertyMessage(p, i + 1))
    .join('\n\n─────────────\n\n');

  const footer = properties.length > 3
    ? `\n\n📌 هل تريد مشاهدة المزيد من العقارات؟`
    : '\n\n💬 هل تريد تفاصيل إضافية عن أي من هذه العقارات؟';

  return header + propertyList + footer;
};

// =============================================================================
// Helper Functions
// =============================================================================

const buildConversationHistory = (messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] => {
  return messages
    .slice(-10) // last 10 messages for context
    .map((msg) => ({
      role: msg.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
      content: msg.transcription ?? msg.content ?? '[رسالة وسائط]',
    }));
};

const buildContextMessage = (client: Client, properties?: Property[]): string => {
  // Riyadh time context
  const utc = Date.now() + new Date().getTimezoneOffset() * 60000;
  const riyadhNow = new Date(utc + 3 * 3600000);
  const riyadhHour = riyadhNow.getHours();
  const greeting = riyadhHour >= 5 && riyadhHour < 12 ? 'صباح الخير ☀️'
    : riyadhHour >= 12 && riyadhHour < 17 ? 'مساء الخير 🌤️'
    : riyadhHour >= 17 && riyadhHour < 22 ? 'مساء النور 🌙'
    : 'أهلاً بك 👋';
  const timeCtx = `وقت الرياض الحالي: ` + riyadhNow.toLocaleTimeString('ar-SA') + ` — استخدم: ` + greeting;

  const clientInfo = `
معلومات العميل:
- الاسم: ${client.full_name}
- حالته: ${client.status}
- تاريخ أول تواصل: ${client.first_contact_at?.toLocaleDateString('ar-SA') ?? 'جديد'}
${client.budget_max ? `- ميزانيته القصوى: ${client.budget_max.toLocaleString('ar-SA')} ريال` : ''}
${client.preferred_property_types?.length ? `- يبحث عن: ${client.preferred_property_types.join(', ')}` : ''}
${client.special_requirements ? `- متطلبات خاصة: ${client.special_requirements}` : ''}
`;

  const propertiesInfo = properties?.length
    ? `\nعقارات متاحة ومطابقة (اذكر تفاصيلها في ردك):\n${properties.slice(0, 5).map((p, i) => {
        const type = { land:'أرض', apartment:'شقة', villa:'فيلا', building:'عمارة', office:'مكتب', showroom:'معرض', warehouse:'مستودع', farm:'مزرعة' }[p.property_type ?? ''] ?? 'عقار';
        const location = [p.district_name, p.city_name].filter(Boolean).join(' - ');
        const area = p.area_sqm ? ` | ${p.area_sqm} م²` : '';
        const rooms = p.rooms ? ` | ${p.rooms} غرف` : '';
        return `${i+1}. ${type}: ${p.title_ar ?? p.title} | 💰 ${p.price?.toLocaleString('ar-SA')} ريال${area}${rooms} | 📍 ${location} | كود: ${p.code}`;
      }).join('\n')}\n\nمهم: ضمّن تفاصيل هذه العقارات في ردك بشكل طبيعي ومنظّم.`
    : '';

  return timeCtx + '\n' + clientInfo + propertiesInfo;
};

const buildSearchParams = (data: AIExtractedData): PropertySearchParams => ({
  property_type: data.property_type,
  price_max: data.budget_max,
  price_min: data.budget_min,
  area_min: data.area_min,
  area_max: data.area_max,
  rooms: data.rooms,
  purpose: data.purpose,
  limit: 5,
  sort_by: 'featured',
});

const determineEscalation = (
  intent: AIIntent,
  client: Client,
  message: string
): { shouldEscalate: boolean; escalationReason?: string } => {
  if (intent.primary === 'human_agent_request') {
    return { shouldEscalate: true, escalationReason: 'طلب العميل التحدث مع موظف' };
  }
  if (intent.primary === 'complaint') {
    return { shouldEscalate: true, escalationReason: 'شكوى من العميل' };
  }
  if (client.status === 'negotiating' || client.status === 'contract_pending') {
    return { shouldEscalate: true, escalationReason: 'عميل في مرحلة التفاوض' };
  }
  const urgentKeywords = ['الآن', 'فوراً', 'عاجل', 'ضروري', 'هام جداً'];
  if (urgentKeywords.some((kw) => message.includes(kw))) {
    return { shouldEscalate: true, escalationReason: 'طلب عاجل' };
  }
  return { shouldEscalate: false };
};

const calculateCost = (tokens: number, model: string): number => {
  const rates: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
  };
  const rate = rates[model] ?? rates['gpt-4o']!;
  return (tokens / 1000) * ((rate!.input + rate!.output) / 2);
};
