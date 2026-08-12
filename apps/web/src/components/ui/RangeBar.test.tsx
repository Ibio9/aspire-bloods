import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MiniRangeBar, RangeBar } from './RangeBar';

/**
 * =============================================================================
 *  THE CARD BAR, WITH THE NUMBERS IT WAS REPORTED WITH.
 * =============================================================================
 *
 * 3.4 against a lab reference range of 3.8–5.8. The scale derivation had been
 * fixed and was right — it draws 2 to 8 with the mark at 23% and the range from
 * 30% to 63% — and the bar on the card was still wrong, because the card bar
 * PRINTED NOTHING. The only figures anywhere near it were the card's own "Lab
 * reference range 3.8–5.8" two lines below, so the bar read as though it ran
 * from 3.8 to 5.8 and the mark inside its coloured track read as a value inside
 * the range. It is below the entire range.
 *
 * Which is why this is asserted at the COMPONENT and not at the scale: every
 * assertion the scale could make was already passing.
 *
 * Rendered through `react-dom/server` rather than a DOM: the positions are all
 * inline styles and the labels are all text, so static markup carries the whole
 * of what is being asserted, and it needs no jsdom and no testing-library in a
 * dependency tree this product keeps deliberately short.
 */

const REPORTED = { value: 3.4, low: 3.8, high: 5.8 } as const;

/** Every `left:` percentage in the markup, in document order. */
function leftsIn(html: string): number[] {
  return [...html.matchAll(/left:\s*([-\d.]+)%/g)].map((m) => Number(m[1]));
}

/**
 * The two reference-bound hairlines on the track. They are the only elements
 * carrying that exact class, and they sit at pct(low) and pct(high) — so the
 * in-range region is the span between them.
 */
function referenceBoundMarks(html: string): number[] {
  return [...html.matchAll(/class="absolute inset-y-0 w-px bg-espresso\/60"\s+style="left:\s*([-\d.]+)%/g)].map((m) =>
    Number(m[1]),
  );
}

/**
 * Every figure the bar prints, in document order. `[^>]*` after the class,
 * because a positioned label carries a `style` attribute after it and a regex
 * that insists on `">` finds only the labels that do not move — which is every
 * reference bound and no scale end at all, i.e. exactly the wrong half.
 */
function printedNumbers(html: string): string[] {
  return [...html.matchAll(/<span class="numeric[^"]*"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
}

describe('MiniRangeBar — the card bar, 3.4 against 3.8–5.8', () => {
  const html = renderToStaticMarkup(<MiniRangeBar {...REPORTED} status="LOW" />);
  const printed = printedNumbers(html);
  const bounds = referenceBoundMarks(html);
  // The pointer is the first positioned element in the markup, above the track.
  const markAt = leftsIn(html)[0];

  it('prints the ends of the scale it actually drew, and they are not the reference bounds', () => {
    expect(printed).toHaveLength(2);
    expect(printed).not.toContain('3.8');
    expect(printed).not.toContain('5.8');
  });

  it('prints ends that contain the reference range rather than being it', () => {
    const [minLabel, maxLabel] = printed.map(Number);
    expect(minLabel).toBeLessThan(3.8);
    expect(maxLabel).toBeGreaterThan(5.8);
    // And the value, which is the whole reason the scale is wider than the range.
    expect(minLabel).toBeLessThan(3.4);
  });

  it('draws the mark left of the in-range region', () => {
    expect(bounds).toHaveLength(2);
    const [inRangeFrom, inRangeTo] = bounds;
    expect(markAt).toBeLessThan(inRangeFrom);
    expect(inRangeFrom).toBeLessThan(inRangeTo);
  });

  it('draws the mark on the scale it printed, at the value it was given', () => {
    const [minLabel, maxLabel] = printed.map(Number);
    expect(markAt).toBeCloseTo(((3.4 - minLabel) / (maxLabel - minLabel)) * 100, 9);
  });

  it('names the result, the range and the status for a screen reader', () => {
    expect(html).toContain('aria-label="Result 3.4, reference range 3.8–5.8, status: Below range"');
  });
});

describe('MiniRangeBar — what it does with what it cannot draw', () => {
  it('says there is no reference range rather than drawing one', () => {
    const html = renderToStaticMarkup(<MiniRangeBar value={3.4} low={null} high={5.8} status="LOW" />);
    expect(html).toContain('No reference range to draw against');
    expect(html).not.toContain('%');
  });

  it('says a range with no width is not one', () => {
    const html = renderToStaticMarkup(<MiniRangeBar value={9} low={5} high={5} status="IN_RANGE" />);
    expect(html).toContain('No reference range to draw against');
  });

  it('says there is no numeric value rather than placing NaN', () => {
    const html = renderToStaticMarkup(<MiniRangeBar value={null} low={3.8} high={5.8} status="LOW" />);
    expect(html).toContain('No numeric value to place on a scale');
    expect(html).not.toContain('NaN');
  });

  it('says a result too far out cannot be drawn to scale', () => {
    const html = renderToStaticMarkup(<MiniRangeBar value={3000} low={0} high={41} status="SIGNIFICANT_HIGH" />);
    expect(html).toContain('Too far outside the range to draw to scale');
  });
});

describe('RangeBar — the full bar, on the same numbers', () => {
  const html = renderToStaticMarkup(<RangeBar {...REPORTED} status="LOW" unit="mmol/L" />);
  const printed = printedNumbers(html);
  const bounds = referenceBoundMarks(html);

  it('prints four figures: the two scale ends and the two reference bounds within them', () => {
    expect(printed).toContain('3.8');
    expect(printed).toContain('5.8');
    const ends = printed.filter((p) => p !== '3.8' && p !== '5.8').map(Number);
    expect(ends).toHaveLength(2);
    expect(Math.min(...ends)).toBeLessThan(3.4);
    expect(Math.max(...ends)).toBeGreaterThan(5.8);
  });

  it('marks the reference bounds inside the scale rather than at its ends', () => {
    expect(bounds).toHaveLength(2);
    for (const at of bounds) {
      expect(at).toBeGreaterThan(0);
      expect(at).toBeLessThan(100);
    }
  });

  it('names each reason in words instead of drawing, and prints only the figures that exist', () => {
    const noValue = renderToStaticMarkup(<RangeBar value={null} low={3.8} high={5.8} status="LOW" unit="mmol/L" />);
    expect(noValue).toContain('no numeric value');
    expect(noValue).toContain('3.8–5.8 mmol/L');
    expect(noValue).not.toContain('NaN');

    const noRange = renderToStaticMarkup(<RangeBar value={3.4} low={null} high={null} status="LOW" unit="mmol/L" />);
    expect(noRange).toContain('no two-sided reference range');
    expect(noRange).toContain('3.4 mmol/L');
    expect(noRange).not.toContain('–');
  });
});
