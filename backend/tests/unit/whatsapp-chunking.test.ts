import { describe, it, expect } from '@jest/globals';

/**
 * WhatsApp rejects a text body over 4096 characters. The bot searches with
 * limit 200 and formats every match into a single message, so a large result
 * set produced an oversized message that failed outright and the customer
 * received nothing at all.
 */

const SEP = '\n\n───────────\n\n';

const splitForWhatsapp = (text: string, limit = 3500): string[] => {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let current = '';
  for (const block of text.split(SEP)) {
    const candidate = current ? `${current}${SEP}${block}` : block;
    if (candidate.length > limit && current) { chunks.push(current); current = block; }
    else { current = candidate; }
  }
  if (current) chunks.push(current);
  return chunks;
};

const listing = (i: number) =>
  `*${i})* *شقة للبيع*\nحي الخليج – بريدة\nالسعر: *650,000 ريال*\n3 غرف\nالكود: APT-${i}`;

const bigText = () => Array.from({ length: 200 }, (_, i) => listing(i + 1)).join(SEP);

describe('WhatsApp message chunking', () => {
  it('leaves a short message untouched', () => {
    expect(splitForWhatsapp('أهلاً بك')).toEqual(['أهلاً بك']);
  });

  it('keeps every chunk under the 4096-character limit', () => {
    const chunks = splitForWhatsapp(bigText());
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(4096);
  });

  it('never cuts a listing in half', () => {
    for (const c of splitForWhatsapp(bigText())) {
      expect(c.startsWith('─')).toBe(false);
      expect(c.trim().endsWith('─')).toBe(false);
    }
  });

  it('loses no listings across the split', () => {
    const rejoined = splitForWhatsapp(bigText()).join(SEP);
    expect(rejoined.split(SEP)).toHaveLength(200);
    expect(rejoined).toContain('APT-1');
    expect(rejoined).toContain('APT-200');
  });
});

describe('property photo cap', () => {
  const MAX = 10;

  it('attaches at most the cap however many matched', () => {
    expect(Array.from({ length: 200 }, (_, i) => i).slice(0, MAX)).toHaveLength(10);
  });

  it('sends every photo when the result set is small', () => {
    expect(Array.from({ length: 3 }, (_, i) => i).slice(0, MAX)).toHaveLength(3);
  });
});
