import { describe, it, expect } from 'vitest';
import { resolveCatalogueMarkers } from '@aspire-bloods/shared';
import { computeMarkerStatus } from '../src/lib/markerStatus.js';
import {
  valueForStatus,
  canGoBelow,
  canGoMildlyBelow,
  canGoMildlyAbove,
  canGoSignificantlyAbove,
  withinDemoEnvelope,
  syntheticBand,
  CORRELATED_GROUPS,
  OPPOSITE,
  SOFTENED,
  type Band,
  type MarkerRow,
} from '../src/modules/admin/demoSeedData.js';

/**
 * The demo seed never writes a status. It writes a VALUE, and verifyReport
 * derives the status from that value against the band — the same path a real
 * report takes. So "the demo shows all five tints" is only true if the value
 * generator and computeMarkerStatus agree, and these tests are what keep them
 * agreeing. Without this, a change to severity handling would silently turn
 * the demo's significantly-out results into ordinary out-of-range ones and
 * nobody would notice until a screenshot looked wrong.
 */

const ALL_STATUSES = ['IN_RANGE', 'HIGH', 'LOW', 'SIGNIFICANT_HIGH', 'SIGNIFICANT_LOW'] as const;

function marker(over: Partial<MarkerRow> = {}): MarkerRow {
  return {
    id: 'm1',
    key: 'test-marker',
    name: 'Test Marker',
    resultType: 'MEASURED',
    defaultUnit: 'mmol/L',
    severityMultiplier: 1.5,
    severityAbsoluteDelta: null,
    ...over,
  };
}

/** A spread of band shapes the real catalogue actually contains. */
const BANDS: { name: string; band: Band }[] = [
  { name: 'symmetric mid-range', band: { low: 30, high: 400, unit: 'µg/L', fromCatalogue: true } },
  { name: 'zero-floored', band: { low: 0, high: 5, unit: 'mg/L', fromCatalogue: true } },
  { name: 'narrow decimal', band: { low: 1.2, high: 2.3, unit: 'mmol/L', fromCatalogue: true } },
  { name: 'wide integer', band: { low: 135, high: 145, unit: 'mmol/L', fromCatalogue: true } },
  { name: 'small numbers', band: { low: 0.4, high: 4.0, unit: 'mIU/L', fromCatalogue: true } },
];

/** Deterministic sampler, so a failure is reproducible rather than flaky. */
function sampler(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
}

describe('valueForStatus agrees with computeMarkerStatus', () => {
  for (const { name, band } of BANDS) {
    for (const status of ALL_STATUSES) {
      // Below-range statuses are only ever requested for bands that have room
      // below them. Two different tests: a mild LOW only needs a floor above
      // zero, a SIGNIFICANT_LOW needs a full severity threshold of headroom.
      if (status === 'LOW' && !canGoMildlyBelow(band)) continue;
      if (status === 'SIGNIFICANT_LOW' && !canGoBelow(band, marker())) continue;

      it(`produces a genuine ${status} on a ${name} band`, () => {
        const m = marker();
        for (let seed = 1; seed <= 40; seed += 1) {
          const value = valueForStatus(status, band, m, sampler(seed));
          const actual = computeMarkerStatus(value, band.low, band.high, m.severityMultiplier, m.severityAbsoluteDelta);
          expect(actual, `seed ${seed} produced ${value}`).toBe(status);
        }
      });
    }
  }

  it('honours an absolute severity delta where a marker sets one', () => {
    const m = marker({ severityAbsoluteDelta: 2 });
    const band: Band = { low: 10, high: 20, unit: 'x', fromCatalogue: true };
    for (let seed = 1; seed <= 20; seed += 1) {
      const high = valueForStatus('HIGH', band, m, sampler(seed));
      expect(computeMarkerStatus(high, band.low, band.high, m.severityMultiplier, m.severityAbsoluteDelta)).toBe('HIGH');
      const sig = valueForStatus('SIGNIFICANT_HIGH', band, m, sampler(seed));
      expect(computeMarkerStatus(sig, band.low, band.high, m.severityMultiplier, m.severityAbsoluteDelta)).toBe(
        'SIGNIFICANT_HIGH',
      );
    }
  });
});

describe('canGoBelow', () => {
  it('refuses a band that starts at zero — there is nowhere below it to go', () => {
    const zeroFloored: Band = { low: 0, high: 5, unit: 'mg/L', fromCatalogue: true };
    expect(canGoBelow(zeroFloored, marker())).toBe(false);
    expect(canGoMildlyBelow(zeroFloored)).toBe(false);
  });

  it('allows a band with real headroom underneath', () => {
    expect(canGoBelow({ low: 135, high: 145, unit: 'mmol/L', fromCatalogue: true }, marker())).toBe(true);
  });

  it('allows a mild LOW on a band too tight for a significant one', () => {
    // Iron: 10–30, so the severity threshold is 30 and there is nowhere near
    // that much room underneath. It can still be mildly low — 6 µmol/L is an
    // ordinary result — and refusing that is what left the demo showing a
    // floor-level ferritin beside a perfectly normal iron.
    const iron: Band = { low: 10, high: 30, unit: 'µmol/L', fromCatalogue: true };
    expect(canGoBelow(iron, marker())).toBe(false);
    expect(canGoMildlyBelow(iron)).toBe(true);
    for (let seed = 1; seed <= 30; seed += 1) {
      const v = valueForStatus('LOW', iron, marker(), sampler(seed));
      expect(v).toBeGreaterThan(0);
      expect(computeMarkerStatus(v, iron.low, iron.high, 1.5, null)).toBe('LOW');
    }
  });

  /** The guard that stops a below-range value being generated as a negative. */
  it('never lets a permitted below-range value go negative', () => {
    for (const { band } of BANDS) {
      const m = marker();
      if (canGoMildlyBelow(band)) {
        for (let seed = 1; seed <= 30; seed += 1) {
          expect(valueForStatus('LOW', band, m, sampler(seed))).toBeGreaterThan(0);
        }
      }
      if (!canGoBelow(band, m)) continue;
      for (let seed = 1; seed <= 30; seed += 1) {
        expect(valueForStatus('SIGNIFICANT_LOW', band, m, sampler(seed))).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * The coherence layer. Its whole job is to stop the demo showing a low
 * haemoglobin next to a perfectly normal haematocrit — so what has to be
 * guarded is that the groups name real markers, that no marker is claimed by
 * two different physiologies, and that a follower never comes out louder than
 * the anchor that produced it.
 */
describe('correlated marker groups', () => {
  const catalogueKeys = new Set(resolveCatalogueMarkers().map((m) => m.key));

  it('names only markers that exist in the catalogue', () => {
    // A key that doesn't exist is not an error at runtime — it simply never
    // matches, and the group quietly does nothing. Which is exactly the kind
    // of silent no-op a rename would introduce and nobody would see.
    const unknown = CORRELATED_GROUPS.flatMap((g) =>
      Object.keys(g.members).filter((k) => !catalogueKeys.has(k)).map((k) => `${g.key}/${k}`),
    );
    expect(unknown).toEqual([]);
  });

  it('claims each marker for at most one physiology', () => {
    const seen = new Map<string, string>();
    for (const g of CORRELATED_GROUPS) {
      for (const k of Object.keys(g.members)) {
        expect(seen.has(k), `${k} is in both ${seen.get(k)} and ${g.key}`).toBe(false);
        seen.set(k, g.key);
      }
    }
  });

  it('gives every group at least two members and at least one that moves with it', () => {
    for (const g of CORRELATED_GROUPS) {
      const signs = Object.values(g.members);
      expect(signs.length, g.key).toBeGreaterThanOrEqual(2);
      expect(signs.some((s) => s === 1), `${g.key} has no member moving with the group`).toBe(true);
    }
  });

  it('never lets a follower be louder than its anchor', () => {
    // SOFTENED is what stops one scripted extreme from cascading into a report
    // where a dozen markers are all significantly out — which reads as a
    // catastrophe rather than a picture.
    expect(SOFTENED.SIGNIFICANT_HIGH).toBe('HIGH');
    expect(SOFTENED.SIGNIFICANT_LOW).toBe('LOW');
    for (const s of ALL_STATUSES) {
      expect(SOFTENED[SOFTENED[s]]).toBe(SOFTENED[s]);
      expect(OPPOSITE[OPPOSITE[s]]).toBe(s);
    }
  });

  it('keeps in range meaning in range through both transforms', () => {
    expect(SOFTENED.IN_RANGE).toBe('IN_RANGE');
    expect(OPPOSITE.IN_RANGE).toBe('IN_RANGE');
  });
});

describe('syntheticBand', () => {
  it('is deterministic for a given marker key', () => {
    const a = syntheticBand(marker({ key: 'copper' }));
    const b = syntheticBand(marker({ key: 'copper' }));
    expect(a).toEqual(b);
  });

  it('varies across marker keys, so every unranged analyte is not identical', () => {
    const keys = ['copper', 'lipase', 'gastrin', 'ldh', 'cystatin-c', 'ngal', 'aldolase', 'bile-acids'];
    const shapes = new Set(keys.map((k) => JSON.stringify(syntheticBand(marker({ key: k })))));
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('always produces a usable band — positive width, low below high', () => {
    for (const key of ['a', 'bb', 'ccc', 'vitamin-x', 'zzz-9', 'copper']) {
      const band = syntheticBand(marker({ key }));
      expect(band.high).toBeGreaterThan(band.low);
      expect(band.low).toBeGreaterThanOrEqual(0);
    }
  });
});

/**
 * A DEMO IS A CLAIM ABOUT WHAT THE PRODUCT LOOKS LIKE, and a clinician looking
 * at it reads the numbers before they read the layout. The generator derives an
 * out-of-range value from a multiple of the reference range's WIDTH, which is
 * the right model for deriving a status and the wrong one for inventing a
 * value: chloride's 13-wide band gave a severity threshold of 19.5 and so a
 * "significantly below" demo value of 65 mmol/L, which is not an outpatient
 * result. The demo was also showing a neutrophil count of 19.5 against a
 * 2.0–7.5 range.
 *
 * The fix is eligibility, not clamping — a clamped value would compute to a
 * different status than the one it was generated for, which is the exact
 * agreement the tests above exist to protect. These are the real catalogue
 * bands for the analytes that broke.
 */
describe('demo values stay inside the outpatient envelope', () => {
  const REAL: { key: string; band: Band; multiplier?: number }[] = [
    { key: 'chloride', band: { low: 95, high: 108, unit: 'mmol/L', fromCatalogue: true } },
    { key: 'sodium', band: { low: 133, high: 146, unit: 'mmol/L', fromCatalogue: true } },
    { key: 'potassium', band: { low: 3.5, high: 5.3, unit: 'mmol/L', fromCatalogue: true } },
    { key: 'neutrophils', band: { low: 2, high: 7.5, unit: '10^9/L', fromCatalogue: true } },
    { key: 'wbc', band: { low: 4, high: 10, unit: '10^9/L', fromCatalogue: true } },
    { key: 'haemoglobin', band: { low: 130, high: 170, unit: 'g/L', fromCatalogue: true } },
    { key: 'platelets', band: { low: 150, high: 450, unit: '10^9/L', fromCatalogue: true } },
    { key: 'ferritin', band: { low: 30, high: 400, unit: 'µg/L', fromCatalogue: true } },
    { key: 'alt', band: { low: 0, high: 40, unit: 'U/L', fromCatalogue: true } },
  ];

  it('never generates a value a clinician would find absurd', () => {
    for (const { key, band } of REAL) {
      const m = marker({ key });
      for (let seed = 1; seed <= 40; seed += 1) {
        for (const status of ALL_STATUSES) {
          if (status === 'SIGNIFICANT_LOW' && !canGoBelow(band, m)) continue;
          if (status === 'LOW' && !canGoMildlyBelow(band, m)) continue;
          if (status === 'SIGNIFICANT_HIGH' && !canGoSignificantlyAbove(band, m)) continue;
          if (status === 'HIGH' && !canGoMildlyAbove(band, m)) continue;
          const value = valueForStatus(status, band, m, sampler(seed));
          expect(withinDemoEnvelope(m, band, value), `${key} ${status} seed ${seed} = ${value}`).toBe(true);
        }
      }
    }
  });

  it('still computes to the status it was asked for, envelope or not', () => {
    for (const { key, band } of REAL) {
      const m = marker({ key });
      for (let seed = 1; seed <= 40; seed += 1) {
        for (const status of ALL_STATUSES) {
          if (status === 'SIGNIFICANT_LOW' && !canGoBelow(band, m)) continue;
          if (status === 'LOW' && !canGoMildlyBelow(band, m)) continue;
          if (status === 'SIGNIFICANT_HIGH' && !canGoSignificantlyAbove(band, m)) continue;
          if (status === 'HIGH' && !canGoMildlyAbove(band, m)) continue;
          const value = valueForStatus(status, band, m, sampler(seed));
          expect(
            computeMarkerStatus(value, band.low, band.high, m.severityMultiplier, m.severityAbsoluteDelta),
            `${key} ${status} seed ${seed} = ${value}`,
          ).toBe(status);
        }
      }
    }
  });

  it('rules out the exact cases that shipped: chloride 65 and a neutrophil count of 19.5', () => {
    const chloride = { low: 95, high: 108, unit: 'mmol/L', fromCatalogue: true };
    expect(canGoBelow(chloride, marker({ key: 'chloride' }))).toBe(false);
    const neutrophils = { low: 2, high: 7.5, unit: '10^9/L', fromCatalogue: true };
    expect(canGoSignificantlyAbove(neutrophils, marker({ key: 'neutrophils' }))).toBe(false);
  });

  it('leaves an analyte with real headroom eligible, so the demo still shows every state', () => {
    // Ferritin and ALT genuinely reach several times their upper bound in
    // outpatients; a guard that excluded those would have fixed the absurd
    // values by removing the significantly-out state from the demo entirely.
    expect(canGoSignificantlyAbove({ low: 30, high: 400, unit: 'µg/L', fromCatalogue: true }, marker({ key: 'ferritin' }))).toBe(true);
    expect(canGoSignificantlyAbove({ low: 0, high: 40, unit: 'U/L', fromCatalogue: true }, marker({ key: 'alt' }))).toBe(true);
  });
});
