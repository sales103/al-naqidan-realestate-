import { describe, it, expect } from '@jest/globals';

/**
 * Evolution tags every message sent from the connected number as
 * fromMe:true — that covers both the bot's own automated replies AND a
 * staff member answering directly from their personal phone instead of the
 * dashboard. Previously fromMe:true messages were dropped outright, so a
 * direct phone reply never disabled the AI: the bot could still answer the
 * customer's next message and step on what staff had just said.
 *
 * The fix distinguishes the two by whether the message id was already
 * recorded (the bot logs its own sends the instant they go out). These
 * mirror that decision and the idempotency guard around disabling AI.
 */

/** True when this fromMe message should trigger a takeover (disable AI). */
const isStaffTakeover = (messageId: string | undefined, knownIds: Set<string>): boolean => {
  if (!messageId) return true; // no id to check against — treat cautiously as external
  return !knownIds.has(messageId);
};

/** Only actually write the disable — never re-disable what's already off. */
const shouldDisableAI = (currentlyEnabled: boolean | undefined): boolean => currentlyEnabled !== false;

describe('staff-phone takeover — telling the bot\'s own echo apart from a human reply', () => {
  it('recognises the bot\'s own send as an echo, not a takeover', () => {
    const knownIds = new Set(['wamid.BOT_SENT_123']);
    expect(isStaffTakeover('wamid.BOT_SENT_123', knownIds)).toBe(false);
  });

  it('treats an unrecognised fromMe message id as a genuine staff reply', () => {
    const knownIds = new Set(['wamid.BOT_SENT_123']);
    expect(isStaffTakeover('wamid.STAFF_PHONE_456', knownIds)).toBe(true);
  });

  it('treats a missing id as a takeover rather than silently dropping it', () => {
    expect(isStaffTakeover(undefined, new Set())).toBe(true);
  });
});

describe('staff-phone takeover — disabling AI is idempotent', () => {
  it('disables when the conversation is currently AI-enabled', () => {
    expect(shouldDisableAI(true)).toBe(true);
  });

  it('disables when enabled state was never set (defaults on)', () => {
    expect(shouldDisableAI(undefined)).toBe(true);
  });

  it('does not re-write a conversation staff already took over', () => {
    expect(shouldDisableAI(false)).toBe(false);
  });
});
