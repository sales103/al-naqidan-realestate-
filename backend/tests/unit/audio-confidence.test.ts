import { describe, it, expect } from '@jest/globals';

/**
 * A voice note that Whisper genuinely could not make out used to be accepted
 * as-is — whatever garbage text came back was fed straight into the flow,
 * which either misrouted the customer or silently dropped their message.
 *
 * This mirrors the confidence check transcribeAudio applies: Whisper's own
 * per-segment no_speech_prob (returned via response_format: 'verbose_json')
 * is the model's own signal that a segment probably wasn't speech at all —
 * a far more honest check than trusting whatever text comes back, and one
 * that has nothing to do with dialect (Saudi/Egyptian/etc all transcribe
 * through the same multilingual model).
 */
const isConfident = (text: string, segments: { no_speech_prob?: number }[]): boolean => {
  let confident = text.trim().length >= 2;
  if (confident && segments.length > 0) {
    const avg = segments.reduce((sum, s) => sum + (s.no_speech_prob ?? 0), 0) / segments.length;
    if (avg > 0.5) confident = false;
  }
  return confident;
};

describe('audio transcription — confidence check', () => {
  it('trusts clear speech with a low no_speech_prob', () => {
    expect(isConfident('أبي شقة عوائل في بريدة', [{ no_speech_prob: 0.02 }])).toBe(true);
  });

  it('rejects a segment Whisper itself flags as probably not speech', () => {
    expect(isConfident('some noise', [{ no_speech_prob: 0.9 }])).toBe(false);
  });

  it('rejects empty or near-empty output outright', () => {
    expect(isConfident('', [])).toBe(false);
    expect(isConfident(' ', [])).toBe(false);
  });

  it('falls back to the text length alone when no segments come back', () => {
    // Some providers may not return segments even with verbose_json — do not
    // let the absence of that signal reject a perfectly normal transcript.
    expect(isConfident('أبغى فيلا للإيجار', [])).toBe(true);
  });

  it('averages across multiple segments rather than judging on one', () => {
    expect(isConfident('نص طويل بعدة مقاطع', [
      { no_speech_prob: 0.05 }, { no_speech_prob: 0.1 }, { no_speech_prob: 0.08 },
    ])).toBe(true);
  });
});
