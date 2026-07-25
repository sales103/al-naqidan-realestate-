import { describe, it, expect } from '@jest/globals';

/**
 * A customer who had just been sent listings asked "الموقع" and was answered
 * "لم أجد حالياً عقاراً مطابقاً لطلبك" — the request never reached the details
 * handler at all. Two reasons: location words were not recognised as a details
 * request, and detail words only counted when a number came with them, so a
 * bare "تفاصيل" fell through to the search as well.
 *
 * These mirror the intercept that routes a message to handleDetails, and the
 * rule handleDetails uses to decide which listing was meant.
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

const CODE_PATTERN = /\b[A-Za-z]{2,8}-[A-Za-z0-9]*\d[A-Za-z0-9]*(?:-\d+)?\b/;
const DETAIL_WORDS = ['تفاصيل', 'تفصيل', 'معلومات عن', 'الكود'];
const LOCATION_WORDS = ['موقع', 'عنوان', 'خريطه', 'لوكيشن', 'location'];
const OFFICE_WORDS = ['مكتبكم', 'مكتبك', 'شركتكم', 'فرعكم', 'مقركم'];

/** True when the message should be handled as a property-details request. */
const wantsDetails = (text: string, shownCount: number): boolean => {
  const norm = normalizeAr(text);
  const has = (words: string[]) => words.some((w) => norm.includes(normalizeAr(w)));
  if (CODE_PATTERN.test(text)) return true;
  return (has(DETAIL_WORDS) || (has(LOCATION_WORDS) && !has(OFFICE_WORDS))) && shownCount > 0;
};

/** Which listing handleDetails settles on; null means it has to ask. */
const resolveIndex = (text: string, shownCount: number): number | null => {
  const numMatch = normalizeAr(text).match(/\d+/);
  const idx = numMatch ? parseInt(numMatch[0], 10) : NaN;
  if (shownCount && idx >= 1 && idx <= shownCount) return idx;
  if (shownCount === 1) return 1;
  return null;
};

describe('details request — routing', () => {
  it('treats a bare location word as a details request', () => {
    expect(wantsDetails('الموقع', 3)).toBe(true);
    expect(wantsDetails('وين موقعها؟', 3)).toBe(true);
    expect(wantsDetails('ابغى العنوان', 3)).toBe(true);
  });

  it('no longer demands a number alongside the detail word', () => {
    expect(wantsDetails('تفاصيل الشقة', 3)).toBe(true);
    expect(wantsDetails('ابغى تفاصيل', 1)).toBe(true);
  });

  it('still recognises a bare property code with nothing shown yet', () => {
    expect(wantsDetails('AQ-482913', 0)).toBe(true);
  });

  it('leaves the office address to the normal flow', () => {
    // "where is your office" is not a question about a listing.
    expect(wantsDetails('وين مكتبكم؟', 3)).toBe(false);
    expect(wantsDetails('عنوان فرعكم', 3)).toBe(false);
  });

  it('does not hijack a search when no listing has been sent', () => {
    // Nothing to describe yet, so the search must still run.
    expect(wantsDetails('الموقع', 0)).toBe(false);
  });
});

describe('details request — which listing', () => {
  it('uses the number when one is given', () => {
    expect(resolveIndex('تفاصيل 2', 3)).toBe(2);
  });

  it('assumes the only listing when just one was sent', () => {
    expect(resolveIndex('الموقع', 1)).toBe(1);
  });

  it('asks which one when the batch is genuinely ambiguous', () => {
    expect(resolveIndex('الموقع', 4)).toBeNull();
  });

  it('ignores a number outside the batch rather than guessing', () => {
    expect(resolveIndex('تفاصيل 9', 3)).toBeNull();
  });
});
