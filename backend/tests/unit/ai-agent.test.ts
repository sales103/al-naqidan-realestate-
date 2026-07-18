import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock OpenAI
jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({
            intent: { primary: 'search_property', confidence: 0.92 },
            extracted_data: { property_type: 'apartment', city: 'بريدة', budget_max: 700000 },
            sentiment: 'positive',
            language: 'ar',
          }) } }],
          usage: { total_tokens: 150 },
        }),
      },
    },
    audio: { transcriptions: { create: jest.fn().mockResolvedValue('أبغى شقة') } },
  })),
}));

jest.mock('../../src/database/redis.js', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheKeys: { conversation: (id: string) => `conv:${id}` },
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('You are a real estate AI assistant.'),
}));

describe('AI Agent - Intent Extraction', () => {
  it('should extract apartment search intent from Arabic text', async () => {
    const { processMessage } = await import('../../src/ai/agent.js');
    const mockClient = {
      id: 'test-id',
      full_name: 'أحمد',
      phone: '+966500000000',
      status: 'new',
      ai_profile: {},
      intent_history: [],
    } as any;

    const result = await processMessage('أبغى شقة شمال بريدة أقل من 700 ألف', mockClient, []);

    expect(result.intent.primary).toBe('search_property');
    expect(result.intent.confidence).toBeGreaterThan(0.8);
    expect(result.extracted_data.property_type).toBe('apartment');
    expect(result.extracted_data.city).toBe('بريدة');
    expect(result.extracted_data.budget_max).toBe(700000);
  });

  it('should detect escalation for human agent requests', async () => {
    const { processMessage } = await import('../../src/ai/agent.js');
    const mockClient = { id: 'test-id', full_name: 'محمد', status: 'negotiating', intent_history: [] } as any;

    jest.spyOn(require('openai').default.prototype.chat.completions, 'create').mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        intent: { primary: 'human_agent_request', confidence: 0.95 },
        extracted_data: {},
        sentiment: 'neutral',
        language: 'ar',
      }) } }],
      usage: { total_tokens: 100 },
    });

    const result = await processMessage('أبغى أتكلم مع موظف', mockClient, []);
    expect(result.should_escalate).toBe(true);
    expect(result.escalation_reason).toContain('موظف');
  });
});

describe('AI Agent - Property Formatting', () => {
  it('should format property message correctly', async () => {
    const { formatPropertyMessage } = await import('../../src/ai/agent.js');
    const prop = {
      id: '1',
      code: 'APT-00001',
      title: 'Apartment',
      title_ar: 'شقة فاخرة',
      property_type: 'apartment' as const,
      purpose: 'sale' as const,
      status: 'available' as const,
      price: 650000,
      area_sqm: 180,
      rooms: 3,
      district_name: 'شمال بريدة',
      city_name: 'بريدة',
      features: ['مسبح', 'موقف سيارات', 'حديقة'],
      is_featured: false,
      view_count: 0,
      inquiry_count: 0,
      tags: [],
      negotiable: true,
      currency: 'SAR',
      amenities: [],
      nearby_places: [],
      created_at: new Date(),
      updated_at: new Date(),
    };

    const msg = formatPropertyMessage(prop, 1);
    expect(msg).toContain('شقة فاخرة');
    expect(msg).toContain('APT-00001');
    expect(msg).toContain('650,000');
    expect(msg).toContain('شمال بريدة');
  });
});
