import { describe, it, expect } from '@jest/globals';

/**
 * Guided-flow menus (سكني/تجاري, نوع العقار, المدخل...) resolve a reply
 * against a fixed keyword list first — fast and free. Real phrasing drifts
 * past any fixed list ("استراحة", "شاليه", odd wording), and the customer
 * used to just see "لم أفهم اختيارك" on repeat forever.
 *
 * resolveChoiceSmart falls back to an LLM classifier restricted to the
 * options actually on offer — it can only pick among them or admit none fit,
 * never invent a new one. This mirrors the guard that decides whether that
 * fallback call is even attempted, so the (paid, networked) classifier is
 * never called for cases where it cannot possibly help.
 */

const normalizeAr = (s: string): string =>
  s.replace(/[ً-ْـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئء]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** True when classifyOption is worth calling for this input. */
const shouldClassify = (text: string, pendingCount: number): boolean => {
  const norm = normalizeAr(text);
  if (!norm) return false;
  if (/^\d+$/.test(norm)) return false; // a bare number is not free text
  if (pendingCount === 0) return false; // nothing to classify against
  return true;
};

describe('resolveChoiceSmart — when to fall back to the classifier', () => {
  it('attempts unmatched free-text wording', () => {
    expect(shouldClassify('عندي استراحة للبيع', 2)).toBe(true);
    expect(shouldClassify('شاليه', 4)).toBe(true);
  });

  it('skips empty or whitespace-only text', () => {
    expect(shouldClassify('', 3)).toBe(false);
    expect(shouldClassify('   ', 3)).toBe(false);
  });

  it('skips a bare number — an out-of-range digit is not rescuable', () => {
    expect(shouldClassify('7', 3)).toBe(false);
  });

  it('skips when there is nothing pending to classify against', () => {
    expect(shouldClassify('استراحة', 0)).toBe(false);
  });
});
