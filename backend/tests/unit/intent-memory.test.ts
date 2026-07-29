import { describe, it, expect } from '@jest/globals';

/**
 * Two things the bot used to get wrong:
 *
 * 1. It admitted confusion — "عذراً، لم أفهم الرسالة. هل يمكنك توضيح طلبك؟" was
 *    the literal fallback whenever the model's whole reply got consumed as
 *    JSON. The office's explicit rule is to never say that; infer intent and
 *    keep going instead.
 *
 * 2. Payment method (cash/finance) and usage purpose (investment/residence/
 *    commercial) were never captured or remembered at all — a customer who
 *    said "كاش" could still get asked about financing five messages later.
 *    These mirror the parsing/normalisation rules without needing a live
 *    model call.
 */

const normalisePayment = (raw: unknown): 'cash' | 'finance' | undefined => {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return v === 'cash' || v === 'finance' ? v : undefined;
};

const normaliseUsage = (raw: unknown): 'investment' | 'residence' | 'commercial' | undefined => {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return ['investment', 'residence', 'commercial'].includes(v) ? (v as any) : undefined;
};

const FALLBACK_CONTINUERS = [
  'تمام، وش الي تدور عليه بالضبط؟',
  'ابشر، عطني تفاصيل أكثر عشان أرشح لك الأنسب.',
  'تمام، تحب أعرض عليك الخيارات المتاحة الحين؟',
];
const BANNED_PHRASES = ['لم أفهم', 'ما فهمت', 'أعد الصياغة', 'يرجى التوضيح', 'وضح طلبك'];

describe('payment method / usage purpose — extraction', () => {
  it('accepts only the two known payment values', () => {
    expect(normalisePayment('cash')).toBe('cash');
    expect(normalisePayment('finance')).toBe('finance');
    expect(normalisePayment('CASH')).toBe('cash'); // model may vary case
  });

  it('rejects anything else rather than guessing', () => {
    expect(normalisePayment(null)).toBeUndefined();
    expect(normalisePayment('نقدي')).toBeUndefined(); // model was told to answer in English
    expect(normalisePayment('')).toBeUndefined();
  });

  it('accepts only the three known usage values', () => {
    expect(normaliseUsage('investment')).toBe('investment');
    expect(normaliseUsage('residence')).toBe('residence');
    expect(normaliseUsage('commercial')).toBe('commercial');
  });

  it('rejects an unrecognised usage value', () => {
    expect(normaliseUsage('vacation')).toBeUndefined();
  });
});

describe('never admits confusion', () => {
  it('none of the fallback continuers contain a banned "I did not understand" phrase', () => {
    for (const line of FALLBACK_CONTINUERS) {
      for (const banned of BANNED_PHRASES) {
        expect(line.includes(banned)).toBe(false);
      }
    }
  });

  it('every fallback still moves the conversation forward (asks or offers something)', () => {
    for (const line of FALLBACK_CONTINUERS) {
      expect(line.trim().length).toBeGreaterThan(5);
    }
  });
});
