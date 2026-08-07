import { describe, it, expect } from 'vitest';
import {
  OPTIMAL_RANGES,
  resolveOptimalRange,
  isWithinOptimal,
  formatOptimalRange,
  optimalRangeCoverage,
} from '@aspire-bloods/shared';

describe('the optimal range table itself', () => {
  it('has exactly one entry set per marker key, with no accidental duplicates of a cohort', () => {
    const seen = new Set<string>();
    for (const e of OPTIMAL_RANGES) {
      const key = `${e.markerKey}|${e.sex}|${e.ageMin}|${e.ageMax}`;
      expect(seen.has(key), `duplicate entry for ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('names a source for every established band, and only for those', () => {
    for (const e of OPTIMAL_RANGES) {
      if (e.confidence === 'established') {
        expect(e.source.length, `${e.markerKey} is established with no source`).toBeGreaterThan(20);
        expect(e.low != null || e.high != null, `${e.markerKey} is established with no bounds`).toBe(true);
      } else {
        expect(e.low).toBeNull();
        expect(e.high).toBeNull();
      }
    }
  });

  it('leaves an honest gap rather than an estimate wherever there is no established optimal', () => {
    const gaps = OPTIMAL_RANGES.filter((e) => e.confidence === 'no established optimal');
    expect(gaps.length).toBeGreaterThan(0);
    // Every gap says WHY, so nobody reads it as a marker that was simply missed.
    for (const g of gaps) expect(g.note?.length ?? 0).toBeGreaterThan(20);
  });

  it('orders every established band low before high', () => {
    for (const e of OPTIMAL_RANGES) {
      if (e.low != null && e.high != null) expect(e.low).toBeLessThan(e.high);
    }
  });
});

describe('resolveOptimalRange', () => {
  it('resolves a sex-neutral established band', () => {
    const r = resolveOptimalRange('total-cholesterol', 'mmol/L', 'MALE', 40);
    expect(r).toMatchObject({ status: 'established', high: 5.0, low: null });
  });

  it('resolves the cohort-specific band for a sex-specific marker', () => {
    expect(resolveOptimalRange('hdl', 'mmol/L', 'MALE', 40)).toMatchObject({ status: 'established', low: 1.0 });
    expect(resolveOptimalRange('hdl', 'mmol/L', 'FEMALE', 40)).toMatchObject({ status: 'established', low: 1.2 });
  });

  it('refuses to hand back a sex-specific band when the sex is unknown', () => {
    // Falling through to a neutral entry here would give one cohort's band to
    // someone in the other, which is the whole reason this branch exists.
    expect(resolveOptimalRange('hdl', 'mmol/L', null, 40)).toEqual({ status: 'none' });
    expect(resolveOptimalRange('alt', 'U/L', null, 40)).toEqual({ status: 'none' });
  });

  it('returns none for a marker with no established optimal', () => {
    expect(resolveOptimalRange('ferritin', 'µg/L', 'FEMALE', 35)).toEqual({ status: 'none' });
    expect(resolveOptimalRange('tsh', 'mIU/L', 'MALE', 35)).toEqual({ status: 'none' });
  });

  it('returns none for a marker that is not in the table at all', () => {
    expect(resolveOptimalRange('not-a-marker', 'mmol/L', 'MALE', 35)).toEqual({ status: 'none' });
  });

  it('refuses a band whose units disagree with the displayed units', () => {
    // A band in mmol/L printed beside a value in mg/dL is a wrong band, not an
    // approximate one.
    expect(resolveOptimalRange('total-cholesterol', 'mg/dL', 'MALE', 40)).toEqual({ status: 'none' });
  });
});

describe('isWithinOptimal', () => {
  it('handles two-sided, one-sided and unknowable cases', () => {
    expect(isWithinOptimal(60, 50, 125)).toBe(true);
    expect(isWithinOptimal(40, 50, 125)).toBe(false);
    expect(isWithinOptimal(4.2, null, 5.0)).toBe(true);
    expect(isWithinOptimal(5.9, null, 5.0)).toBe(false);
    expect(isWithinOptimal(1.4, 1.2, null)).toBe(true);
    // A textual result has no position on a band.
    expect(isWithinOptimal(null, 1.2, null)).toBeNull();
  });
});

describe('formatOptimalRange', () => {
  it('phrases each shape once, so no two screens word it differently', () => {
    expect(formatOptimalRange(50, 125, 'nmol/L')).toBe('50–125 nmol/L');
    expect(formatOptimalRange(null, 5, 'mmol/L')).toBe('below 5 mmol/L');
    expect(formatOptimalRange(1.2, null, 'mmol/L')).toBe('1.2 mmol/L or above');
    expect(formatOptimalRange(null, null, 'mmol/L')).toBe('');
  });
});

describe('coverage', () => {
  it('reports how much of the table is real and how much is an honest gap', () => {
    const c = optimalRangeCoverage();
    expect(c.markerCount).toBe(c.establishedMarkerCount + c.noEstablishedOptimalMarkerCount);
    expect(c.establishedMarkerCount).toBeGreaterThan(0);
    // The gaps outnumber the bands, which is the honest state of the evidence
    // rather than a shortfall in the table.
    expect(c.noEstablishedOptimalMarkerCount).toBeGreaterThan(c.establishedMarkerCount);
  });
});
