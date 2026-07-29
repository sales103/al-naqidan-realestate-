import { describe, it, expect } from '@jest/globals';

/**
 * Budget, room count, and district are re-extracted from every single
 * message by the model — if a customer said "3 غرف بميزانية 500 ألف" once
 * and three messages later just said "وريني غيرها" without repeating
 * either, relying on the model to silently keep applying both from memory
 * alone is unreliable. enrichSearchParams now falls back to what's already
 * saved on the client profile (persisted the moment each was first
 * mentioned) whenever the current message's extraction is silent on it —
 * this mirrors that fallback logic.
 */

type Extracted = { price_max?: number; rooms?: number };
type ClientProfile = { budget_max?: number; rooms_needed?: number };

const applyMemoryFallback = (extracted: Extracted, client: ClientProfile): Extracted => {
  const enriched = { ...extracted };
  if (enriched.price_max === undefined && client.budget_max) enriched.price_max = client.budget_max;
  if (enriched.rooms === undefined && client.rooms_needed) enriched.rooms = client.rooms_needed;
  return enriched;
};

describe('search params — falls back to saved profile when this message is silent', () => {
  it('uses the saved budget when this message did not mention a price', () => {
    const result = applyMemoryFallback({ rooms: 3 }, { budget_max: 500_000 });
    expect(result.price_max).toBe(500_000);
  });

  it('uses the saved room count when this message did not mention it', () => {
    const result = applyMemoryFallback({ price_max: 500_000 }, { rooms_needed: 3 });
    expect(result.rooms).toBe(3);
  });

  it('prefers what THIS message says over the saved value — a correction wins', () => {
    // Customer says "خلها 4 غرف" — the fresh mention must not be overridden
    // by the older saved value.
    const result = applyMemoryFallback({ rooms: 4 }, { rooms_needed: 3 });
    expect(result.rooms).toBe(4);
  });

  it('leaves both unset when neither this message nor the profile has them', () => {
    const result = applyMemoryFallback({}, {});
    expect(result.price_max).toBeUndefined();
    expect(result.rooms).toBeUndefined();
  });
});
