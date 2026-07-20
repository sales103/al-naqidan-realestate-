// =============================================================================
// Complaint mode — detection, severity, classification, agent handover
//
// A frustrated customer needs a different bot: no marketing, no arguing, short
// calm replies, quick information gathering, and a fast route to a human.
// =============================================================================

/** 1 🟢 calm · 2 🟡 annoyed · 3 🟠 angry · 4 🔴 very angry */
export type AngerLevel = 1 | 2 | 3 | 4;

export type ComplaintCategory =
  | 'no_response' | 'contract' | 'payment' | 'refund'
  | 'agent' | 'viewing' | 'listing_data' | 'technical' | 'other';

export const CATEGORY_AR: Record<ComplaintCategory, string> = {
  no_response: 'تأخر الرد',
  contract: 'مشكلة عقد',
  payment: 'مشكلة دفعة',
  refund: 'طلب استرجاع',
  agent: 'مشكلة مع وسيط',
  viewing: 'مشكلة موعد معاينة',
  listing_data: 'بيانات عقار غير صحيحة',
  technical: 'مشكلة تقنية',
  other: 'أخرى',
};

const LEVEL_ICON: Record<AngerLevel, string> = { 1: '🟢', 2: '🟡', 3: '🟠', 4: '🔴' };
const LEVEL_AR: Record<AngerLevel, string> = { 1: 'هادئ', 2: 'منزعج', 3: 'غاضب', 4: 'شديد الغضب' };

/** Normalise Arabic so 'شكوى' / 'شكوي' / 'الشكوى' all match. */
function norm(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئء]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Escalating severity — the strongest match wins.
const SEVERE = [
  'نصب', 'احتيال', 'محتالين', 'سرقه', 'رفعت شكوي', 'راح اشتكي', 'بشتكي', 'ساشتكي',
  'محامي', 'قضيه', 'المحكمه', 'وزاره', 'مستحيل اتعامل', 'ابغي المدير', 'ابي المدير',
  'ابغي المسؤول', 'ابي المسؤول', 'اسوا شركه',
];
const ANGRY = [
  'الخدمه سيئه', 'خدمه سيئه', 'غير مقبول', 'مو مقبول', 'زعلان', 'متضايق', 'مستاء',
  'تعبت منكم', 'كذب', 'وعدتوني', 'مو معقول', 'استهتار', 'اهمال',
];
const ANNOYED = [
  'ما احد رد', 'مافي رد', 'ما رديتو', 'لي اسبوع', 'لي يومين', 'من زمان', 'متاخرين',
  'تاخرتوا', 'ما وصلني', 'وين الرد', 'انتظر', 'شكوي', 'مشكله',
];

/** Something went wrong, said without an angry word. */
const NEGATIVE = [
  'ما جا', 'ما جاء', 'ما حضر', 'ما يفتح', 'ما يشتغل', 'ما يعمل', 'ما وصل', 'ما وصلني',
  'مختلف', 'مختلفه', 'غير مطابق', 'مو مطابق', 'غلط', 'خطا', 'مو صحيح', 'ما ضبط',
  'استرجاع', 'استرداد', 'ارجعوا', 'الغيت', 'ملغي', 'ما تم', 'لم يتم',
];

const CATEGORY_HINTS: [ComplaintCategory, string[]][] = [
  ['no_response',  ['ما احد رد', 'مافي رد', 'وين الرد', 'ما رديتو', 'متاخرين', 'انتظر']],
  ['contract',     ['عقد', 'العقد', 'بنود', 'توقيع']],
  ['payment',      ['دفعه', 'دفعت', 'تحويل', 'فاتوره', 'مبلغ', 'سددت']],
  ['refund',       ['استرجاع', 'ارجاع', 'استرداد', 'ارجعوا', 'فلوسي']],
  ['agent',        ['الوسيط', 'المندوب', 'الموظف', 'المستشار']],
  ['viewing',      ['معاينه', 'موعد', 'زياره', 'ما جا', 'تاخر عن الموعد']],
  ['listing_data', ['الصور', 'الاعلان', 'الوصف', 'غير مطابق', 'مختلف عن']],
  ['technical',    ['الموقع', 'التطبيق', 'الرابط', 'ما يفتح', 'خطا']],
];

export interface ComplaintSignal {
  isComplaint: boolean;
  level: AngerLevel;
  category: ComplaintCategory;
}

/** Detect a complaint and how upset the customer sounds. */
export function detectComplaint(text: string): ComplaintSignal {
  const t = norm(text);
  if (!t) return { isComplaint: false, level: 1, category: 'other' };

  const hit = (list: string[]) => list.some((w) => t.includes(norm(w)));

  let level: AngerLevel = 1;
  if (hit(ANNOYED)) level = 2;
  if (hit(ANGRY)) level = 3;
  if (hit(SEVERE)) level = 4;

  // Shouting and repeated punctuation read as anger too.
  if (level >= 2 && (/[!؟]{2,}/.test(text) || text === text.toUpperCase() && /[A-Z]{4,}/.test(text))) {
    level = Math.min(4, level + 1) as AngerLevel;
  }

  let category: ComplaintCategory = 'other';
  for (const [cat, words] of CATEGORY_HINTS) {
    if (words.some((w) => t.includes(norm(w)))) { category = cat; break; }
  }

  // A concrete problem in a known area counts as a complaint on its own.
  if (category !== 'other' && hit(NEGATIVE)) level = Math.max(level, 2) as AngerLevel;

  return { isComplaint: level >= 2, level, category };
}

/** Opening line — calmer and shorter the angrier the customer is. */
export function acknowledgement(level: AngerLevel): string {
  if (level >= 4) {
    return 'أعتذر لك بشدة عن هذي التجربة 🙏\nأنا معك الآن، وبرفع حالتك للمختص فوراً.';
  }
  if (level === 3) {
    return 'أعتذر عن التجربة اللي مررت فيها 🙏\nأبغى أفهم التفاصيل عشان أساعدك صح.';
  }
  return 'أعتذر على التأخير 🙏\nوش المشكلة بالضبط عشان أتابعها لك؟';
}

/** What we still need before handing over. */
export function nextQuestion(known: { description?: string; contract?: string }, category: ComplaintCategory): string | null {
  if (!known.description) return 'ممكن توضح لي المشكلة باختصار؟';
  if (!known.contract && ['contract', 'payment', 'refund'].includes(category)) {
    return 'عندك رقم العقد أو رقم العملية؟ إذا ما عندك اكتب "لا".';
  }
  return null;
}

/** Structured handover note so the customer never repeats themselves. */
export function buildAgentSummary(input: {
  clientName?: string;
  phone?: string;
  level: AngerLevel;
  category: ComplaintCategory;
  description?: string;
  contract?: string;
}): string {
  const priority = input.level >= 4 ? 'عاجلة جداً' : input.level === 3 ? 'عالية' : 'متوسطة';
  return [
    '📋 *ملخص شكوى*',
    `• العميل: ${input.clientName ?? '—'}`,
    `• الجوال: ${input.phone ?? '—'}`,
    `• نوع المشكلة: ${CATEGORY_AR[input.category]}`,
    `• الحالة: ${LEVEL_ICON[input.level]} ${LEVEL_AR[input.level]}`,
    `• الأولوية: ${priority}`,
    `• رقم العقد: ${input.contract ?? 'لم يُذكر'}`,
    `• وصف العميل: ${input.description ?? '—'}`,
    '• المطلوب: التواصل مع العميل ومعالجة الشكوى',
  ].join('\n');
}

/** Closing line before a human takes over. */
export function handoverLine(level: AngerLevel): string {
  if (level >= 3) {
    return 'رفعت حالتك للمختص بأولوية عالية، وبيتواصل معك في أقرب وقت.\nمن حقك تقدم أي ملاحظة، وهدفنا نعالج الموضوع بأسرع وقت 🤝';
  }
  return 'سجّلت شكواك ورفعتها للمختص مع كل التفاصيل، وبيتواصل معك قريباً 🤝';
}

/** Guidance injected into the AI when the conversation is a complaint. */
export const COMPLAINT_PROMPT = `العميل لديه شكوى. غيّر أسلوبك بالكامل:

- اهدأ واختصر. جملتان كحد أقصى. لا عروض ولا تسويق إطلاقاً.
- لا تجادل ولا تدافع ولا تلوم العميل. قال "أنتم السبب"؟ رُد: "أفهم سبب استيائك، وأبغى أفهم التفاصيل عشان أساعدك صح."
- لا تقلل من الشكوى ولا تسخر ولا تعتذر بصيغة جوفاء متكررة.
- لا تعد بشيء غير مضمون ولا تخمّن معلومة. غير متأكد؟ "هذي الحالة تحتاج مراجعة من المختص، وبرفعها بكل التفاصيل."
- اسأل سؤالاً واحداً فقط في كل رسالة.
- إذا قال "بشتكي عليكم": "من حقك تقدم أي ملاحظة، وهدفنا نعالج المشكلة بأسرع وقت. خلنا نراجع التفاصيل مع بعض."`;
