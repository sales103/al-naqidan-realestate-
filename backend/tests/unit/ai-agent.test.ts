import { describe, it, expect, jest } from '@jest/globals';

// The model is asked to answer in prose and append a single JSON line. The
// agent parses `intent` as a *string* (see the JSON contract in agent.ts) and
// wraps it as { primary, confidence } itself — mocking it as an object, which
// an earlier version of this suite did, silently produced a nested object and
// made every assertion meaningless.
const modelReply = (payload: Record<string, unknown>, prose = 'تمام، أبشر.') => ({
  choices: [{ message: { content: `${prose}
JSON:${JSON.stringify(payload)}` } }],
  usage: { total_tokens: 150 },
});

const createMock = jest.fn<(...a: any[]) => Promise<any>>();

jest.mock('openai', () => ({
  // Without __esModule the CJS interop never treats `default` as the ES
  // default export and `new OpenAI()` resolves to undefined.
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: createMock } },
    audio: { transcriptions: { create: jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue('أبغى شقة') } },
  })),
}));

jest.mock('../../src/database/redis.js', () => ({
  cacheGet: jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue(null),
  cacheSet: jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue(undefined),
  cacheKeys: { conversation: (id: string) => `conv:${id}` },
}));

// Only readFileSync is stubbed. Replacing the whole module left knex holding
// an undefined fs function and the suite crashed before any assertion ran.
jest.mock('fs', () => ({
  ...jest.requireActual<typeof import('fs')>('fs'),
  readFileSync: jest.fn<(...a: any[]) => any>().mockReturnValue('You are a real estate AI assistant.'),
}));

const client = (over: Record<string, unknown> = {}) => ({
  id: 'test-id', full_name: 'أحمد', phone: '+966500000000',
  status: 'new', ai_profile: {}, intent_history: [], ...over,
}) as any;

describe('AI Agent — intent extraction', () => {
  it('reads the trailing JSON line into intent and entities', async () => {
    createMock.mockResolvedValueOnce(modelReply({
      intent: 'search_property',
      property_type: 'apartment',
      city: 'بريدة',
      budget_max: 700000,
      sentiment: 'positive',
    }));

    const { processMessage } = await import('../../src/ai/agent.js');
    const result = await processMessage('أبغى شقة شمال بريدة أقل من 700 ألف', client(), []);

    expect(result.intent.primary).toBe('search_property');
    expect(result.intent.confidence).toBeGreaterThan(0.8);
    expect(result.extracted_data.property_type).toBe('apartment');
    expect(result.extracted_data.city).toBe('بريدة');
    expect(result.extracted_data.budget_max).toBe(700000);
  });

  it('falls back to general_inquiry when the model omits the JSON line', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'أهلاً وسهلاً' } }],
      usage: { total_tokens: 20 },
    });

    const { processMessage } = await import('../../src/ai/agent.js');
    const result = await processMessage('السلام عليكم', client(), []);

    expect(result.intent.primary).toBe('general_inquiry');
    expect(result.response).toContain('أهلاً');
  });

  it('normalises an intent the model wrapped in an object', async () => {
    // Models occasionally answer {primary, confidence} despite the contract.
    // That object used to reach messages.ai_intent (a text column) and break
    // the update, costing the customer the reply.
    createMock.mockResolvedValueOnce(modelReply({
      intent: { primary: 'search_property', confidence: 0.9 },
    }));

    const { processMessage } = await import('../../src/ai/agent.js');
    const result = await processMessage('شقة؟', client(), []);

    expect(typeof result.intent.primary).toBe('string');
    expect(result.intent.primary).toBe('search_property');
  });

  it('falls back when the model invents an unlisted intent', async () => {
    createMock.mockResolvedValueOnce(modelReply({ intent: 'buy_a_camel' }));

    const { processMessage } = await import('../../src/ai/agent.js');
    const result = await processMessage('...', client(), []);

    expect(result.intent.primary).toBe('general_inquiry');
    expect(result.should_escalate).toBe(false);
  });

  it('escalates when the customer asks for a human', async () => {
    createMock.mockResolvedValueOnce(modelReply({ intent: 'human_agent_request' }));

    const { processMessage } = await import('../../src/ai/agent.js');
    const result = await processMessage('أبغى أتكلم مع موظف', client({ status: 'negotiating' }), []);

    expect(result.should_escalate).toBe(true);
    expect(result.escalation_reason).toContain('موظف');
  });

  it('escalates a complaint', async () => {
    createMock.mockResolvedValueOnce(modelReply({ intent: 'complaint' }));

    const { processMessage } = await import('../../src/ai/agent.js');
    const result = await processMessage('عندي شكوى', client(), []);

    expect(result.should_escalate).toBe(true);
  });

  it('does not escalate an ordinary search', async () => {
    createMock.mockResolvedValueOnce(modelReply({ intent: 'search_property' }));

    const { processMessage } = await import('../../src/ai/agent.js');
    const result = await processMessage('عندكم شقق؟', client(), []);

    expect(result.should_escalate).toBe(false);
  });
});

describe('AI Agent — property formatting', () => {
  const prop = {
    id: '1', code: 'APT-00001', title: 'Apartment', title_ar: 'شقة فاخرة',
    property_type: 'apartment' as const, purpose: 'sale' as const, status: 'available' as const,
    price: 650000, area_sqm: 180, rooms: 3,
    district_name: 'شمال بريدة', city_name: 'بريدة',
    features: ['مسبح', 'موقف سيارات', 'حديقة'],
    is_featured: false, view_count: 0, inquiry_count: 0, tags: [],
    negotiable: true, currency: 'SAR', amenities: [], nearby_places: [],
    created_at: new Date(), updated_at: new Date(),
  };

  it('renders a standardised heading, location, price and code', async () => {
    const { formatPropertyMessage } = await import('../../src/ai/agent.js');
    const msg = formatPropertyMessage(prop as any, 1);

    expect(msg).toContain('شقة للبيع');
    expect(msg).toContain('APT-00001');
    expect(msg).toContain('650,000');
    expect(msg).toContain('شمال بريدة');
    expect(msg).toContain('3 غرف');
    expect(msg.startsWith('*1)*')).toBe(true);
  });

  it('omits lines for values the listing does not have', async () => {
    const { formatPropertyMessage } = await import('../../src/ai/agent.js');
    const bare = { ...prop, price: undefined, rooms: undefined, features: [], code: undefined };
    const msg = formatPropertyMessage(bare as any, 2);

    expect(msg).not.toContain('السعر');
    expect(msg).not.toContain('الكود');
    expect(msg).not.toContain('undefined');
  });
});
