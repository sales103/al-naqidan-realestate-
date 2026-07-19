import OpenAI from 'openai';
import { getDatabase } from '../database/connection.js';
import { cacheGet, cacheSet } from '../database/redis.js';
import { logger } from '../config/logger.js';
import { config } from '../config/index.js';
import type {
  AIProcessingResult, AIIntent, AIExtractedData,
  Message, Client, Property, PropertySearchParams,
} from '../types/index.js';

// =============================================================================
// AI Settings — read from DB first, fallback to env vars
// =============================================================================

interface AISettings {
  openai_key: string;
  model: string;
  base_url: string;
  max_tokens: number;
  temperature: number;
  system_prompt: string;
}

let _cachedSettings: AISettings | null = null;
let _cacheExpiry = 0;

async function getAISettings(): Promise<AISettings> {
  const now = Date.now();
  if (_cachedSettings && now < _cacheExpiry) return _cachedSettings;

  try {
    const db = getDatabase();
    const row = await db('system_settings').where('key', 'ai').first();
    // Accept the key under either field name (frontend historically sent 'api_key').
    const savedKey = row?.value?.openai_key ?? row?.value?.api_key;
    if (savedKey) {
      const v = row.value as any;
      _cachedSettings = {
        openai_key: savedKey,
        model: v.model ?? config.openai.model,
        base_url: v.base_url ?? config.openai.baseUrl ?? 'https://api.openai.com/v1',
        max_tokens: v.max_tokens ?? config.openai.maxTokens,
        temperature: v.temperature ?? config.openai.temperature,
        system_prompt: v.system_prompt ?? '',
      };
      _cacheExpiry = now + 60_000; // cache 1 minute
      return _cachedSettings;
    }
  } catch { /* fallback to env */ }

  _cachedSettings = {
    openai_key: config.openai.apiKey,
    model: config.openai.model,
    base_url: config.openai.baseUrl ?? 'https://api.openai.com/v1',
    max_tokens: config.openai.maxTokens,
    temperature: config.openai.temperature,
    system_prompt: '',
  };
  _cacheExpiry = now + 60_000;
  return _cachedSettings;
}

function buildClient(settings: AISettings): OpenAI {
  return new OpenAI({
    apiKey: settings.openai_key,
    baseURL: settings.base_url,
  });
}

export function clearAISettingsCache(): void {
  _cachedSettings = null;
  _cacheExpiry = 0;
}

// =============================================================================
// System Prompt — Professional Saudi Real Estate AI
// =============================================================================

const SYSTEM_PROMPT = `انت "نقيدان" — مستشار عقاري ذكي لشركة عبدالحكيم النقيدان للاستثمارات العقارية في الرياض.

## شخصيتك
- محترف وودود في آن — كمستشار عقاري خبير لديه 15 سنة تجربة
- تتحدث بالعربية الفصحى البسيطة أو العامية السعودية حسب أسلوب العميل
- ردودك مختصرة وواضحة (3-5 جمل كحد أقصى ما لم يطلب تفصيلاً)
- تستخدم إيموجي باعتدال 🏠
- لا تكرر نفسك، لا تقل "بالطبع" أو "حسناً" في بداية كل جملة
- أسلوبك راقٍ وحازم — مثل مستشار لا مندوب مبيعات

## مهامك
1. **فهم حاجة العميل** — اسأل سؤالاً واحداً فقط لتوضيح الطلب
2. **عرض العقارات** — إذا وُجدت عقارات في السياق، اعرضها بتفاصيلها الحقيقية
3. **جمع البيانات تدريجياً** — النوع → المنطقة → الميزانية → الغرف
4. **التحويل للموظف** — عند الجاهزية للشراء أو الشكاوى أو التفاوض

## صيغة عرض العقار (إلزامية)
🏠 *[الاسم]*
📍 [الحي] - [المدينة]
💰 [السعر] ريال
📐 [المساحة] م² | 🛏 [الغرف] غرفة
📋 الكود: [الكود]

## قواعد صارمة
- لا تذكر أسعاراً خيالية — فقط من العقارات الموجودة في السياق
- لا ترسل أكثر من 3 عقارات في رسالة واحدة
- إذا لم تجد عقاراً مناسباً: "لا يوجد حالياً ما يناسب طلبك تماماً، سأبلغ فريق المبيعات لمتابعتك"
- لا تعد بأشياء خارج صلاحياتك
- ساعات العمل: صباحاً 9:30-12:00 | مساءً 4:00-9:30 | إجازة الجمعة`;

// =============================================================================
// Main Processing — Single API Call (Intent + Response combined)
// =============================================================================

export const processMessage = async (
  messageContent: string,
  client: Client,
  conversationHistory: Message[],
  availableProperties?: Property[]
): Promise<AIProcessingResult> => {
  const startTime = Date.now();

  try {
    const settings = await getAISettings();
    const openai = buildClient(settings);
    const isGroqCall = settings.base_url?.includes('groq.com') ?? false;

    const historyMessages = buildConversationHistory(conversationHistory);
    const contextBlock = buildContextBlock(client, availableProperties);
    const systemPrompt = settings.system_prompt || SYSTEM_PROMPT;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt + '\n\n' + contextBlock },
      ...historyMessages,
      {
        role: 'user',
        content: messageContent + '\n\n[SYSTEM: في نهاية ردك أضف سطراً بهذا الشكل بالضبط:\nJSON:{"intent":"search_property|property_details|price_inquiry|appointment_request|greeting|complaint|human_agent_request|general_inquiry|unknown","budget_max":null,"budget_min":null,"property_type":null,"city":null,"district":null,"rooms":null,"purpose":null,"client_name":null,"urgency":"low|medium|high","sentiment":"positive|neutral|negative"}]',
      },
    ];

    const completion = await openai.chat.completions.create({
      model: settings.model,
      messages,
      temperature: settings.temperature ?? 0.7,
      max_tokens: settings.max_tokens ?? 600,
    });

    const rawOutput = completion.choices[0]?.message?.content ?? '';
    const { response, intent, extracted_data } = parseAIOutput(rawOutput, messageContent);

    const shouldSendProperties =
      ['search_property', 'price_inquiry'].includes(intent.primary) &&
      (availableProperties?.length ?? 0) > 0;

    const { shouldEscalate, escalationReason } = determineEscalation(intent, client, messageContent);

    const tokens = completion.usage?.total_tokens ?? 0;

    return {
      intent,
      extracted_data,
      response,
      should_send_properties: shouldSendProperties,
      property_search_params: shouldSendProperties ? buildSearchParams(extracted_data) : undefined,
      should_escalate: shouldEscalate,
      escalation_reason: escalationReason,
      sentiment: extracted_data.sentiment ?? 'neutral',
      language: 'ar',
      tokens_used: tokens,
      model: settings.model,
      response_time_ms: Date.now() - startTime,
      cost_usd: calculateCost(tokens, settings.model),
    };
  } catch (error) {
    logger.error('AI processing error', { error, msg: messageContent.substring(0, 100) });
    throw error;
  }
};

// =============================================================================
// Parse AI Output (response + JSON intent in one call)
// =============================================================================

const parseAIOutput = (
  raw: string,
  originalMessage: string
): { response: string; intent: AIIntent; extracted_data: AIExtractedData } => {
  // Split on JSON: marker
  const jsonMarker = raw.lastIndexOf('\nJSON:');
  let response = raw;
  let jsonStr = '{}';

  if (jsonMarker !== -1) {
    response = raw.substring(0, jsonMarker).trim();
    jsonStr = raw.substring(jsonMarker + 6).trim();
  }

  let parsed: any = {};
  try {
    // Clean markdown if model wrapped it
    const clean = jsonStr.replace(/```json?|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch { /* use defaults */ }

  const intent: AIIntent = {
    primary: parsed.intent ?? 'general_inquiry',
    confidence: parsed.intent ? 0.9 : 0.5,
  };

  const extracted_data: AIExtractedData = {
    property_type: parsed.property_type ?? undefined,
    city: parsed.city ?? undefined,
    district: parsed.district ?? undefined,
    budget_max: parsed.budget_max ?? undefined,
    budget_min: parsed.budget_min ?? undefined,
    rooms: parsed.rooms ?? undefined,
    purpose: parsed.purpose ?? undefined,
    client_name: parsed.client_name ?? undefined,
    urgency: parsed.urgency ?? 'low',
    sentiment: parsed.sentiment ?? 'neutral',
    special_requirements: undefined,
  };

  return { response: response || 'عذراً، لم أفهم الرسالة. هل يمكنك توضيح طلبك؟', intent, extracted_data };
};

// =============================================================================
// Audio Transcription
// =============================================================================

export const transcribeAudio = async (audioBuffer: Buffer, mimeType: string): Promise<string> => {
  const settings = await getAISettings();
  const openai = buildClient(settings);
  const isGroqCall = settings.base_url?.includes('groq.com') ?? false;
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'wav';
  const file = new File([audioBuffer], `audio.${ext}`, { type: mimeType });
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: isGroqCall ? 'whisper-large-v3' : (config.openai.whisperModel ?? 'whisper-1'),
    language: 'ar',
    response_format: 'text',
  });
  return typeof transcription === 'string' ? transcription : (transcription as any).text ?? '';
};

// =============================================================================
// Image Analysis
// =============================================================================

export const analyzeImage = async (imageUrl: string, caption?: string): Promise<string> => {
  try {
    const settings = await getAISettings();
    const openai = buildClient(settings);
    const isGroqCall = settings.base_url?.includes('groq.com') ?? false;
    const visionModel = isGroqCall ? 'meta-llama/llama-4-scout-17b-16e-instruct' : (config.openai.visionModel ?? settings.model);
    const response = await openai.chat.completions.create({
      model: visionModel,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl, detail: 'auto' } },
          { type: 'text', text: caption ? `صف هذه الصورة في سياق عقاري. التعليق: ${caption}` : 'صف هذه الصورة في سياق عقاري.' },
        ],
      }],
      max_tokens: 300,
    });
    return response.choices[0]?.message?.content ?? 'لم أتمكن من تحليل الصورة';
  } catch {
    return 'صورة';
  }
};

// =============================================================================
// Property Formatter (WhatsApp)
// =============================================================================

export const formatPropertyMessage = (property: Property, index: number): string => {
  const typeAr: Record<string, string> = {
    land: 'أرض', apartment: 'شقة', villa: 'فيلا', building: 'عمارة',
    office: 'مكتب', showroom: 'معرض', warehouse: 'مستودع', farm: 'مزرعة',
    investment_project: 'مشروع استثماري', other: 'عقار',
  };
  const type = typeAr[property.property_type ?? ''] ?? 'عقار';
  const location = [property.district_name, property.city_name].filter(Boolean).join(' - ');
  const price = property.price ? `💰 *${property.price.toLocaleString('ar-SA')} ريال*` : '';
  const area = property.area_sqm ? `📐 ${property.area_sqm.toLocaleString()} م²` : '';
  const rooms = property.rooms ? ` | 🛏 ${property.rooms} غرفة` : '';
  const features = (property.features ?? []).slice(0, 2).join(' • ');

  return `*${index}. ${type} — ${property.title_ar ?? property.title}*
📍 ${location}
${area}${rooms}
${price}${features ? '\n✨ ' + features : ''}
📋 الكود: *${property.code}*`;
};

export const formatPropertiesResponse = (properties: Property[], searchSummary: string): string => {
  if (!properties.length) {
    return `لا يوجد حالياً عقار يناسب ${searchSummary}.\n\nسأبلغ فريق المبيعات لمتابعتك بأقرب فرصة. 🤝`;
  }
  const list = properties.slice(0, 3).map((p, i) => formatPropertyMessage(p, i + 1)).join('\n\n─────────────\n\n');
  const footer = properties.length > 3 ? `\n\n📌 هل تريد مشاهدة المزيد؟` : '\n\n💬 هل تريد تفاصيل أو موعد معاينة لأي منها؟';
  return `وجدت ${properties.length} عقار${properties.length > 1 ? 'ات' : ''} مناسبة:\n\n` + list + footer;
};

// =============================================================================
// Helper Functions
// =============================================================================

const buildConversationHistory = (messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] =>
  messages.slice(-12).map((msg) => ({
    role: msg.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
    content: msg.transcription ?? msg.content ?? '[رسالة وسائط]',
  }));

const buildContextBlock = (client: Client, properties?: Property[]): string => {
  const now = new Date(Date.now() + 3 * 3600000); // Riyadh time
  const h = now.getHours();
  const greeting = h < 12 ? 'صباح الخير ☀️' : h < 17 ? 'مساء الخير 🌤️' : 'مساء النور 🌙';

  let ctx = `[السياق — وقت الرياض: ${now.toLocaleTimeString('ar-SA')} — ${greeting}]

معلومات العميل:
- الاسم: ${client.full_name}
- الحالة: ${client.status}
- أول تواصل: ${client.first_contact_at ? new Date(client.first_contact_at).toLocaleDateString('ar-SA') : 'جديد'}`;

  if ((client as any).budget_max) ctx += `\n- الميزانية القصوى: ${Number((client as any).budget_max).toLocaleString('ar-SA')} ريال`;
  if ((client as any).preferred_property_types?.length) ctx += `\n- يبحث عن: ${(client as any).preferred_property_types.join(', ')}`;
  if ((client as any).special_requirements) ctx += `\n- متطلبات خاصة: ${(client as any).special_requirements}`;

  if (properties?.length) {
    ctx += `\n\nعقارات متاحة ومطابقة في قاعدة البيانات (اذكر تفاصيلها في ردك):\n`;
    ctx += properties.slice(0, 5).map((p, i) => {
      const typeAr: Record<string, string> = { land:'أرض', apartment:'شقة', villa:'فيلا', building:'عمارة', office:'مكتب', showroom:'معرض', warehouse:'مستودع', farm:'مزرعة', investment_project:'مشروع استثماري', other:'أخرى' };
      const loc = [p.district_name, p.city_name].filter(Boolean).join(' - ');
      return `${i+1}. ${typeAr[p.property_type??'']??'عقار'}: ${p.title_ar??p.title} | 💰 ${p.price?.toLocaleString('ar-SA')} ريال | 📐 ${p.area_sqm??'؟'} م² | 🛏 ${p.rooms??'؟'} | 📍 ${loc} | كود: ${p.code}`;
    }).join('\n');
    ctx += '\n\nمهم: اعرض هذه العقارات بالصيغة المطلوبة في ردك.';
  }

  return ctx;
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
  if (intent.primary === 'human_agent_request') return { shouldEscalate: true, escalationReason: 'طلب العميل التحدث مع موظف' };
  if (intent.primary === 'complaint') return { shouldEscalate: true, escalationReason: 'شكوى من العميل' };
  if (['negotiating', 'contract_pending'].includes(client.status)) return { shouldEscalate: true, escalationReason: 'عميل في مرحلة التفاوض' };
  if (['الآن', 'فوراً', 'عاجل', 'ضروري', 'هام جداً'].some(kw => message.includes(kw))) return { shouldEscalate: true, escalationReason: 'طلب عاجل' };
  return { shouldEscalate: false };
};

const calculateCost = (tokens: number, model: string): number => {
  const rates: Record<string, number> = {
    'gpt-4o': 0.005, 'gpt-4o-mini': 0.00015, 'gpt-4-turbo': 0.01,
    'llama-3.3-70b-versatile': 0.00059, 'llama-3.1-8b-instant': 0.00005,
    'mixtral-8x7b-32768': 0.00024, 'gemma2-9b-it': 0.0002,
  };
  return (tokens / 1000) * (rates[model] ?? 0.001);
};

export const extractIntentAndEntities = async (msg: string) => {
  return { intent: { primary: 'general_inquiry', confidence: 0.7 }, extracted_data: {}, sentiment: 'neutral' as const, language: 'ar' as const, intentTokens: 0 };
};