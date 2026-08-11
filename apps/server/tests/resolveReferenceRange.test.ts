import { describe, it, expect } from 'vitest';
import { resolveReferenceRange, ageFromDob, type CatalogRange } from '../src/lib/resolveReferenceRange.js';

function range(partial: Partial<CatalogRange> & { id: string }): CatalogRange {
  return {
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    unit: 'ug/L',
    low: 30,
    high: 300,
    ...partial,
  };
}

// Ferritin is the example the requirement is written around: the male and
// female ranges genuinely differ, and reading a woman's result against the
// male range is the specific mistake these tests exist to prevent.
const FERRITIN: CatalogRange[] = [
  range({ id: 'any', sex: 'ANY', low: 20, high: 300 }),
  range({ id: 'male', sex: 'MALE', low: 30, high: 400 }),
  range({ id: 'female', sex: 'FEMALE', low: 15, high: 200 }),
];

describe('resolveReferenceRange', () => {
  it('picks the sex-specific range over the blanket one', () => {
    const result = resolveReferenceRange(FERRITIN, 'FEMALE', 34);
    expect(result).toEqual({ status: 'resolved', range: expect.objectContaining({ id: 'female' }) });
  });

  it('prefers a sex+age bracket over a sex-only range', () => {
    const withBracket = [...FERRITIN, range({ id: 'male-18-39', sex: 'MALE', ageMin: 18, ageMax: 39 })];
    const result = resolveReferenceRange(withBracket, 'MALE', 30);
    expect(result).toEqual({ status: 'resolved', range: expect.objectContaining({ id: 'male-18-39' }) });
  });

  // The whole point. Before this, an unknown sex quietly fell through to the
  // ANY range and the caller could not tell that had happened — a resolved
  // range that was resolved against the wrong thing.
  it('refuses to guess when sex is unknown and the marker distinguishes by sex', () => {
    expect(resolveReferenceRange(FERRITIN, null, 34)).toEqual({
      status: 'unavailable',
      reason: 'SEX_NOT_RECORDED',
    });
  });

  it('still resolves for an unknown sex when no range depends on sex', () => {
    const sexNeutral = [range({ id: 'any', sex: 'ANY' })];
    expect(resolveReferenceRange(sexNeutral, null, 34)).toEqual({
      status: 'resolved',
      range: expect.objectContaining({ id: 'any' }),
    });
  });

  // A sex-specific range that can't apply to this patient's age shouldn't
  // trigger the "we need your sex" answer — there is nothing sex would
  // unlock here, so the honest reason is that nothing covers them at all.
  it('reports no matching range rather than missing sex when the age excludes every sex-specific range', () => {
    const paediatricOnly = [
      range({ id: 'any-adult', sex: 'ANY', ageMin: 18 }),
      range({ id: 'male-child', sex: 'MALE', ageMin: 0, ageMax: 12 }),
    ];
    expect(resolveReferenceRange(paediatricOnly, null, 40)).toEqual({
      status: 'resolved',
      range: expect.objectContaining({ id: 'any-adult' }),
    });
    expect(resolveReferenceRange([range({ id: 'child', sex: 'ANY', ageMax: 12 })], null, 40)).toEqual({
      status: 'unavailable',
      reason: 'NO_MATCHING_RANGE',
    });
  });

  /**
   * THE TIE-BREAK, which used to be whatever order Postgres returned.
   *
   * `ReferenceRange` holds the catalogue AND one row per result ever
   * materialised, so a marker accumulates dozens of rows with the same sex and
   * no age bracket — the development database has one marker with 76. Among
   * those the winner was arbitrary, which means the range suggested at verify
   * time was effectively arbitrary among every range that marker had ever
   * carried.
   */
  describe('when two rows are equally specific', () => {
    it('prefers the one with a source behind it', () => {
      const rows = [
        range({ id: 'unsourced', sex: 'FEMALE', low: 60, high: 110, provenance: 'UNSOURCED' }),
        range({ id: 'published', sex: 'FEMALE', low: 50, high: 98, provenance: 'PUBLISHED' }),
        range({ id: 'randox', sex: 'FEMALE', low: 53, high: 97, provenance: 'RANDOX' }),
      ];
      expect(resolveReferenceRange(rows, 'FEMALE', 40)).toEqual({
        status: 'resolved',
        range: expect.objectContaining({ id: 'randox' }),
      });
      expect(resolveReferenceRange(rows.slice(0, 2), 'FEMALE', 40)).toEqual({
        status: 'resolved',
        range: expect.objectContaining({ id: 'published' }),
      });
    });

    it('treats a row with no provenance as unsourced rather than as best', () => {
      const rows = [
        range({ id: 'bare', sex: 'FEMALE' }),
        range({ id: 'published', sex: 'FEMALE', provenance: 'PUBLISHED' }),
      ];
      expect(resolveReferenceRange(rows, 'FEMALE', 40)).toEqual({
        status: 'resolved',
        range: expect.objectContaining({ id: 'published' }),
      });
    });

    it('never lets provenance beat specificity, because the wrong sex is the bigger error', () => {
      // A Randox range for everybody against an unsourced one for THIS
      // patient's sex. Specificity wins: a citation does not make a band that
      // describes the other half of the population apply to them.
      const rows = [
        range({ id: 'randox-any', sex: 'ANY', provenance: 'RANDOX' }),
        range({ id: 'unsourced-female', sex: 'FEMALE', provenance: 'UNSOURCED' }),
      ];
      expect(resolveReferenceRange(rows, 'FEMALE', 40)).toEqual({
        status: 'resolved',
        range: expect.objectContaining({ id: 'unsourced-female' }),
      });
    });
  });

  it('reports no matching range for an empty catalogue', () => {
    expect(resolveReferenceRange([], 'MALE', 40)).toEqual({ status: 'unavailable', reason: 'NO_MATCHING_RANGE' });
  });

  it('treats an unknown age as failing any bracketed range', () => {
    expect(resolveReferenceRange([range({ id: 'bracketed', ageMin: 18, ageMax: 65 })], 'MALE', null)).toEqual({
      status: 'unavailable',
      reason: 'NO_MATCHING_RANGE',
    });
  });
});

describe('ageFromDob', () => {
  it('counts whole years, not calendar-year differences', () => {
    // Birthday not yet reached this year.
    expect(ageFromDob('1990-12-31', new Date('2026-08-06T00:00:00Z'))).toBe(35);
    // Birthday already passed.
    expect(ageFromDob('1990-01-01', new Date('2026-08-06T00:00:00Z'))).toBe(36);
    // Birthday today.
    expect(ageFromDob('1990-08-06', new Date('2026-08-06T00:00:00Z'))).toBe(36);
  });

  it('returns null for an unparseable date rather than NaN', () => {
    expect(ageFromDob('not-a-date')).toBeNull();
  });
});
