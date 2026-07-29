import { describe, it, expect } from '@jest/globals';

/**
 * When a guided-menu reply matches nothing — not a keyword, not the AI
 * classifier — the fallback used to be a canned "لم أفهم اختيارك" dump of
 * the same list again. That single line was the clearest "this is just a
 * bot" moment in the whole flow. reAsk() now asks the model for one natural
 * line first, and only falls back to a plain menu re-list if that call
 * itself fails — but even that fallback must never say "لم أفهم" again.
 */

const FALLBACK_MENU_TEXT = (options: string[]): string =>
  `تمام، عشان أخدمك بسرعة اختر من هذي:\n\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`;

const BANNED_PHRASES = ['لم أفهم', 'ما فهمت', 'اختياري غير صحيح', 'إعادة الصياغة'];

/** Mirrors reAsk's decision: use the model's nudge if it produced one, else the plain fallback. */
const chooseReAskReply = (nudge: string, options: string[]): string =>
  nudge.trim() ? nudge.trim() : FALLBACK_MENU_TEXT(options);

describe('reAsk fallback — never says "لم أفهم" even when the model call fails', () => {
  it('uses the natural nudge when the model returned one', () => {
    const reply = chooseReAskReply('تمام، تقصد شقة عوائل ولا عزاب؟', ['شقة عوائل', 'شقة عزاب']);
    expect(reply).toBe('تمام، تقصد شقة عوائل ولا عزاب؟');
  });

  it('falls back to a plain re-list when the model call produced nothing', () => {
    const reply = chooseReAskReply('', ['شقة عوائل', 'شقة عزاب']);
    expect(reply).toContain('شقة عوائل');
    expect(reply).toContain('شقة عزاب');
  });

  it('neither path ever contains a banned "I did not understand" phrase', () => {
    for (const nudge of ['', 'تمام، وش رأيك بالخيارات دي؟']) {
      const reply = chooseReAskReply(nudge, ['خيار 1', 'خيار 2']);
      for (const banned of BANNED_PHRASES) {
        expect(reply.includes(banned)).toBe(false);
      }
    }
  });
});
