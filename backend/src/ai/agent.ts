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

const SYSTEM_PROMPT = `انت مستشار مبيعات عقاري محترف في مكتب عبدالحكيم النقيدان العقاري — لست بوتاً يجاوب، بل موظف يقود البيع.

## شخصيتك
لهجة سعودية بيضاء، محترف وودود. مختصر جداً: **سطرين أو ثلاثة كحد أقصى**. تقود الحوار ولا تنتظر العميل. لا تكرر عبارة استخدمتها قبل قليل.

## ممنوع منعاً باتاً
- **لا تستخدم أي إيموجي إطلاقاً.** لا في التحية ولا في القوائم ولا في أي رد. الأسلوب نصي احترافي بحت.
- **لا تعرّف بنفسك ولا بالشركة بعد أول رسالة.** أي رد يبدأ بـ"مرحباً بك في شركة..." خطأ فادح.
- **الشركة تعمل في بريدة فقط. لا تسأل عن المدينة ولا عن الحي أبداً** — هذا سؤال غير لازم ويُزعج العميل. إن ذكر العميل حياً بنفسه استخدمه، وإلا تجاهل الموضوع كلياً.
- **لا تسأل عن شيء ذكره العميل.**
- **سؤال واحد فقط في الرسالة.** لا تصفّ أسئلة (الميزانية؟ الغرف؟).
- **لا تخترع عقاراً ولا سعراً.** اعرض فقط ما هو موجود في السياق.
- **لا تفترض طلباً من بيانات قديمة.** إن سلّم العميل فقط، سلّم عليه واسأل عن حاجته.

## اقرأ نية العميل لا كلماته
"أبي شقة" ← بحث عن شقة
"عندكم فلل؟" ← بحث عن فلل
"معي ٨٠٠ ألف" ← ميزانية 800,000
"شي قريب من المستشفى" ← تفضيل موقع
"أبي أأجر" ← إيجار

## اجمع المعلومات بالتدريج
معلومة واحدة كل رسالة، وبعد كل رد اشكره بصيغة مختلفة ثم اسأل التالي:
الميزانية ← الغرف ← التفاصيل.

## نوّع عباراتك
بدل تكرار "شكراً": أبشر · الله يعطيك العافية · يسعدني خدمتك · على الرحب والسعة · بكل سرور · تمام · ممتاز.

## لما ما فيه عقار مطابق
لا تقل "لا يوجد" وتسكت. رشّح البديل:
"حالياً ما فيه بنفس المواصفات، لكن عندي خيارين قريبين من طلبك — أعرضهم لك؟"

## لما يقول "السعر مرتفع"
لا تكرر السعر ولا تتجاهل. تفهّم ثم اعرض بديلاً:
"أفهمك. هذا العقار مميز بموقعه وتشطيبه، ومع ذلك أقدر أرشح لك خيارات بسعر أقل إذا الميزانية محددة."

## لما يقول "بفكر وأرد عليك"
"بكل تأكيد، خذ راحتك. وإذا حبيت أرشح لك خيارات مشابهة تكون عندك مقارنة قبل ما تقرر."

## قُد العميل دائماً
اختم بخيار واضح بدل انتظار سؤاله:
"أرسل لك الصور؟ · تبي الموقع؟ · أعرض عليك مشابه؟ · أرتب لك معاينة؟"

## حوّل لموظف بشري عند
التفاوض على السعر · الحجز · توقيع العقد · شكوى · مسألة قانونية.
قل: "يسعدنا خدمتك، وبيتواصل معك أحد مستشارينا مباشرة لإكمال هذي الخطوة."

## الختام
"سعدت بخدمتك، وأي استفسار عن بيع أو شراء أو إيجار أنا موجود."`;

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
        content: messageContent + '\n\n[SYSTEM: في نهاية ردك أضف سطراً بهذا الشكل بالضبط. property_type و purpose يجب أن تكونا بالإنجليزية من القيم المذكورة فقط أو null. special_requirements: قائمة كلمات عربية قصيرة لأي ميزة محددة ذكرها العميل (مثل "مطبخ راكب"، "قريب من مدرسة")، أو null إن لم يذكر شيئاً:\nJSON:{"intent":"search_property|property_details|price_inquiry|appointment_request|greeting|complaint|human_agent_request|general_inquiry|unknown","budget_max":null,"budget_min":null,"property_type":"land|apartment|villa|building|office|showroom|warehouse|farm|other|null","city":null,"district":null,"rooms":null,"purpose":"sale|rent|null","special_requirements":null,"client_name":null,"urgency":"low|medium|high","sentiment":"positive|neutral|negative"}]',
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

// The prompt asks the model for English enum values, but it drifts (e.g. returns
// "شقة" instead of "apartment"). property.service filters with a strict equality
// match, so an unnormalised value means zero rows ever match — the bot looks like
// it "doesn't understand" and newly imported listings never surface. Normalise
// defensively rather than trusting the prompt alone.
const PROPERTY_TYPE_NORMALIZE: Record<string, string> = {
  land: 'land', 'أرض': 'land', 'ارض': 'land',
  apartment: 'apartment', 'شقة': 'apartment', 'شقه': 'apartment',
  villa: 'villa', 'فيلا': 'villa', 'بيت': 'villa',
  building: 'building', 'مبنى': 'building', 'عمارة': 'building',
  office: 'office', 'مكتب': 'office',
  showroom: 'showroom', 'محل': 'showroom', 'صالة': 'showroom', 'صاله': 'showroom',
  warehouse: 'warehouse', 'مستودع': 'warehouse',
  farm: 'farm', 'مزرعة': 'farm', 'مزرعه': 'farm', 'استراحة': 'farm', 'استراحه': 'farm',
  investment_project: 'investment_project',
  other: 'other',
};

const PURPOSE_NORMALIZE: Record<string, string> = {
  sale: 'sale', buy: 'sale', 'بيع': 'sale', 'شراء': 'sale',
  rent: 'rent', 'إيجار': 'rent', 'ايجار': 'rent', 'تأجير': 'rent',
  both: 'both',
};

const normalizeEnum = (
  value: string | null | undefined,
  map: Record<string, string>
): string | undefined => {
  if (!value) return undefined;
  const key = String(value).trim().toLowerCase();
  return map[key] ?? map[String(value).trim()] ?? undefined;
};

const parseAIOutput = (
  raw: string,
  originalMessage: string
): { response: string; intent: AIIntent; extracted_data: AIExtractedData } => {
  // Split on the JSON: marker. The model is asked for "\nJSON:" but sometimes
  // omits the newline, wraps it in a code fence, or drops the colon — any of
  // which used to leave the raw JSON blob sitting inside the WhatsApp reply.
  // Search for the last "{...}" block instead of a fixed-format marker, so the
  // customer-facing text stays clean regardless of exact model formatting.
  let response = raw;
  let jsonStr = '{}';

  // Trailing ``` after the closing brace (a code-fenced JSON block) would
  // otherwise break the end-of-string anchor below, so strip fence markers first.
  const unfenced = raw.replace(/```json?/gi, '').replace(/```/g, '');
  const blockMatch = unfenced.match(/JSON\s*:?\s*(\{[\s\S]*\})\s*$/i) ?? unfenced.match(/(\{[^{}]*"intent"[\s\S]*\})\s*$/);
  if (blockMatch) {
    jsonStr = blockMatch[1] ?? '{}';
    response = unfenced.slice(0, unfenced.lastIndexOf(blockMatch[0])).replace(/JSON\s*:?\s*$/i, '').trim();
  }

  let parsed: any = {};
  try {
    // Clean markdown if model wrapped it
    const clean = jsonStr.replace(/```json?|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch { /* use defaults */ }

  const KNOWN_INTENTS = new Set([
    'search_property', 'property_details', 'price_inquiry', 'appointment_request',
    'greeting', 'complaint', 'human_agent_request', 'general_inquiry', 'unknown',
  ]);

  // A model may answer with a bare string, a {primary} object, or a label we
  // never listed. Normalise all three rather than letting a non-string reach
  // the database or an unrecognised label silently change routing.
  const rawIntent: unknown = typeof parsed.intent === 'object' && parsed.intent !== null
    ? (parsed.intent as any).primary
    : parsed.intent;
  const intentName = typeof rawIntent === 'string' ? rawIntent.trim() : '';
  const recognised = KNOWN_INTENTS.has(intentName);

  const intent: AIIntent = {
    primary: recognised ? intentName : 'general_inquiry',
    confidence: recognised ? 0.9 : 0.5,
  };

  const toNum = (v: unknown): number | undefined => {
    if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : undefined;
    if (typeof v === 'string') {
      const latin = v
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
      // "مليون" / "million" without digits still carries a magnitude.
      const millions = /مليون|million/i.test(latin);
      const thousands = /ألف|الف|thousand|k/i.test(latin);
      const digits = latin.replace(/[^\d.]/g, '');
      let n = parseFloat(digits);
      if (!Number.isFinite(n) || n <= 0) return undefined;
      // A bare "700" alongside "ألف" is 700 thousand; "1.5 مليون" is 1.5m.
      if (millions && n < 100000) n *= 1_000_000;
      else if (thousands && n < 1000) n *= 1_000;
      return n;
    }
    return undefined;
  };

  const extracted_data: AIExtractedData = {
    property_type: normalizeEnum(parsed.property_type, PROPERTY_TYPE_NORMALIZE) as any,
    city: parsed.city ?? undefined,
    district: parsed.district ?? undefined,
    budget_max: toNum(parsed.budget_max),
    budget_min: toNum(parsed.budget_min),
    rooms: (() => { const r = toNum(parsed.rooms); return r === undefined ? undefined : Math.round(r); })(),
    purpose: normalizeEnum(parsed.purpose, PURPOSE_NORMALIZE) as any,
    client_name: parsed.client_name ?? undefined,
    urgency: parsed.urgency ?? 'low',
    sentiment: parsed.sentiment ?? 'neutral',
    special_requirements: Array.isArray(parsed.special_requirements)
      ? parsed.special_requirements.filter((s: any) => typeof s === 'string' && s.trim()).slice(0, 5)
      : undefined,
  };

  // Final safety net: strip any stray JSON/code-fence remnants the regex above
  // didn't catch, rather than forwarding a technical blob to the customer.
  const cleanResponse = response
    .replace(/```json?[\s\S]*?```/gi, '')
    .replace(/JSON\s*:\s*\{[\s\S]*\}\s*$/i, '')
    .trim();

  return { response: cleanResponse || 'عذراً، لم أفهم الرسالة. هل يمكنك توضيح طلبك؟', intent, extracted_data };
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

/** Pick a different wording each time so the bot never sounds canned. */
const pick = (options: string[]): string => options[Math.floor(Math.random() * options.length)]!;

export const THANKS = ['أبشر', 'الله يعطيك العافية', 'يسعدني خدمتك', 'على الرحب والسعة', 'بكل سرور', 'تمام', 'ممتاز'];
export const pickThanks = (): string => pick(THANKS);

export const formatPropertyMessage = (property: Property, index: number): string => {
  const typeAr: Record<string, string> = {
    land: 'أرض', apartment: 'شقة', villa: 'فيلا', building: 'عمارة',
    office: 'مكتب', showroom: 'معرض', warehouse: 'مستودع', farm: 'مزرعة',
    investment_project: 'مشروع استثماري', other: 'عقار',
  };
  const type = typeAr[property.property_type ?? ''] ?? 'عقار';
  const deal = property.purpose === 'rent' ? 'للإيجار' : 'للبيع';
  const location = [property.district_name, property.city_name].filter(Boolean).join(' – ');

  // Only show a line when we actually have the value — blank fields look sloppy.
  // Area is deliberately omitted — the client wants rooms/bathrooms/kitchen/
  // living-room instead, since that's what customers actually ask about.
  const lines: string[] = [`*${type} ${deal}*`];
  if (location) lines.push(location);
  if (property.price) lines.push(`السعر: *${Number(property.price).toLocaleString('en-US')} ريال*`);
  if (property.rooms) lines.push(`${property.rooms} غرف`);
  if ((property as any).bathrooms) lines.push(`${(property as any).bathrooms} دورات مياه`);
  if ((property as any).kitchens) lines.push(`${(property as any).kitchens} مطبخ`);
  if ((property as any).living_rooms) lines.push(`${(property as any).living_rooms} صالة`);

  const features = (property.features ?? []).slice(0, 3);
  for (const f of features) lines.push(f);

  if (property.code) lines.push(`الكود: ${property.code}`);

  return `*${index})* ` + lines.join('\n');
};

/** Full single-property view — sent when a customer asks about a specific
 * listing by code or number, so it carries everything the compact list
 * form intentionally leaves out (description, every feature/amenity). */
export const formatPropertyDetails = (property: Property): string => {
  const typeAr: Record<string, string> = {
    land: 'أرض', apartment: 'شقة', villa: 'فيلا', building: 'عمارة',
    office: 'مكتب', showroom: 'معرض', warehouse: 'مستودع', farm: 'مزرعة',
    investment_project: 'مشروع استثماري', other: 'عقار',
  };
  const type = typeAr[property.property_type ?? ''] ?? 'عقار';
  const deal = property.purpose === 'rent' ? 'للإيجار' : 'للبيع';
  const location = [property.district_name, property.city_name].filter(Boolean).join(' – ');

  const lines: string[] = [`*${type} ${deal}*`];
  if (location) lines.push(location);
  if (property.price) lines.push(`السعر: *${Number(property.price).toLocaleString('en-US')} ريال*`);
  if (property.rooms) lines.push(`${property.rooms} غرف`);
  if ((property as any).bathrooms) lines.push(`${(property as any).bathrooms} دورات مياه`);
  if ((property as any).kitchens) lines.push(`${(property as any).kitchens} مطبخ`);
  if ((property as any).living_rooms) lines.push(`${(property as any).living_rooms} صالة`);
  if (property.floor_number !== undefined && property.floor_number !== null) {
    lines.push(property.floor_number === 0 ? 'الدور: الأرضي' : `الدور: ${property.floor_number}`);
  }

  const features = [...(property.features ?? []), ...((property as any).amenities ?? [])];
  if (features.length) lines.push('', 'المميزات:', ...features.map((f) => `- ${f}`));

  if (property.description_ar) lines.push('', property.description_ar);

  // A pinned location follows as a separate WhatsApp message when coordinates
  // exist; when only a Maps link is on file, give it here as clickable text.
  if (property.google_maps_url && !(property.latitude && property.longitude)) {
    lines.push('', `الموقع على الخريطة: ${property.google_maps_url}`);
  }

  if (property.code) lines.push('', `الكود: ${property.code}`);

  return lines.join('\n');
};

export const formatPropertiesResponse = (properties: Property[], searchSummary: string): string => {
  if (!properties.length) {
    return `حالياً ما لقيت عقار بنفس مواصفات ${searchSummary}.\n\nودّي أرشح لك أقرب الخيارات المتاحة، أعرضها عليك؟`;
  }

  // The client asked to see every matching listing, not just a top-3 sample —
  // the catalogue is small enough (dozens, not hundreds) that this stays readable.
  const list = properties.map((p, i) => formatPropertyMessage(p, i + 1)).join('\n\n───────────\n\n');
  const intro = properties.length === 1
    ? 'لقيت لك هذا الخيار:'
    : `لقيت لك ${properties.length} خيارات:`;

  // Always close by leading the customer, never by waiting.
  const footer = '\n\nأرسل لك الصور والموقع؟ أو أرتب لك معاينة؟';
  return `${intro}\n\n${list}${footer}`;
};

// =============================================================================
// Helper Functions
// =============================================================================

const buildConversationHistory = (messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] =>
  messages.slice(-20).map((msg) => ({
    role: msg.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
    content: msg.transcription ?? msg.content ?? '[رسالة وسائط]',
  }));

const buildContextBlock = (client: Client, properties?: Property[]): string => {
  const utc = Date.now() + new Date().getTimezoneOffset() * 60000;
  const now = new Date(utc + 3 * 3600000); // Riyadh time
  const h = now.getHours();
  const greeting = h < 12 ? 'صباح الخير' : h < 17 ? 'مساء الخير' : 'مساء النور';

  let ctx = `[السياق — وقت الرياض: ${now.toLocaleTimeString('ar-SA')} — ${greeting}]

معلومات العميل:
- الاسم: ${client.full_name}
- الحالة: ${client.status}
- أول تواصل: ${client.first_contact_at ? new Date(client.first_contact_at).toLocaleDateString('ar-SA') : 'جديد'}`;

  if ((client as any).budget_max) ctx += `\n- الميزانية القصوى: ${Number((client as any).budget_max).toLocaleString('ar-SA')} ريال`;
  if ((client as any).preferred_property_types?.length) ctx += `\n- يبحث عن: ${(client as any).preferred_property_types.join(', ')}`;
  if ((client as any).special_requirements) ctx += `\n- متطلبات خاصة: ${(client as any).special_requirements}`;

  if (properties?.length) {
    // The full matching list is sent right after as separate property cards —
    // this excerpt is only so the model's own reply can reference real numbers,
    // not a second full listing, so it stays short even when matches run into
    // the dozens.
    ctx += `\n\nعقارات متاحة ومطابقة في قاعدة البيانات (${properties.length} إجمالاً — القائمة الكاملة ستُرسل بعد ردك كبطاقات منفصلة، لا تكررها هنا):\n`;
    ctx += properties.slice(0, 5).map((p, i) => {
      const typeAr: Record<string, string> = { land:'أرض', apartment:'شقة', villa:'فيلا', building:'عمارة', office:'مكتب', showroom:'معرض', warehouse:'مستودع', farm:'مزرعة', investment_project:'مشروع استثماري', other:'أخرى' };
      const loc = [p.district_name, p.city_name].filter(Boolean).join(' - ');
      const feats = [...(p.features ?? []), ...((p as any).amenities ?? [])];
      const featsStr = feats.length ? ` | مميزات: ${feats.join('، ')}` : '';
      return `${i+1}. ${typeAr[p.property_type??'']??'عقار'}: ${p.title_ar??p.title} | ${p.price?.toLocaleString('ar-SA')} ريال | ${p.rooms??'؟'} غرف | ${loc} | كود: ${p.code}${featsStr}`;
    }).join('\n');
    ctx += '\n\nمهم: لا تسرد كل العقارات في ردك النصي — اذكر فقط أنك وجدت خيارات مناسبة، القائمة الكاملة ستصل بعدك تلقائياً. إذا سأل العميل عن ميزة معينة (مطبخ راكب، تكييف، موقف سيارات...) اعتمد فقط على المميزات المذكورة هنا — لا تخترع ولا تفترض ميزة غير مذكورة.';
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
  features: data.special_requirements,
  // The client wants every matching listing sent, not a top-5 sample.
  limit: 200,
  sort_by: 'featured',
});

const determineEscalation = (
  intent: AIIntent,
  client: Client,
  message: string
): { shouldEscalate: boolean; escalationReason?: string } => {
  if (intent.primary === 'human_agent_request') return { shouldEscalate: true, escalationReason: 'طلب العميل التحدث مع موظف' };
  if (intent.primary === 'complaint') return { shouldEscalate: true, escalationReason: 'شكوى من العميل' };
  // Status-based escalation is meant for an active, ongoing negotiation, not a
  // permanent label — client.status only changes on its own next update, so
  // without a recency check a client who was ever 'negotiating' would find
  // the bot escalating (and, previously, going silent) on every future
  // message indefinitely, even months later.
  const RECENT_NEGOTIATION_MS = 48 * 3600 * 1000;
  const updatedRecently = client.updated_at && (Date.now() - new Date(client.updated_at).getTime() < RECENT_NEGOTIATION_MS);
  if (['negotiating', 'contract_pending'].includes(client.status) && updatedRecently) {
    return { shouldEscalate: true, escalationReason: 'عميل في مرحلة التفاوض' };
  }
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