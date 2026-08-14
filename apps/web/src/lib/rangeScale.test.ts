import { describe, expect, it } from 'vitest';
import { OPEN_UPPER_BOUND } from '@aspire-bloods/shared';
import { MIN_REFERENCE_FRACTION, rangeBarScale } from './rangeScale';

/**
 * The two failures these tests are written from are real results, seen on a
 * patient's own screen, and they failed in opposite directions:
 *
 *   · 122 against a reference range of 0–41 — drawn with the mark pinned to
 *     the right-hand end, under a label reading "41".
 *   · 65 against 125–375 — drawn with the mark INSIDE a bar labelled 125 to
 *     375, a range the value is entirely below.
 *
 * Both are asserted below by their own numbers rather than by a synthetic
 * case, because the arithmetic that produced them is the arithmetic under
 * test.
 */

/** The mark must be visibly inside the scale at both ends — never on an edge. */
function assertNotAtAnExtremity(position: number) {
  expect(position).toBeGreaterThan(2);
  expect(position).toBeLessThan(98);
}

describe('rangeBarScale', () => {
  it('is a linear map from the drawn scale, so a position always corresponds to its value', () => {
    const s = rangeBarScale({ low: 3.9, high: 5.5, value: 4.5 });
    expect(s.pct(s.min)).toBeCloseTo(0, 10);
    expect(s.pct(s.max)).toBeCloseTo(100, 10);
    expect(s.pct((s.min + s.max) / 2)).toBeCloseTo(50, 10);
  });

  it('always contains the reference range, so the range stays visible as a region', () => {
    for (const c of [
      { low: 0, high: 41, value: 122 },
      { low: 125, high: 375, value: 65 },
      { low: 3.9, high: 5.5, value: 4.5 },
      { low: 30, high: 400, value: 12 },
    ]) {
      const s = rangeBarScale(c);
      expect(s.min, `${c.value} against ${c.low}–${c.high}`).toBeLessThanOrEqual(c.low);
      expect(s.max, `${c.value} against ${c.low}–${c.high}`).toBeGreaterThanOrEqual(c.high);
      expect(s.referenceFraction).toBeGreaterThanOrEqual(MIN_REFERENCE_FRACTION);
      expect(s.outOfScale).toBe(false);
    }
  });

  describe('a value several times the upper bound (122 against 0–41)', () => {
    const s = rangeBarScale({ low: 0, high: 41, value: 122 });

    it('extends the scale past the value rather than pinning the mark to the end', () => {
      expect(s.max).toBeGreaterThan(122);
      assertNotAtAnExtremity(s.pct(122));
    });

    it('draws the mark far beyond where the reference range ends', () => {
      // The whole point: the mark and the top of the range must not be in the
      // same place. Before this, both were at 100%.
      expect(s.pct(122) - s.pct(41)).toBeGreaterThan(40);
    });

    it('keeps the reference range a readable region of the scale', () => {
      expect(s.referenceFraction).toBeGreaterThan(0.2);
    });

    it('ends on a number somebody would have chosen', () => {
      // Not 129.79, which is the headroom arithmetic showing through.
      expect(s.max).toBe(140);
      expect(s.min).toBe(0);
    });
  });

  describe('a value well below the lower bound (65 against 125–375)', () => {
    const s = rangeBarScale({ low: 125, high: 375, value: 65 });

    it('puts the mark outside the reference range, on the low side', () => {
      expect(s.pct(65)).toBeLessThan(s.pct(125));
      assertNotAtAnExtremity(s.pct(65));
    });

    it('never places a below-range value inside the drawn range', () => {
      expect(65).toBeLessThan(s.min + (s.max - s.min) * (s.pct(125) / 100));
    });
  });

  it('never clamps a value to an edge, however far out it is drawn', () => {
    for (const value of [0.5, 5, 42, 120, 400, 700]) {
      const s = rangeBarScale({ low: 30, high: 400, value });
      const at = s.pct(value);
      expect(at, `value ${value}`).toBeGreaterThan(0);
      expect(at, `value ${value}`).toBeLessThan(100);
    }
  });

  it('does not draw a scale below zero for a quantity that cannot be negative', () => {
    const s = rangeBarScale({ low: 0, high: 41, value: 3 });
    expect(s.min).toBe(0);
  });

  it('allows a negative scale where the marker legitimately goes negative', () => {
    const s = rangeBarScale({ low: -2, high: 2, value: -6 });
    expect(s.min).toBeLessThan(-6);
    assertNotAtAnExtremity(s.pct(-6));
  });

  it('refuses to draw at all when the reference range would be a sliver', () => {
    // ~70x the top of the range. Nothing honest can be drawn: the caller says
    // where the result sits in words instead.
    const s = rangeBarScale({ low: 0, high: 41, value: 3000 });
    expect(s.outOfScale).toBe(true);
    expect(s.referenceFraction).toBeLessThan(MIN_REFERENCE_FRACTION);
  });

  it('refuses a value that is not a number rather than producing NaN geometry', () => {
    expect(rangeBarScale({ low: 1, high: 2, value: Number.NaN }).outOfScale).toBe(true);
  });

  it('survives a range with no width instead of dividing by it', () => {
    const s = rangeBarScale({ low: 5, high: 5, value: 9 });
    expect(Number.isFinite(s.min)).toBe(true);
    expect(Number.isFinite(s.max)).toBe(true);
    expect(s.max).toBeGreaterThan(s.min);
  });
  /**
   * ── THE OPEN-TOPPED MARKERS, WHICH WERE DRAWN AND SHOULD NOT HAVE BEEN ────
   *
   * eGFR, HDL, the Omega-3 Index and progesterone have no clinical upper bound,
   * and the catalogue writes OPEN_UPPER_BOUND for the ceiling because a
   * reference range here is two numbers. Rule 2 then builds a scale containing
   * 60–999 and puts a healthy eGFR of 97 at 5% of it — a correct picture with a
   * false axis, which is the failure this module exists to end.
   *
   * The value is asserted at the numbers that were measured, so a future change
   * that "improves" the scale back into drawing one fails here rather than on a
   * patient's screen.
   */
  it('refuses an open-topped reference range rather than scaling to the placeholder', () => {
    const s = rangeBarScale({ low: 60, high: OPEN_UPPER_BOUND, value: 97 });
    expect(s.outOfScale).toBe(true);
    expect(s.undrawable).toBe('reference-range-open-ended');
    // And it is still safe to do arithmetic with, like every other refusal.
    expect(Number.isFinite(s.min)).toBe(true);
    expect(s.max).toBeGreaterThan(s.min);
  });

  it('refuses it for the same reason whatever the value is', () => {
    for (const value of [0.3, 1.14, 3.2, Number.NaN]) {
      expect(rangeBarScale({ low: 1.55, high: OPEN_UPPER_BOUND, value }).undrawable).toBe('reference-range-open-ended');
    }
  });

  it('leaves an ordinary range that happens to be wide alone', () => {
    // The refusal is keyed on the declared placeholder, not on "the range is
    // big" — a real 1–1,000,000 interval is still drawn.
    const s = rangeBarScale({ low: 1, high: 1_000_000, value: 500 });
    expect(s.undrawable).toBe(null);
  });
});
