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
