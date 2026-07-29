import { describe, it, expect } from '@jest/globals';

/**
 * The guided flow used to always open with "كيف نقدر نخدمك؟" — a full
 * six-option menu — even when the customer's very first message already
 * said what they wanted ("عايز شقة"). That reads as a form, not a
 * conversation: the bot visibly ignored what was just said.
 *
 * detectFastTrack reads the first message against the same keyword lists
 * the menus already use and returns the deepest level already answered, so
 * the bot skips straight to whatever is genuinely still missing. This
 * mirrors that matching logic (most-specific-first) without needing the
 * full conversation service.
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

type FastTrackMatch =
  | { kind: 'step'; level: 'intent' | 'category' | 'type'; clickedId: string }
  | { kind: 'apartment_occupancy' };

const detectFastTrack = (text: string): FastTrackMatch | null => {
  const norm = normalizeAr(text);
  if (!norm) return null;
  const has = (words: string[]) => words.some((w) => norm.includes(normalizeAr(w)));

  const TYPE_MATCHERS: { id: string; keywords: string[] }[] = [
    { id: 'type_apt_single', keywords: ['عزاب', 'شقه عزاب', 'اعزب', 'مفرد'] },
    { id: 'type_apt_family', keywords: ['شقه عوايل', 'عوايل', 'عائله', 'شقه عائليه'] },
    { id: 'type_house',      keywords: ['بيت', 'دار', 'منزل', 'فيلا', 'قصر'] },
    { id: 'type_land',       keywords: ['ارض', 'اراضي', 'قطعه'] },
    { id: 'com_shop',        keywords: ['محل', 'دكان'] },
  ];
  for (const m of TYPE_MATCHERS) {
    if (has(m.keywords)) return { kind: 'step', level: 'type', clickedId: m.id };
  }

  if (has(['شقة', 'شقه'])) return { kind: 'apartment_occupancy' };

  const CATEGORY_MATCHERS: { id: string; keywords: string[] }[] = [
    { id: 'cat_residential', keywords: ['سكني', 'سكن'] },
    { id: 'cat_commercial',  keywords: ['تجاري'] },
  ];
  for (const m of CATEGORY_MATCHERS) {
    if (has(m.keywords)) return { kind: 'step', level: 'category', clickedId: m.id };
  }

  const INTENT_MATCHERS: { id: string; keywords: string[] }[] = [
    { id: 'intent_rent', keywords: ['ايجار', 'استئجار', 'استاجر', 'مستاجر'] },
    { id: 'intent_buy',  keywords: ['شراء', 'شري', 'اشتري', 'تمليك'] },
  ];
  for (const m of INTENT_MATCHERS) {
    if (has(m.keywords)) return { kind: 'step', level: 'intent', clickedId: m.id };
  }

  return null;
};

describe('fast-track — the exact case from the office: "عايز شقة"', () => {
  it('asks only عوائل/عزاب, not the full intent+category menus', () => {
    expect(detectFastTrack('السلام عليكم عايز شقة')).toEqual({ kind: 'apartment_occupancy' });
  });

  it('a fully specific type skips straight past everything, including occupancy', () => {
    expect(detectFastTrack('شقة عزاب للايجار')).toEqual({ kind: 'step', level: 'type', clickedId: 'type_apt_single' });
  });
});

describe('fast-track — resolves the deepest level the message already answers', () => {
  it('a named property type skips both the intent and category menus', () => {
    expect(detectFastTrack('ابغى فيلا')).toEqual({ kind: 'step', level: 'type', clickedId: 'type_house' });
    expect(detectFastTrack('عندي ارض ابيها')).toEqual({ kind: 'step', level: 'type', clickedId: 'type_land' });
  });

  it('a category alone (no specific type) skips only the intent menu', () => {
    expect(detectFastTrack('ابي عقار تجاري')).toEqual({ kind: 'step', level: 'category', clickedId: 'cat_commercial' });
  });

  it('a purpose alone (no type) skips only the intent menu, category still asked', () => {
    expect(detectFastTrack('ابي استاجر')).toEqual({ kind: 'step', level: 'intent', clickedId: 'intent_rent' });
  });

  it('a plain greeting with nothing else falls through to the full menu', () => {
    expect(detectFastTrack('السلام عليكم')).toBeNull();
    expect(detectFastTrack('')).toBeNull();
  });
});
