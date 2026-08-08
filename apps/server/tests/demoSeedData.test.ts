import { describe, it, expect } from 'vitest';
import { computeMarkerStatus } from '../src/lib/markerStatus.js';
import { valueForStatus, canGoBelow, syntheticBand, type Band, type MarkerRow } from '../src/modules/admin/demoSeedData.js';

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
      const belowRange = status === 'LOW' || status === 'SIGNIFICANT_LOW';
      // Below-range statuses are only ever requested for bands that have room
      // below them — the generator enforces this with canGoBelow.
      if (belowRange && !canGoBelow(band, marker())) continue;

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
    expect(canGoBelow({ low: 0, high: 5, unit: 'mg/L', fromCatalogue: true }, marker())).toBe(false);
  });

  it('allows a band with real headroom underneath', () => {
    expect(canGoBelow({ low: 135, high: 145, unit: 'mmol/L', fromCatalogue: true }, marker())).toBe(true);
  });

  /** The guard that stops a below-range value being generated as a negative. */
  it('never lets a permitted below-range value go negative', () => {
    for (const { band } of BANDS) {
      const m = marker();
      if (!canGoBelow(band, m)) continue;
      for (let seed = 1; seed <= 30; seed += 1) {
        expect(valueForStatus('SIGNIFICANT_LOW', band, m, sampler(seed))).toBeGreaterThan(0);
      }
    }
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
