import { describe, expect, it } from 'vitest';
import { resolveCatalogueMarkers } from '@aspire-bloods/shared';
import { PHYSICAL_MEASUREMENT_KEYS } from '../src/lib/personalMeasurements.js';
import { deriveStatus, statusForStorage, type ClassifiedValue } from '../src/lib/deriveResultStatus.js';
import { syntheticBand } from '../src/modules/admin/demoSeedData.js';
import {
  AGE_BANDED_RANGES,
  AWAITING_AGE_BAND,
  ageBandedRangeSource,
} from '../prisma/ageBandedReferenceRanges.js';

/**
 * ===========================================================================
 *  MARKERS WITH NO REFERENCE RANGE, AND THE TWO WAYS ONE GETS INVENTED.
 * ===========================================================================
 *
 * Both failures this file pins were real and both were silent — a
 * correctly-formatted number in the right column, in the right shade, saying
 * something false about a patient:
 *
 *  · A synthetic band for a physical measurement. Waist circumference against
 *    13–38 cm; weight against 2.5–7.5 kg with a 17.3 kg result reported as
 *    significantly above range.
 *  · A status computed against a zero-width band. Once the range was correctly
 *    recorded as absent (0–0), `computeMarkerStatus` built a severity threshold
 *    from a band of no width and returned SIGNIFICANT_HIGH for every positive
 *    number — so every weight, pulse and blood pressure arrived on a patient's
 *    screen in a red wash.
 *
 * And the third thing: an age band invented from memory, which is the one that
 * has not happened and must not.
 */

const SEVERITY = { severityMultiplier: 1.5, severityAbsoluteDelta: null };
const numeric = (value: number): ClassifiedValue => ({ kind: 'numeric', value });

describe('physical measurements have no reference range and are never given one', () => {
  it('names every measurement the clinic records, and oxygen saturation', () => {
    // The list is closed and it is checked against the catalogue rather than
    // against itself: a key that no marker answers to is a guard pointing at
    // nothing, which is the shape a rename leaves behind.
    const catalogue = new Set(resolveCatalogueMarkers().map((m) => m.key));
    for (const key of PHYSICAL_MEASUREMENT_KEYS) {
      expect(catalogue.has(key), `"${key}" is on the no-range list and is in no catalogue`).toBe(true);
    }
    for (const key of [
      'height',
      'weight',
      'waist-circumference',
      'hip-circumference',
      'waist-hip-ratio',
      'pulse',
      'systolic-blood-pressure',
      'diastolic-blood-pressure',
      'oxygen-saturation',
    ]) {
      expect(PHYSICAL_MEASUREMENT_KEYS.has(key), `${key} must never be given a reference range`).toBe(true);
    }
  });

  it('refuses to invent a band for one, loudly', () => {
    // A THROW rather than a benign return, because reaching syntheticBand means
    // a caller has already decided to draw a range bar and a traffic light for
    // somebody's weight, and returning something harmless would let that
    // decision stand.
    for (const key of PHYSICAL_MEASUREMENT_KEYS) {
      expect(() =>
        syntheticBand({
          id: key,
          key,
          name: key,
          resultType: 'MEASURED',
          defaultUnit: 'cm',
          severityMultiplier: 1.5,
          severityAbsoluteDelta: null,
        }),
      ).toThrow(/physical measurement/i);
    }
  });

  it('still invents one for an ordinary analyte, so the guard is not just off', () => {
    const band = syntheticBand({
      id: 'ferritin',
      key: 'ferritin',
      name: 'Ferritin',
      resultType: 'MEASURED',
      defaultUnit: 'µg/L',
      severityMultiplier: 1.5,
      severityAbsoluteDelta: null,
    });
    expect(band.high).toBeGreaterThan(band.low);
  });
});

describe('a range with no width is not a range', () => {
  it('gives a numeric result no status against a 0–0 band', () => {
    // The exact shape a physical measurement is stored in.
    const derived = deriveStatus(numeric(128), 0, 0, SEVERITY);
    expect(derived.status).toBe('unevaluable');
    expect(statusForStorage(derived)).toBeNull();
  });

  it('gives no status against any degenerate band, not only 0–0', () => {
    for (const [low, high] of [
      [0, 0],
      [5, 5],
      [10, 4],
      [-1, -1],
    ] as const) {
      expect(statusForStorage(deriveStatus(numeric(7), low, high, SEVERITY))).toBeNull();
    }
  });

  it('refuses a comparator against one too', () => {
    // Placed before the value is classified, so it applies to every kind: a
    // "< 5.0" against nothing is no more placeable than a plain number.
    const derived = deriveStatus({ kind: 'comparator', operator: '<', bound: 5, text: '< 5.0' }, 0, 0, SEVERITY);
    expect(derived.status).toBe('unevaluable');
  });

  it('still derives a status against a real band, so the guard is not just off', () => {
    expect(statusForStorage(deriveStatus(numeric(7), 3, 5, SEVERITY))).toBe('HIGH');
    expect(statusForStorage(deriveStatus(numeric(4), 3, 5, SEVERITY))).toBe('IN_RANGE');
  });
});

describe('age-banded reference ranges', () => {
  it('loads nothing that is not sourced', () => {
    // The list is EMPTY today and this is not a test of that. It is a test that
    // anything ever added carries a citation with a real URL — the rule being
    // pinned is "a range comes from a named document", and the failure it
    // prevents is a plausible band typed in from memory, which is more specific
    // than the blanket one and therefore WINS in the resolver.
    for (const range of AGE_BANDED_RANGES) {
      expect(range.citation.document, `${range.markerKey} has no source document`).toBeTruthy();
      expect(range.citation.publisher, `${range.markerKey} has no publisher`).toBeTruthy();
      expect(range.citation.url, `${range.markerKey} has no source URL`).toMatch(/^https?:\/\//);
      expect(range.stored.high, `${range.markerKey} is not a two-sided band`).toBeGreaterThan(range.stored.low);
      // Both forms, and the arithmetic between them asserted separately — a
      // wrong conversion factor produces a correctly formatted number in the
      // right column that is out by a factor of a thousand.
      if (range.conversion) {
        expect(range.printed.low * range.conversion.factor).toBeCloseTo(range.stored.low, 6);
        expect(range.printed.high * range.conversion.factor).toBeCloseTo(range.stored.high, 6);
      } else {
        expect(range.printed.unit).toBe(range.stored.unit);
      }
      expect(ageBandedRangeSource(range)).toContain(range.citation.publisher);
    }
  });

  it('flags every age-dependent analyte against a marker that exists', () => {
    const catalogue = new Set(resolveCatalogueMarkers().map((m) => m.key));
    expect(AWAITING_AGE_BAND.length).toBe(14);
    for (const entry of AWAITING_AGE_BAND) {
      expect(catalogue.has(entry.markerKey), `"${entry.markerKey}" is flagged and is in no catalogue`).toBe(true);
      // The reason is positional — what the age dependence IS — and must never
      // become an interval. A number in here would be a range with no source.
      expect(entry.why.length).toBeGreaterThan(40);
    }
    expect(new Set(AWAITING_AGE_BAND.map((a) => a.markerKey)).size).toBe(AWAITING_AGE_BAND.length);
  });

  it('names the four an adult-wide band serves worst', () => {
    const unusable = AWAITING_AGE_BAND.filter((a) => a.severity === 'UNUSABLE').map((a) => a.markerKey).sort();
    expect(unusable).toEqual(['alp', 'dhea-s', 'igf-1', 'total-psa']);
  });
});
