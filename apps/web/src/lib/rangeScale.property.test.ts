import { describe, expect, it } from 'vitest';
import { severityThresholdFor, statusBands } from '@aspire-bloods/shared';
import {
  MARK_HEADROOM,
  MIN_REFERENCE_FRACTION,
  RANGE_BAR_UNAVAILABLE,
  rangeBarScale,
  type RangeBarScaleInput,
  type RangeBarUndrawable,
} from './rangeScale';

/**
 * =============================================================================
 *  ONE INVARIANT, OVER EVERY INPUT THAT CAN REACH A RANGE BAR.
 * =============================================================================
 *
 * `rangeScale.test.ts` beside this pins the three live failures by their own
 * numbers, which is the right way to hold a bug that actually happened. This
 * file asks the other question: is the thing TRUE IN GENERAL, or was it only
 * made true for the three cases somebody had in front of them.
 *
 * The invariant, and every assertion below is one half of a sentence of it:
 *
 *   THE DRAWN POSITION OF THE MARK CORRESPONDS TO THE VALUE ON THE SCALE THAT
 *   IS ACTUALLY PRINTED. Nothing is clamped, nothing is drawn inside a region
 *   it is not inside, and no printed label describes a scale different from the
 *   one being drawn. Where that cannot be done, nothing is drawn and the fact
 *   is said in words.
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

interface Case extends RangeBarScaleInput {
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
 * The band a value genuinely falls in, from the SAME derivation the bar draws
 * its segments from. The last band whose lower edge the value has reached —
 * which is exactly how the five regions tile the line.
 */
function bandContaining(low: number, high: number, threshold: number | null | undefined, value: number) {
  const bands = statusBands(low, high, threshold);
  return [...bands].reverse().find((b) => value >= (b.from ?? Number.NEGATIVE_INFINITY))!;
}

function assertInvariant(c: Case) {
  const s = rangeBarScale(c);
  const where = c.what;

  // TRUE OF EVERY CASE, drawable or not: the geometry handed back is finite and
  // has a width. Nothing downstream of this can put a NaN into a style
  // attribute or divide by a zero-width span, even if a caller forgets the
  // guard entirely.
  expect(Number.isFinite(s.min), where).toBe(true);
  expect(Number.isFinite(s.max), where).toBe(true);
  expect(s.max, where).toBeGreaterThan(s.min);
  expect(Number.isFinite(s.pct(s.min)), where).toBe(true);
  // Exactly one of the two arms, always.
  expect(s.outOfScale, where).toBe(s.undrawable !== null);

  if (s.outOfScale) {
    // SAID IN WORDS RATHER THAN DRAWN. The reason has a sentence and a card
    // line, both of them real copy — that is the whole of what the caller has
    // to render, so an unnamed reason would be a bar that silently vanishes.
    const copy = RANGE_BAR_UNAVAILABLE[s.undrawable];
    expect(copy, where).toBeDefined();
    expect(copy.long.trim().length, where).toBeGreaterThan(20);
    expect(copy.long.endsWith('.'), where).toBe(true);
    expect(copy.short.trim().length, where).toBeGreaterThan(10);
    return;
  }

  const { min, max, low, high, value, pct } = s;
  const span = max - min;

  // ── THE PRINTED LABELS ARE THE DRAWN SCALE ───────────────────────────────
  // Not "close to", not "formatted from" — the same two numbers. This is the
  // failure the whole module exists to have stopped making, so it is asserted
  // as an identity rather than to a tolerance.
  expect(Number(s.minLabel), where).toBe(min);
  expect(Number(s.maxLabel), where).toBe(max);

  // ── THE PRINTED ENDS BOUND EVERYTHING THE BAR CONTAINS ───────────────────
  expect(Number(s.minLabel), where).toBeLessThanOrEqual(low);
  expect(Number(s.maxLabel), where).toBeGreaterThanOrEqual(high);
  expect(Number(s.minLabel), where).toBeLessThanOrEqual(value);
  expect(Number(s.maxLabel), where).toBeGreaterThanOrEqual(value);

  // ── THE MARK'S DRAWN FRACTION IS THE VALUE'S TRUE POSITION ON THAT SCALE ──
  // Recomputed from the PRINTED labels rather than from the internal numbers,
  // because "the axis the reader can see" is the only scale that counts.
  const fromLabels = (v: number) => ((v - Number(s.minLabel)) / (Number(s.maxLabel) - Number(s.minLabel))) * 100;
  for (const v of [min, max, value, low, high, (min + max) / 2]) {
    expect(pct(v), `${where} @ ${v}`).toBe(fromLabels(v));
  }
  expect(pct(min), where).toBe(0);
  expect(pct(max), where).toBe(100);

  // ── NOTHING IS CLAMPED ───────────────────────────────────────────────────
  // The mark is inside the bar because the SCALE was built to contain it, not
  // because a Math.min put it there. Strictly inside wherever the value is
  // strictly inside, which is the difference between a mark at the end and a
  // mark that has run out of bar.
  const at = pct(value);
  expect(at, where).toBeGreaterThanOrEqual(0);
  expect(at, where).toBeLessThanOrEqual(100);
  if (value > min) expect(at, where).toBeGreaterThan(0);
  if (value < max) expect(at, where).toBeLessThan(100);

  // ── AND IT CLEARS THE EDGE ───────────────────────────────────────────────
  // MARK_HEADROOM is 6%; the assertion allows 4.5 because rounding the ends
  // outward to the 1/2/2.5/5 ladder can widen the span under the mark by up to
  // a step. The exception at the bottom is the zero floor and only that: a
  // quantity that cannot be negative has a hard end at zero, a value sitting on
  // it is genuinely at the end of its own scale, and inventing a negative end
  // to hold the mark off the edge would print a number no laboratory reports.
  expect(at, where).toBeLessThan(100 - (MARK_HEADROOM * 100 - 1.5));
  if (min !== 0) expect(at, where).toBeGreaterThan(MARK_HEADROOM * 100 - 1.5);

  // ── THE REFERENCE RANGE IS INSIDE THE SCALE, AND IS A REGION ─────────────
  expect(min, where).toBeLessThanOrEqual(low);
  expect(max, where).toBeGreaterThanOrEqual(high);
  expect(s.referenceFraction, where).toBeGreaterThanOrEqual(MIN_REFERENCE_FRACTION);
  // The fraction is the region actually drawn, not a second opinion about it.
  expect(s.referenceFraction, where).toBeCloseTo((pct(Math.min(high, max)) - pct(Math.max(low, min))) / 100, 10);
  expect(pct(high), where).toBeGreaterThan(pct(low));

  // ── NOTHING IS DRAWN INSIDE A REGION IT IS NOT INSIDE ────────────────────
  // The reported bug, stated as a property: a value below the range must be
  // drawn to the LEFT of where the range begins, and one above it to the right.
  if (value < low) expect(at, where).toBeLessThan(pct(low));
  if (value > high) expect(at, where).toBeGreaterThan(pct(high));
  if (value >= low && value <= high) {
    expect(at, where).toBeGreaterThanOrEqual(pct(low));
    expect(at, where).toBeLessThanOrEqual(pct(high));
  }

  // The same thing against all five status regions rather than just the middle
  // one, from the derivation the bar's own segments come from: the mark lands
  // inside the segment whose colour and whose word describe it.
  const band = bandContaining(low, high, c.severityThreshold, value);
  const bandFrom = band.from === null ? min : Math.max(min, band.from);
  const bandTo = band.to === null ? max : Math.min(max, band.to);
  expect(at, `${where} → ${band.status}`).toBeGreaterThanOrEqual(pct(bandFrom) - 1e-9);
  expect(at, `${where} → ${band.status}`).toBeLessThanOrEqual(pct(bandTo) + 1e-9);

  // Sanity on the fixture itself: the span used above is the one pct divides by.
  expect(span, where).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

describe('rangeBarScale — the invariant, over a generated spread of inputs', () => {
  const cases = generatedCases();

  it('generates a wide spread rather than a handful of cases', () => {
    // Guards the generator, not the scale: a loop that silently produced four
    // cases would pass every assertion below and prove nothing.
    expect(cases.length).toBeGreaterThan(4500);
    const drawn = cases.filter((c) => !rangeBarScale(c).outOfScale);
    // Both arms have to be genuinely exercised — all-drawable would mean the
    // refusals are untested, all-refused would mean the geometry is.
    expect(drawn.length).toBeGreaterThan(1000);
    expect(cases.length - drawn.length).toBeGreaterThan(100);
  });

  it('holds for every generated case', () => {
    for (const c of cases) assertInvariant(c);
  });

  it('holds for every value that cannot be placed, against a range that is fine', () => {
    for (const range of DRAWABLE_RANGES) {
      for (const v of REFUSED_VALUES) {
        const c: Case = { what: `value ${v.what} against ${range[0]}–${range[1]}`, low: range[0], high: range[1], value: v.value as number };
        assertInvariant(c);
        expect(rangeBarScale(c).undrawable, c.what).toBe('value-not-numeric');
      }
    }
  });

  it('holds for every range that cannot be drawn, and names the right reason', () => {
    for (const r of REFUSED_RANGES) {
      for (const value of [3.4, 0, -1, 5.8]) {
        const c: Case = { what: `${r.what}, value ${value}`, low: r.low as number, high: r.high as number, value };
        assertInvariant(c);
        expect(rangeBarScale(c).undrawable, c.what).toBe(r.reason);
      }
    }
  });

  it('refuses a value it cannot draw beside a range it cannot draw, without inventing either', () => {
    for (const r of REFUSED_RANGES) {
      for (const v of REFUSED_VALUES) {
        const c: Case = { what: `${r.what} with a ${v.what} value`, low: r.low as number, high: r.high as number, value: v.value as number };
        assertInvariant(c);
        expect(rangeBarScale(c).outOfScale, c.what).toBe(true);
      }
    }
  });
});

describe('the cases the brief names, one at a time', () => {
  /** The scale, for a case that must be drawable. Fails loudly rather than returning a union. */
  function drawn(input: RangeBarScaleInput) {
    const s = rangeBarScale(input);
    if (s.outOfScale) throw new Error(`expected a drawable scale, got ${s.undrawable}`);
    return s;
  }

  it('a value far below the lower bound is drawn left of the range, on a scale that says so', () => {
    const s = drawn({ low: 125, high: 375, value: 12 });
    expect(s.pct(12)).toBeLessThan(s.pct(125));
    expect(Number(s.minLabel)).toBeLessThan(12);
    expect(s.minLabel).not.toBe('125');
  });

  it('a value far above the upper bound is drawn right of the range, on a scale that says so', () => {
    const s = drawn({ low: 0, high: 41, value: 122 });
    expect(s.pct(122)).toBeGreaterThan(s.pct(41));
    expect(Number(s.maxLabel)).toBeGreaterThan(122);
    expect(s.maxLabel).not.toBe('41');
  });

  it('a value exactly on a bound is drawn exactly on that bound', () => {
    const s = drawn({ low: 3.8, high: 5.8, value: 3.8 });
    expect(s.pct(3.8)).toBe(s.pct(s.low));
    const t = drawn({ low: 3.8, high: 5.8, value: 5.8 });
    expect(t.pct(5.8)).toBe(t.pct(t.high));
  });

  it('one step inside a bound is inside, one step outside is outside', () => {
    for (const step of [0.2, 0.002, 0.000002]) {
      const below = drawn({ low: 3.8, high: 5.8, value: 3.8 - step });
      expect(below.pct(3.8 - step), `step ${step}`).toBeLessThan(below.pct(3.8));
      const inside = drawn({ low: 3.8, high: 5.8, value: 3.8 + step });
      expect(inside.pct(3.8 + step), `step ${step}`).toBeGreaterThan(inside.pct(3.8));
      const above = drawn({ low: 3.8, high: 5.8, value: 5.8 + step });
      expect(above.pct(5.8 + step), `step ${step}`).toBeGreaterThan(above.pct(5.8));
    }
  });

  it('a range with a floor at zero keeps the scale at zero rather than inventing a negative end', () => {
    const s = drawn({ low: 0, high: 41, value: 3 });
    expect(s.min).toBe(0);
    expect(s.minLabel).toBe('0');
  });

  it('a value of exactly zero is drawn at zero, not clamped away from it', () => {
    const s = drawn({ low: 3.8, high: 5.8, value: 0 });
    expect(s.pct(0)).toBe(((0 - s.min) / (s.max - s.min)) * 100);
    expect(s.pct(0)).toBeLessThan(s.pct(3.8));
  });

  it('a very narrow range still resolves to a scale with real width', () => {
    const s = drawn({ low: 1, high: 1.0001, value: 1.00005 });
    expect(s.max).toBeGreaterThan(s.min);
    expect(s.referenceFraction).toBeGreaterThanOrEqual(MIN_REFERENCE_FRACTION);
    expect(s.pct(1.00005)).toBeGreaterThan(s.pct(1));
    expect(s.pct(1.00005)).toBeLessThan(s.pct(1.0001));
  });

  it('a range spanning orders of magnitude is drawn on one scale', () => {
    const s = drawn({ low: 1, high: 1_000_000, value: 500_000 });
    expect(s.min).toBeLessThanOrEqual(1);
    expect(s.max).toBeGreaterThanOrEqual(1_000_000);
    expect(s.pct(500_000)).toBeGreaterThan(s.pct(1));
    expect(s.pct(500_000)).toBeLessThan(s.pct(1_000_000));
  });

  it('a one-sided range is refused rather than completed with a bound nobody gave', () => {
    expect(rangeBarScale({ low: null, high: 5.8, value: 3.4 }).undrawable).toBe('no-reference-range');
    expect(rangeBarScale({ low: 3.8, high: null, value: 3.4 }).undrawable).toBe('no-reference-range');
  });

  it('a negative value on a range spanning zero is drawn below the range', () => {
    const s = drawn({ low: -2, high: 2, value: -6 });
    expect(s.min).toBeLessThan(-6);
    expect(s.pct(-6)).toBeLessThan(s.pct(-2));
  });

  it('non-integer values and bounds print ends somebody would have chosen', () => {
    const s = drawn({ low: 12.345, high: 67.891, value: 81.4 });
    // Not 88.3624..., which is the headroom arithmetic showing through.
    expect(s.maxLabel).toBe(String(Number(s.maxLabel)));
    expect(s.maxLabel.replace('-', '').replace('.', '').replace(/0+$/, '').length).toBeLessThanOrEqual(4);
  });

  it('lower equal to upper is not a range, and says so rather than drawing one', () => {
    const s = rangeBarScale({ low: 5, high: 5, value: 9 });
    expect(s.outOfScale).toBe(true);
    expect(s.undrawable).toBe('range-has-no-width');
    expect(RANGE_BAR_UNAVAILABLE['range-has-no-width'].long).toContain('same lower and upper bound');
  });

  it('a value with no bounds at all is refused, and the refusal is about the bounds', () => {
    const s = rangeBarScale({ low: null, high: null, value: 3.4 });
    expect(s.undrawable).toBe('no-reference-range');
  });

  it('a bar too far out to draw honestly says so instead of drawing a sliver', () => {
    const s = rangeBarScale({ low: 0, high: 41, value: 3000 });
    expect(s.undrawable).toBe('reference-range-too-small');
  });

  it('the severity threshold shifts the shoulders without ever moving the mark off its value', () => {
    // A marker whose threshold dwarfs its range (ferritin's is 270 against a
    // 180-wide band) is the case the resting pad is capped for.
    for (const threshold of [1, 30, 270, 5000]) {
      const s = drawn({ low: 30, high: 400, value: 512, severityThreshold: threshold });
      expect(s.pct(512), `threshold ${threshold}`).toBe(((512 - s.min) / (s.max - s.min)) * 100);
      expect(s.pct(512), `threshold ${threshold}`).toBeGreaterThan(s.pct(400));
    }
  });

  it('exposes the same threshold the bands are drawn from, so the segments and the scale agree', () => {
    // Not a property of the scale so much as of the pair: if these two ever
    // disagreed, the mark would land in a segment of the wrong colour.
    const t = severityThresholdFor(30, 400, null);
    const s = drawn({ low: 30, high: 400, value: 1200 });
    // 1200 is past 400 + t (555), so it is significantly high and must be
    // drawn past where that segment begins — not merely past the range.
    expect(1200).toBeGreaterThan(400 + t);
    expect(s.pct(1200)).toBeGreaterThan(s.pct(400 + t));
    expect(s.pct(1200)).toBeGreaterThan(s.pct(400));
  });
});
