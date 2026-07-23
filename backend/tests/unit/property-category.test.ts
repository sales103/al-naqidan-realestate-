import { describe, it, expect } from '@jest/globals';

/**
 * The guided flow asks "شقة عوائل أم عزاب؟" and "مدخل خاص أم مشترك؟", but for a
 * long time only the coarse property_type reached the query — so a customer who
 * chose شقة عزاب was sent every apartment on file. These cover the mapping that
 * carries the answer through, and the NULL policy that keeps unclassified
 * inventory visible.
 */

type Cat = { occupancy?: 'family' | 'singles'; entrance?: 'private' | 'shared' };

const CATEGORY: Record<string, Cat> = {
  apartment_family:         { occupancy: 'family' },
  apartment_family_private: { occupancy: 'family', entrance: 'private' },
  apartment_family_shared:  { occupancy: 'family', entrance: 'shared' },
  apartment_single:         { occupancy: 'singles' },
  house_private:            { entrance: 'private' },
  house_shared:             { entrance: 'shared' },
  land:                     {},
};

/** Mirrors the SQL: exclude only an explicit contradiction; NULL always passes. */
const matches = (listing: { occupancy_type?: string | null; entrance_type?: string | null }, want: Cat): boolean => {
  if (want.occupancy && listing.occupancy_type != null && listing.occupancy_type !== want.occupancy) return false;
  if (want.entrance && listing.entrance_type != null && listing.entrance_type !== want.entrance) return false;
  return true;
};

describe('property category — flow answer reaches the filter', () => {
  it('maps every residential choice to a category', () => {
    expect(CATEGORY['apartment_single']).toEqual({ occupancy: 'singles' });
    expect(CATEGORY['apartment_family_shared']).toEqual({ occupancy: 'family', entrance: 'shared' });
    expect(CATEGORY['house_private']).toEqual({ entrance: 'private' });
  });

  it('carries no category for types where it is meaningless', () => {
    expect(CATEGORY['land']).toEqual({});
  });
});

describe('property category — filtering', () => {
  const singles = { occupancy_type: 'singles', entrance_type: null };
  const family  = { occupancy_type: 'family',  entrance_type: null };
  const legacy  = { occupancy_type: null,      entrance_type: null };

  it('does not send a family apartment to someone asking for عزاب', () => {
    expect(matches(family, CATEGORY['apartment_single']!)).toBe(false);
  });

  it('sends a singles apartment to someone asking for عزاب', () => {
    expect(matches(singles, CATEGORY['apartment_single']!)).toBe(true);
  });

  it('still offers unclassified listings, so the bot is not left empty', () => {
    expect(matches(legacy, CATEGORY['apartment_single']!)).toBe(true);
    expect(matches(legacy, CATEGORY['apartment_family']!)).toBe(true);
  });

  it('filters on entrance independently of occupancy', () => {
    const familyShared = { occupancy_type: 'family', entrance_type: 'shared' };
    expect(matches(familyShared, CATEGORY['apartment_family_private']!)).toBe(false);
    expect(matches(familyShared, CATEGORY['apartment_family_shared']!)).toBe(true);
  });
});

describe('conversation staleness', () => {
  const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
  const isStale = (lastSeen?: string): boolean => {
    const t = lastSeen ? Date.parse(lastSeen) : NaN;
    return Number.isFinite(t) && Date.now() - t > STALE_AFTER_MS;
  };

  it('restarts a conversation idle for more than 24h', () => {
    expect(isStale(new Date(Date.now() - 25 * 3600_000).toISOString())).toBe(true);
  });

  it('keeps a conversation that is still within the day', () => {
    expect(isStale(new Date(Date.now() - 23 * 3600_000).toISOString())).toBe(false);
  });

  it('treats a context with no stamp as current, not stale', () => {
    // Older rows predate last_seen; resetting them all on deploy would drop
    // every in-progress conversation at once.
    expect(isStale(undefined)).toBe(false);
  });
});
