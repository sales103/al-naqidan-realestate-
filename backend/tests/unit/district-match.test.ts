import { describe, it, expect } from '@jest/globals';

/**
 * A property added by hand from the dashboard used to have no district
 * selector — only a free-text address — so district_id was often null even
 * when the district was plainly written in the address ("حي الريان"). Filtering
 * on district_id alone meant a customer asking for "الريان" got nothing back
 * from a listing that mentions it right there in the address.
 *
 * search() now matches EITHER the proper district_id link OR the district
 * name inside the address text. This mirrors that OR logic so the matching
 * rule itself is covered without needing a live database.
 */
const matchesDistrict = (
  property: { district_id?: number | null; address?: string | null },
  filter: { district_ids?: number[]; district_text?: string },
): boolean => {
  if (!filter.district_ids?.length && !filter.district_text) return true; // no filter requested
  const idMatch = Boolean(
    filter.district_ids?.length && property.district_id != null && filter.district_ids.includes(property.district_id),
  );
  const textMatch = Boolean(
    filter.district_text && property.address?.includes(filter.district_text),
  );
  return idMatch || textMatch;
};

describe('district search — matches the link OR the address text', () => {
  it('matches a properly linked property even with no address text', () => {
    expect(matchesDistrict(
      { district_id: 12, address: null },
      { district_ids: [12], district_text: 'الريان' },
    )).toBe(true);
  });

  it('matches a manually-added property whose district was only ever typed into the address', () => {
    // district_id is null — this is the exact bug: the dashboard form never
    // captured it, so only the free-text address carries the district name.
    expect(matchesDistrict(
      { district_id: null, address: 'شقة في حي الريان قرب المدرسة' },
      { district_ids: [12], district_text: 'الريان' },
    )).toBe(true);
  });

  it('rejects a property in neither the linked district nor mentioning it', () => {
    expect(matchesDistrict(
      { district_id: 7, address: 'شقة في حي قرطبة' },
      { district_ids: [12], district_text: 'الريان' },
    )).toBe(false);
  });

  it('falls back to address text alone when the district name has no matching row at all', () => {
    // resolveDistrictId found nothing, so district_ids is empty — only the
    // raw text carries the request through.
    expect(matchesDistrict(
      { district_id: null, address: 'استراحة في حي الفايزية' },
      { district_ids: [], district_text: 'الفايزية' },
    )).toBe(true);
  });

  it('does not filter at all when no district was mentioned', () => {
    expect(matchesDistrict({ district_id: null, address: null }, {})).toBe(true);
  });
});
