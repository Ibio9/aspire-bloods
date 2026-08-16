import { describe, expect, it } from 'vitest';
import { severityThresholdFor, statusBands, type MarkerStatus } from '@aspire-bloods/shared';
import {
  GAUGE_BOUNDARIES,
  GAUGE_SLICES,
  gaugePlacement,
  RANGE_BAR_UNAVAILABLE,
  type GaugePlacementInput,
  type RangeBarUndrawable,
} from './rangeScale';

/**
 * =============================================================================
 *  ONE INVARIANT, OVER EVERY INPUT THAT CAN REACH A RESULT GAUGE.
 * =============================================================================
 *
 * `rangeScale.test.ts` beside this pins the named cases by their own numbers,
 * which is the right way to hold a bug that actually happened. This file asks
 * the other question: is the thing TRUE IN GENERAL, or was it only made true
 * for the handful of cases somebody had in front of them.
 *
 * ── THE INVARIANT CHANGED WITH THE INSTRUMENT (Aug 2026) ──────────────────
 *
 * It used to be "the drawn position of the mark corresponds to the value on the
 * scale that is actually printed", because the ring was a number line. The ring
 * is FIXED and symmetric now — green always central, gold always flanking it,
 * red always at both ends — so the sentence is:
 *
 *   THE MARK ALWAYS LANDS INSIDE THE SLICE ITS OWN STATUS NAMES, is ordered
 *   within it, and never reaches either end of the arc. The colour under the
 *   mark therefore always agrees with the word beside it. Where nothing can be
 *   drawn, nothing is drawn and the fact is said in words.
 *
 * That is a STRONGER claim than the old one for the thing a reader actually
 * does with this instrument, and a weaker one about distance — see the note at
 * the top of rangeScale.ts, which records what the fixed geometry costs.
 *
 * The cases are GENERATED and DETERMINISTIC — an enumerated spread of the
 * shapes a reference range comes in, crossed with the positions a value can
 * take against one, plus a seeded pseudo-random sweep across twelve orders of
 * magnitude. Deterministic on purpose: a property test that finds a failure on
 * a Tuesday and cannot reproduce it on a Wednesday is a rumour. There is no
 * fast-check dependency for the same reason there is no jsdom — this is a
 * clinical portal and the generator is thirty lines.
 */

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

interface Case extends GaugePlacementInput {
  /** What this case is, printed on any failure. */
  what: string;
}

/** A seeded LCG. Same numbers on every machine and every run, forever. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * The shapes a two-sided reference range comes in. Every one of these is either
 * a real marker's range or one of the degenerate forms named in the brief:
 * a floor at zero, bounds that are nearly equal, bounds orders of magnitude
 * apart, a range spanning zero, a wholly negative range, non-integer bounds.
 */
const DRAWABLE_RANGES: Array<[number, number]> = [
  [3.8, 5.8], // the reported case
  [0, 41], // a floor at zero
  [125, 375],
  [30, 400],
  [0.27, 4.2], // TSH — a decimal floor beside a whole-number ceiling
  [0, 1],
  [0, 0.001],
  [1, 1.0001], // bounds nearly equal
  [1, 1_000_000], // orders of magnitude
  [0.0001, 0.0002],
  [1e-6, 1e-5],
  [-2, 2], // spanning zero
  [-0.5, 0.5],
  [-100, -10], // wholly negative
  [12.345, 67.891], // non-integer bounds
  [1e9, 2e9],
  [13.6, 13.7],
];

/** Where a value can sit against a range, as a function of that range. */
function valuesFor(low: number, high: number): number[] {
  const width = high - low;
  const coarse = width * 0.1; // one step, at the granularity a reader sees
  const fine = width * 1e-3; // one step, at the granularity the arithmetic sees
  return [
    low, // exactly on the lower bound
    high, // exactly on the upper bound
    low + coarse,
    low - coarse,
    high - coarse,
    high + coarse,
    low + fine,
    low - fine,
    high - fine,
    high + fine,
    low + width / 2, // the middle
    low + width / 7, // a non-integer position
    low - width * 3, // far below
    low - width * 12,
    high + width * 3, // far above
    high + width * 12,
    0, // a value of exactly zero, whatever the range is
    -width, // negative
    -Math.abs(high) * 2,
  ];
}

/** Ranges that cannot be drawn, and the reason each must give. */
const REFUSED_RANGES: Array<{ what: string; low: unknown; high: unknown; reason: RangeBarUndrawable }> = [
  { what: 'lower and upper equal', low: 5, high: 5, reason: 'range-has-no-width' },
  { what: 'lower and upper equal at zero', low: 0, high: 0, reason: 'range-has-no-width' },
  { what: 'lower and upper equal and negative', low: -1, high: -1, reason: 'range-has-no-width' },
  { what: 'inverted', low: 5, high: 4, reason: 'range-has-no-width' },
  { what: 'upper bound only', low: null, high: 5.8, reason: 'no-reference-range' },
  { what: 'lower bound only', low: 3.8, high: null, reason: 'no-reference-range' },
  { what: 'neither bound', low: null, high: null, reason: 'no-reference-range' },
  { what: 'both bounds absent', low: undefined, high: undefined, reason: 'no-reference-range' },
  { what: 'lower bound absent', low: undefined, high: 5.8, reason: 'no-reference-range' },
  { what: 'lower bound NaN', low: Number.NaN, high: 5.8, reason: 'no-reference-range' },
  { what: 'upper bound NaN', low: 3.8, high: Number.NaN, reason: 'no-reference-range' },
  { what: 'upper bound infinite', low: 3.8, high: Number.POSITIVE_INFINITY, reason: 'no-reference-range' },
  { what: 'lower bound infinite', low: Number.NEGATIVE_INFINITY, high: 5.8, reason: 'no-reference-range' },
];

/** Values that cannot be placed, against a range that is otherwise fine. */
const REFUSED_VALUES: Array<{ what: string; value: unknown }> = [
  { what: 'null', value: null },
  { what: 'absent', value: undefined },
  { what: 'NaN', value: Number.NaN },
  { what: 'positive infinity', value: Number.POSITIVE_INFINITY },
  { what: 'negative infinity', value: Number.NEGATIVE_INFINITY },
];

function generatedCases(): Case[] {
  const cases: Case[] = [];

  // Every range crossed with every position a value can take against it, at
  // three severity thresholds — the default, one much narrower than the range
  // and one much wider, because the threshold is what sets the resting pad.
  for (const [low, high] of DRAWABLE_RANGES) {
    const width = high - low;
    for (const value of valuesFor(low, high)) {
      for (const severityThreshold of [null, width * 0.1, width * 6]) {
        cases.push({ what: `${value} against ${low}–${high} (threshold ${severityThreshold})`, low, high, value, severityThreshold });
      }
    }
  }

  // The seeded sweep. Magnitude, sign, width and the value's offset are all
  // drawn independently, so it reaches shapes no hand-written list contains —
  // a range of 4.2e-5 to 4.3e-5 with a value at nine times its ceiling, say.
  const rand = lcg(20260812);
  for (let i = 0; i < 4000; i += 1) {
    const magnitude = 10 ** (rand() * 16 - 7); // 1e-7 up to 1e9
    const sign = rand() < 0.25 ? -1 : 1;
    const low = sign * magnitude * rand();
    const width = magnitude * (rand() ** 3) * 4 + Number.MIN_VALUE;
    const high = low + width;
    // Deliberately weighted outward: a value between −4 and +5 range-widths of
    // the lower bound, so most cases are the out-of-range ones this is about.
    const value = low + (rand() * 9 - 4) * width;
    const severityThreshold = rand() < 0.5 ? null : width * rand() * 5;
    cases.push({ what: `seeded #${i}: ${value} against ${low}–${high}`, low, high, value, severityThreshold });
  }

  // And the shapes that cannot be drawn, in the same sweep rather than only in
  // the tests below — the invariant has two arms and a generator that produces
  // one of them is testing half a function.
  for (const r of REFUSED_RANGES) {
    for (const value of [3.4, 0, -1, 5.8, 1e9]) {
      cases.push({ what: `${r.what}, value ${value}`, low: r.low as number, high: r.high as number, value });
    }
  }
  for (const [low, high] of DRAWABLE_RANGES) {
    for (const v of REFUSED_VALUES) {
      cases.push({ what: `value ${v.what} against ${low}–${high}`, low, high, value: v.value as number });
    }
  }

  return cases;
}


// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

/**
 * The band a value genuinely falls in, from the SAME derivation the ring is
 * built from and the server computes a status with. The last band whose lower
 * edge the value has reached — which is exactly how the five regions tile the
 * line.
 *
 * Re-derived here rather than read off the placement, so this is checking the
 * answer against the question instead of against itself.
 */
function bandContaining(low: number, high: number, threshold: number | null | undefined, value: number): MarkerStatus {
  const bands = statusBands(low, high, threshold);
  return [...bands].reverse().find((b) => value >= (b.from ?? Number.NEGATIVE_INFINITY))!.status;
}

function assertInvariant(c: Case) {
  const p = gaugePlacement(c);
  const where = c.what;

  const lowOk = typeof c.low === 'number' && Number.isFinite(c.low);
  const highOk = typeof c.high === 'number' && Number.isFinite(c.high);
  const rangeOk = lowOk && highOk && (c.high as number) > (c.low as number);
  const valueOk = typeof c.value === 'number' && Number.isFinite(c.value);

  if (!p.drawable) {
    // A refusal always names a reason that has a sentence, and never invents one.
    expect(RANGE_BAR_UNAVAILABLE[p.undrawable], `${where}: refused with a reason that has no words`).toBeDefined();
    // And it only ever refuses for a reason that is actually true of the input.
    if (p.undrawable === 'no-reference-range') expect(lowOk && highOk, where).toBe(false);
    if (p.undrawable === 'range-has-no-width') expect(rangeOk, where).toBe(false);
    if (p.undrawable === 'value-not-numeric') expect(valueOk, where).toBe(false);
    return;
  }

  // Anything drawable had a two-sided range with width and a real value. Both
  // directions, because only one of them is the dangerous one.
  expect(rangeOk && valueOk, `${where}: drawn from an input that cannot be drawn`).toBe(true);

  const threshold = severityThresholdFor(p.low, p.high, c.severityThreshold);
  const band = bandContaining(p.low, p.high, c.severityThreshold, p.value);

  // ── 1. THE MARK IS IN THE SLICE ITS OWN STATUS NAMES. ────────────────────
  // The whole point of the fixed ring: the colour under the mark and the word
  // beside it come from one derivation and cannot disagree.
  expect(p.status, `${where}: placed in ${p.status} where the bands say ${band}`).toBe(band);
  const [from, to] = GAUGE_SLICES[band];
  expect(p.at, `${where}: at ${p.at}, outside the ${band} slice ${from}-${to}`).toBeGreaterThanOrEqual(from - 1e-9);
  expect(p.at, `${where}: at ${p.at}, outside the ${band} slice ${from}-${to}`).toBeLessThanOrEqual(to + 1e-9);

  // ── 2. IT IS NEVER AT EITHER END OF THE ARC. ─────────────────────────────
  // A mark pinned to the end of an instrument has stopped carrying information
  // and is indistinguishable from one that legitimately sits there. The two
  // outer bands are unbounded in value and finite in angle, so this is the rule
  // the saturating map exists to keep.
  expect(p.at, `${where}: the mark reached the start of the arc`).toBeGreaterThan(0);
  expect(p.at, `${where}: the mark reached the end of the arc`).toBeLessThan(1);

  // ── 3. THE FOUR BOUNDARIES ARE WHERE THE FOUR HAIRLINES ARE. ─────────────
  // A value exactly on a reference bound is drawn exactly on the green/gold
  // seam; one exactly on a threshold, exactly on the gold/red seam. That is what
  // makes the hairlines honest — they are drawn at fixed angles, so a value
  // sitting on a bound has to land ON the hairline rather than near it.
  if (p.value === p.low) expect(p.at, where).toBeCloseTo(GAUGE_BOUNDARIES.low, 9);
  if (p.value === p.high) expect(p.at, where).toBeCloseTo(GAUGE_BOUNDARIES.high, 9);
  if (p.value === p.low - threshold) expect(p.at, where).toBeCloseTo(GAUGE_BOUNDARIES.lowThreshold, 9);
  if (p.value === p.high + threshold) expect(p.at, where).toBeCloseTo(GAUGE_BOUNDARIES.highThreshold, 9);

  // ── 4. IT IS FINITE. ─────────────────────────────────────────────────────
  // Nothing downstream can put a NaN into a `rotate()`, which renders as the
  // mark silently vanishing rather than as an error anybody sees.
  expect(Number.isFinite(p.at), `${where}: the mark position is not a finite number`).toBe(true);
}

describe('gaugePlacement — the invariant, over a generated spread of inputs', () => {
  const cases = generatedCases();

  it('generates a wide spread rather than a handful of cases', () => {
    expect(cases.length).toBeGreaterThan(4000);
  });

  it('holds for every generated case', () => {
    for (const c of cases) assertInvariant(c);
  });

  /**
   * ── 5. IT IS MONOTONIC, WHICH IS THE HALF THE SLICES DO NOT COVER ────────
   *
   * "In the right slice" would still be satisfied by a mark that jumped about
   * inside it. A reader comparing two results of the same marker has to be able
   * to trust that the further-out one is drawn further out — across a band
   * boundary, and inside the two compressed outer bands where distance is no
   * longer to scale but ORDER still is.
   */
  it('never draws a larger value closer to the start than a smaller one', () => {
    for (const [low, high] of DRAWABLE_RANGES) {
      const width = high - low;
      for (const severityThreshold of [null, width * 0.1, width * 6]) {
        const values = Array.from({ length: 200 }, (_, i) => low - width * 5 + (i / 199) * width * 11);
        let previous = -Infinity;
        for (const value of values) {
          const p = gaugePlacement({ low, high, value, severityThreshold });
          if (!p.drawable) continue;
          expect(
            p.at,
            `${value} against ${low}-${high} (threshold ${severityThreshold}) went backwards: ${p.at} after ${previous}`,
          ).toBeGreaterThanOrEqual(previous - 1e-12);
          previous = p.at;
        }
      }
    }
  });

  /**
   * ── 6. AND THE RING IS THE SAME PICTURE ON EVERY CARD ────────────────────
   *
   * The reason the instrument was rebuilt. The four boundaries are constants, so
   * no input can move them — asserted directly rather than inferred from the
   * generated cases, because "no case moved it" is a weaker claim than "it is
   * not a function of the input at all".
   */
  it('puts green in the centre with equal space either side, whatever the value', () => {
    const b = GAUGE_BOUNDARIES;
    expect(b.lowThreshold + b.highThreshold, 'the two thresholds are not symmetric about the centre').toBeCloseTo(1, 9);
    expect(b.low + b.high, 'the two reference bounds are not symmetric about the centre').toBeCloseTo(1, 9);
    const order = [b.lowThreshold, b.low, b.high, b.highThreshold];
    expect([...order].sort((x, y) => x - y), 'the boundaries are out of order').toEqual(order);
    const slices = Object.values(GAUGE_SLICES).map(([from, to]) => to - from);
    expect(
      slices.reduce((a, x) => a + x, 0),
      'the five slices do not fill the arc',
    ).toBeCloseTo(1, 9);
    expect(GAUGE_SLICES.IN_RANGE[0] < 0.5 && GAUGE_SLICES.IN_RANGE[1] > 0.5, 'green is not the central slice').toBe(
      true,
    );
    expect(GAUGE_SLICES.SIGNIFICANT_LOW[0], 'red does not start the arc').toBe(0);
    expect(GAUGE_SLICES.SIGNIFICANT_HIGH[1], 'red does not end the arc').toBe(1);
  });

  it('holds for every value that cannot be placed, against a range that is fine', () => {
    for (const [low, high] of DRAWABLE_RANGES) {
      for (const v of REFUSED_VALUES) {
        const p = gaugePlacement({ low, high, value: v.value as number });
        expect(p.drawable, `value ${v.what} against ${low}-${high} was drawn`).toBe(false);
        if (!p.drawable) expect(p.undrawable).toBe('value-not-numeric');
      }
    }
  });

  it('holds for every range that cannot be drawn, and names the right reason', () => {
    for (const r of REFUSED_RANGES) {
      const p = gaugePlacement({ low: r.low as number, high: r.high as number, value: 3.4 });
      expect(p.drawable, `${r.what} was drawn`).toBe(false);
      if (!p.drawable) expect(p.undrawable, r.what).toBe(r.reason);
    }
  });

  /**
   * THE RANGE IS REFUSED FIRST. A result with neither a usable range nor a
   * usable value must not be reported as a value problem — the range is the
   * thing that is wrong, and a sentence about a missing number would send
   * somebody looking in the wrong place.
   */
  it('refuses a value it cannot place beside a range it cannot draw, without inventing either', () => {
    for (const r of REFUSED_RANGES) {
      for (const v of REFUSED_VALUES) {
        const p = gaugePlacement({ low: r.low as number, high: r.high as number, value: v.value as number });
        expect(p.drawable).toBe(false);
        if (!p.drawable) expect(p.undrawable, `${r.what} with a value that is ${v.what}`).toBe(r.reason);
      }
    }
  });
});

describe('the cases the brief names, one at a time', () => {
  const place = (low: number, high: number, value: number, severityThreshold: number | null = null) => {
    const p = gaugePlacement({ low, high, value, severityThreshold });
    expect(p.drawable).toBe(true);
    return p as Extract<typeof p, { drawable: true }>;
  };

  /**
   * ⚠ THE FAILURE THIS WAS REBUILT FOR. Two results, one above its range and one
   * below, on the same grid. On the value-mapped ring the green slid toward the
   * start of the arc for the first and toward the end for the second, so the
   * shape meant something different on every card. Here it cannot move.
   */
  it('draws the green in the same place for an above-range and a below-range result', () => {
    const above = place(0, 41, 122);
    const below = place(125, 375, 65);
    expect(above.status).toBe('SIGNIFICANT_HIGH');
    // ⚠ LOW, not SIGNIFICANT_LOW, and it is worth being explicit: the default
    // severity threshold is 1.5× the range's own WIDTH, so for a 250-wide range
    // significantly-low does not begin until −250. The two reported cases are
    // not symmetric in severity, only in direction.
    expect(below.status).toBe('LOW');
    // The whole claim: the two marks land on opposite sides of the ring, and the
    // ring itself is the same on both cards — the green has not moved, because
    // it cannot.
    expect(above.at).toBeGreaterThan(GAUGE_BOUNDARIES.highThreshold);
    expect(below.at).toBeLessThan(GAUGE_BOUNDARIES.low);
    expect(below.at).toBeGreaterThan(GAUGE_BOUNDARIES.lowThreshold);
  });

  it('draws an in-range result inside the central green', () => {
    const p = place(3.8, 5.8, 4.8);
    expect(p.status).toBe('IN_RANGE');
    expect(p.at).toBeCloseTo(0.5, 9);
  });

  it('draws a value exactly on a bound exactly on that bound’s hairline', () => {
    expect(place(3.8, 5.8, 3.8).at).toBeCloseTo(GAUGE_BOUNDARIES.low, 9);
    expect(place(3.8, 5.8, 5.8).at).toBeCloseTo(GAUGE_BOUNDARIES.high, 9);
  });

  it('draws one step outside a bound outside it, and one step inside, inside', () => {
    expect(place(3.8, 5.8, 5.8001).at).toBeGreaterThan(GAUGE_BOUNDARIES.high);
    expect(place(3.8, 5.8, 5.7999).at).toBeLessThan(GAUGE_BOUNDARIES.high);
    expect(place(3.8, 5.8, 3.7999).at).toBeLessThan(GAUGE_BOUNDARIES.low);
    expect(place(3.8, 5.8, 3.8001).at).toBeGreaterThan(GAUGE_BOUNDARIES.low);
  });

  /**
   * THE COMPRESSED TAIL, PINNED AS WHAT IT IS. Ten times the threshold is drawn
   * further out than twice it and closer to the end of the arc than either — and
   * none of them reaches it. This is the cost of the fixed geometry, asserted so
   * nobody mistakes it for a bug later and "fixes" it by clamping.
   */
  it('orders the unbounded tail without ever reaching the end of the arc', () => {
    const near = place(0, 10, 20);
    const far = place(0, 10, 200);
    const absurd = place(0, 10, 2e9);
    expect(near.at).toBeLessThan(far.at);
    expect(far.at).toBeLessThan(absurd.at);
    expect(absurd.at).toBeLessThan(1);
    expect(absurd.status).toBe('SIGNIFICANT_HIGH');
  });

  it('mirrors the low side exactly', () => {
    // A range symmetric about zero, and a value the same distance either side of
    // it, drawn the same distance either side of the centre. The whole claim of
    // the word "symmetric", in one assertion.
    const up = place(-10, 10, 25);
    const down = place(-10, 10, -25);
    expect(up.at + down.at).toBeCloseTo(1, 9);
  });

  it('refuses an open-topped range rather than drawing it against a sentinel', () => {
    const p = gaugePlacement({ low: 60, high: 999, value: 97 });
    expect(p.drawable).toBe(false);
    if (!p.drawable) expect(p.undrawable).toBe('reference-range-open-ended');
  });

  it('uses the same threshold the bands are drawn from, so the seams and the states agree', () => {
    const p = place(3.9, 5.1, 6.0, 0.4);
    expect(p.threshold).toBe(0.4);
    expect(p.status).toBe('SIGNIFICANT_HIGH');
  });
});
