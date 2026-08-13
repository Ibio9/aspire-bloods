import { describe, it, expect } from 'vitest';
import {
  formatReferenceRange,
  periodStepBoundaries,
  referenceRangePeriods,
  severityThresholdFor,
  type PeriodPoint,
} from '@aspire-bloods/shared';

/**
 * ===========================================================================
 *  THE STEPPED TREND, FROM FIXTURES.
 * ===========================================================================
 *
 * A marker's reference range can change between two results — a laboratory
 * revalidates an assay, a patient crosses an age band, a functional band
 * replaces an assay one. When it does, the trend chart has to SAY SO: one band
 * set per period, a dashed rule at the change, both periods' bounds labelled,
 * and a sentence naming the two ranges and their dates. A silent change of
 * reference range is exactly what makes somebody misread their own trend.
 *
 * WHY THIS FILE EXISTS (Aug 2026). Until now the only coverage of a stepped
 * chart was e2e/chart-bands.spec.ts, measuring rectangles in a real browser
 * against whatever the DEMO SEED happened to contain — and the demo now
 * deliberately contains no step at all: one reference range per marker, for the
 * whole of a patient's history, resolved once by `resolveBand`. That is the
 * right demo (a step drawn over a change that never happened is noise, and
 * three markers were doing it) and it would have taken the coverage with it,
 * leaving the step machinery in the product with nothing testing it until the
 * day a laboratory really does move a range.
 *
 * So the cases are written down here instead. Fixtures do not go quiet when the
 * data changes.
 *
 * The derivation under test is `referenceRangePeriods` + `periodStepBoundaries`
 * in packages/shared — the same functions TrendChart draws its bands, its step
 * rules, its per-period bound labels and its range-change sentence from, so
 * these four cannot disagree with each other about whether or where a range
 * moved.
 */

const DAY = 86_400_000;
/** A fixed epoch, so nothing here depends on when the suite runs. */
const T0 = Date.UTC(2025, 0, 15);

function point(days: number, low: number, high: number, extra: Partial<PeriodPoint> = {}): PeriodPoint {
  return { t: T0 + days * DAY, referenceLow: low, referenceHigh: high, ...extra };
}

describe('one range across the series is ONE period and no step', () => {
  it('groups every row into a single period', () => {
    const periods = referenceRangePeriods([
      point(0, 20, 42),
      point(180, 20, 42),
      point(365, 20, 42),
      point(540, 20, 42),
    ]);
    expect(periods).toHaveLength(1);
    expect(periods[0].rows).toHaveLength(4);
    expect(periods[0].low).toBe(20);
    expect(periods[0].high).toBe(42);
  });

  /**
   * The one that matters for the demo: no boundaries means no dashed rule, no
   * second label column and no sentence. A chart drawn from this is one band
   * set spanning the whole plot — which is what "no step" should look like, and
   * what the demo patient's every trend now looks like.
   */
  it('produces no step boundaries at all', () => {
    const periods = referenceRangePeriods([point(0, 20, 42), point(180, 20, 42), point(365, 20, 42)]);
    expect(periodStepBoundaries(periods)).toEqual([]);
  });

  it('holds a single result as one period with no step', () => {
    const periods = referenceRangePeriods([point(0, 30, 400)]);
    expect(periods).toHaveLength(1);
    expect(periodStepBoundaries(periods)).toEqual([]);
  });

  it('holds an empty series without inventing a period', () => {
    expect(referenceRangePeriods([])).toEqual([]);
    expect(periodStepBoundaries([])).toEqual([]);
  });
});

describe('a genuine change of range steps, midway between the two samples', () => {
  /**
   * The case the step exists for, written out: an assay range on the first two
   * draws and a narrower functional band on the third.
   */
  const rows = [point(0, 2, 25), point(180, 2, 25), point(365, 2, 10)];

  it('splits into two periods at the change and not before it', () => {
    const periods = referenceRangePeriods(rows);
    expect(periods).toHaveLength(2);
    expect(periods[0].rows).toHaveLength(2);
    expect(periods[0].high).toBe(25);
    expect(periods[1].rows).toHaveLength(1);
    expect(periods[1].high).toBe(10);
  });

  /**
   * MIDWAY, and this is the whole reason the boundary is not the new point's own
   * x. We know the range changed between those two draws and not when — and a
   * step anchored ON the newest sample drew the new range as a sliver in the
   * plot's 6% padding gutter (measured: 235, 187, 24 pixels against a 510px
   * plot). The midpoint also guarantees every period is at least half a sampling
   * gap wide, which is what makes a sliver impossible rather than unlikely.
   */
  it('puts the boundary exactly halfway between the last old sample and the first new one', () => {
    const periods = referenceRangePeriods(rows);
    const [boundary] = periodStepBoundaries(periods);
    expect(boundary).toBe(T0 + ((180 + 365) / 2) * DAY);
    // Strictly inside both samples, which is what stops a zero-width period.
    expect(boundary).toBeGreaterThan(rows[1].t);
    expect(boundary).toBeLessThan(rows[2].t);
  });

  it('gives a change on the FINAL result a period at least half a sampling gap wide', () => {
    // The case that produced the sliver. The last period runs from the boundary
    // to the axis edge, so its width is half the final gap plus the padding —
    // never the padding alone.
    const periods = referenceRangePeriods(rows);
    const [boundary] = periodStepBoundaries(periods);
    expect(rows[2].t - boundary).toBe(((365 - 180) / 2) * DAY);
  });

  it('gives each period its own severity threshold, from its own bounds', () => {
    const periods = referenceRangePeriods(rows);
    expect(periods[0].threshold).toBe(severityThresholdFor(2, 25));
    expect(periods[1].threshold).toBe(severityThresholdFor(2, 10));
    // And they genuinely differ — a period carrying its neighbour's threshold
    // would draw the significantly-out boundary in the wrong place.
    expect(periods[0].threshold).not.toBe(periods[1].threshold);
  });

  it('carries the server-sent threshold where there is one, rather than deriving it', () => {
    const periods = referenceRangePeriods([point(0, 10, 20, { severityThreshold: 4 })]);
    expect(periods[0].threshold).toBe(4);
  });

  it('names both ranges and their dates, one sentence per period', () => {
    // The sentence TrendChart builds, reduced to the part this derivation
    // decides: which ranges, in which order, and how many of them.
    const periods = referenceRangePeriods(rows);
    const named = periods.map((p) => formatReferenceRange(p.low, p.high, 'mIU/L'));
    expect(named).toEqual(['2–25 mIU/L', '2–10 mIU/L']);
  });
});

describe('two changes are two steps, and a range that returns is a third period', () => {
  it('steps once per change', () => {
    const periods = referenceRangePeriods([
      point(0, 50, 250),
      point(120, 75, 200),
      point(240, 80, 180),
    ]);
    expect(periods).toHaveLength(3);
    expect(periodStepBoundaries(periods)).toHaveLength(2);
  });

  /**
   * Grouping is by ADJACENCY and not by value, deliberately. A range that goes
   * away and comes back is two spells of that range with a different one in
   * between, and drawing it as one period would put a band across a stretch of
   * plot where it did not apply.
   */
  it('does not rejoin a range that returns after another one', () => {
    const periods = referenceRangePeriods([point(0, 2, 25), point(120, 2, 10), point(240, 2, 25)]);
    expect(periods).toHaveLength(3);
    expect(periods.map((p) => p.high)).toEqual([25, 10, 25]);
  });
});

describe('identity is decided at the precision a range is READ at, not by a float compare', () => {
  /**
   * The unit-conversion case, and the reason `sameReferenceRange` exists.
   *
   * A fasting glucose reported as 3.9–5.5 mmol/L and then as 70–99 mg/dL is ONE
   * interval written twice. Converted with no rounding — deliberately, so a band
   * edge lands on the same axis as the point it is drawn against — the second
   * comes back as 3.884960761896305–5.494444506110488, which a float compare
   * calls a different range. The chart then stepped, drew the dashed rule, named
   * the change in the key and printed a sentence claiming the laboratory had
   * changed a range it had never touched, with 5.494444506110488 set as an
   * inline axis label.
   */
  it('treats a converted range as the same range: one period, no step', () => {
    const periods = referenceRangePeriods([
      point(0, 3.9, 5.5),
      point(180, 70 / 18.0182, 99 / 18.0182),
    ]);
    expect(periods).toHaveLength(1);
    expect(periodStepBoundaries(periods)).toEqual([]);
  });

  /**
   * THE BAND GEOMETRY IS STILL THE EXACT NUMBERS THE SERVER SENT. Rounding
   * decides IDENTITY; it does not move an edge. The period keeps its first row's
   * bounds, so no band edge shifts to suit a printed number.
   */
  it('keeps the first row’s exact bounds for the geometry', () => {
    const periods = referenceRangePeriods([point(0, 3.9, 5.5), point(180, 70 / 18.0182, 99 / 18.0182)]);
    expect(periods[0].low).toBe(3.9);
    expect(periods[0].high).toBe(5.5);
  });

  /**
   * And the biconditional in the direction that matters for a false negative: a
   * difference big enough to PRINT differently is a step.
   */
  it('steps where the two ranges print differently', () => {
    const periods = referenceRangePeriods([point(0, 3.9, 5.5), point(180, 3.9, 5.9)]);
    expect(periods).toHaveLength(2);
    expect(periodStepBoundaries(periods)).toHaveLength(1);
    expect(formatReferenceRange(periods[0].low, periods[0].high)).not.toBe(
      formatReferenceRange(periods[1].low, periods[1].high),
    );
  });
});
