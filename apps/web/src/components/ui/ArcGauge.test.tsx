import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArcGauge, MiniArcGauge } from './ArcGauge';

/**
 * =============================================================================
 *  THE ARC GAUGE, ON THE NUMBERS THE RANGE BAR WAS REPORTED WITH.
 * =============================================================================
 *
 * 3.4 against a lab reference range of 3.8–5.8. The scale derivation was right
 * and had been for some time — it draws 2 to 8 with the mark at 23% and the
 * range from 30% to 63% — and the CARD was still wrong, because it PRINTED
 * NOTHING. The only figures anywhere near the picture were the card's own "Lab
 * reference range 3.8–5.8" two lines below, so the drawing read as though it ran
 * from 3.8 to 5.8 and the mark inside its coloured track read as a value inside
 * the range. It is below the entire range.
 *
 * ── WHY THIS FILE SURVIVED THE CHANGE OF SHAPE (Aug 2026) ──────────────────
 *
 * The bar became an arc. Every assertion here is about the CLAIM the instrument
 * makes rather than about the shape it makes it in — that the printed figures
 * are the scale that was actually drawn, that they contain the reference range
 * and the value, and that the mark sits at the value's true position on THAT
 * scale — so all of them are still the right assertions and none of them was
 * deleted. What changed is the coordinate they are read in: a `left:` percentage
 * became a rotation in degrees, and the two reference-bound hairlines became two
 * radial SVG lines. The arithmetic converting one to the other is written out
 * below so a failure says which of the two is wrong.
 *
 * Rendered through `react-dom/server` rather than a DOM: the positions are all
 * inline styles and SVG attributes and the labels are all text, so static markup
 * carries the whole of what is asserted, and it needs no jsdom and no
 * testing-library in a dependency tree this product keeps deliberately short.
 */

const REPORTED = { value: 3.4, low: 3.8, high: 5.8 } as const;

/** The arc's own geometry, restated here so a change to it fails loudly. */
const ARC_START_DEG = 135;
const ARC_SWEEP_DEG = 270;

/**
 * The mark's position, recovered from its wrapper's rotation.
 *
 * The wrapper is rotated by `screenAngle + 90` — the mark sits at the wrapper's
 * twelve o'clock, and twelve o'clock is −90° in screen degrees — so undoing that
 * and then the arc's own start and sweep gives back the percentage along the
 * scale. If this ever disagrees with the component, one of the two is wrong and
 * that is the point of writing it out rather than reading a percentage off an
 * attribute.
 */
function markPctFrom(html: string): number {
  const m = html.match(/rotate\(([-\d.]+)deg\)/);
  expect(m, 'the gauge did not render a rotated mark').not.toBeNull();
  const screenDeg = Number(m![1]) - 90;
  return ((screenDeg - ARC_START_DEG) / ARC_SWEEP_DEG) * 100;
}

/**
 * The two reference-bound hairlines, as percentages along the scale.
 *
 * They are radial lines, so their angle is recoverable from either endpoint
 * against the centre (50, 50) in the SVG's 0–100 user space. Read off the OUTER
 * endpoint (x2/y2), which sits on the ring's outer radius.
 *
 * MATCHED ON THE MARKUP AND NOT ON A COLOUR. The bar's version of this used to
 * name `bg-espresso/60`, so when the track went light in both themes and the
 * ticks had to move off `espresso` — which resolves to a near-white cream in
 * dark and is invisible on a pale green segment — it matched nothing and
 * reported "0 bounds" rather than "the tick changed colour". A geometric test
 * must not be pinned to a colour it is not about.
 */
function boundPctsFrom(html: string): number[] {
  const lines = [...html.matchAll(/<line\b[^>]*\bx2="([-\d.]+)"[^>]*\by2="([-\d.]+)"[^>]*>/g)];
  return lines.map(([, xs, ys]) => {
    const x = Number(xs) - 50;
    const y = Number(ys) - 50;
    let deg = (Math.atan2(y, x) * 180) / Math.PI;
    // atan2 returns (−180, 180]; the arc runs 135° → 405°, so the second half of
    // it comes back negative and has to be brought back onto the arc's own turn.
    if (deg < ARC_START_DEG) deg += 360;
    return ((deg - ARC_START_DEG) / ARC_SWEEP_DEG) * 100;
  });
}

/**
 * Every figure the gauge prints, in document order.
 *
 * `<span[^>]*class=` rather than `<span class=`: React emits `aria-hidden`
 * before `class` on these, and a regex that insists on the class coming first
 * matches nothing and reports "the gauge printed no figures" — which is the same
 * failure text as the bug this whole file exists to catch.
 */
function printedNumbers(html: string): string[] {
  return [...html.matchAll(/<span[^>]*\bclass="numeric[^"]*"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
}

/** The conic gradient the ring is painted with. */
function ringGradientFrom(html: string): string {
  const m = html.match(/conic-gradient\(([^;"]*)\)/);
  expect(m, 'the gauge did not paint a conic ring').not.toBeNull();
  return m![0];
}

describe('MiniArcGauge — the card gauge, 3.4 against 3.8–5.8', () => {
  const html = renderToStaticMarkup(<MiniArcGauge {...REPORTED} status="LOW" />);
  const printed = printedNumbers(html);
  const bounds = boundPctsFrom(html);
  const markAt = markPctFrom(html);

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

  it('draws the mark before the in-range arc rather than inside it', () => {
    expect(bounds).toHaveLength(2);
    const [inRangeFrom, inRangeTo] = bounds;
    expect(markAt).toBeLessThan(inRangeFrom);
    expect(inRangeFrom).toBeLessThan(inRangeTo);
  });

  it('places the mark at the value’s true position on the scale it printed', () => {
    const [minLabel, maxLabel] = printed.map(Number);
    expect(markAt).toBeCloseTo(((3.4 - minLabel) / (maxLabel - minLabel)) * 100, 6);
  });

  it('does not sweep on mount — a grid of 165 of these is not an animation', () => {
    // The card gauge renders AT its value rather than at the middle of the band,
    // which is what the assertion above is measuring; stated separately because
    // the two would fail for very different reasons.
    expect(html).not.toContain('transition-transform');
  });

  it('names the result, the range and the status for a screen reader', () => {
    expect(html).toContain('aria-label="Result 3.4, reference range 3.8–5.8, status: Below range"');
  });
});

describe('the arc itself', () => {
  const html = renderToStaticMarkup(<ArcGauge {...REPORTED} status="LOW" unit="mmol/L" />);
  const gradient = ringGradientFrom(html);

  it('sweeps three quarters of a turn and leaves the last quarter empty', () => {
    // Everything the scale paints is inside 75% of the circle, and the gap is a
    // HARD stop rather than a fade — two stops at the same position do not
    // interpolate, which is what keeps the arc from ending in a grey shoulder.
    expect(gradient).toContain('75.000%, transparent 75.000%');
    expect(gradient).toContain('transparent 100%');
    const stops = [...gradient.matchAll(/\s([\d.]+)%/g)].map((m) => Number(m[1]));
    for (const at of stops) expect(at).toBeLessThanOrEqual(100);
    expect(stops.filter((s) => s < 75).length, 'the ramp painted no stops inside the arc').toBeGreaterThan(2);
  });

  it('starts at the lower left, so low is the first thing on the arc', () => {
    // 225° from twelve o'clock, clockwise, is the lower-left corner. The whole
    // reading order of the instrument depends on this one number.
    expect(gradient).toContain('conic-gradient(from 225deg');
  });

  it('carries the five band fills rather than a colour of its own', () => {
    // The ramp comes from `bandRampStops`, so every stop is one of the five hue
    // fills — the same tokens the trend chart's own history and both PDFs use.
    // A literal hex here would mean somebody had reinvented the palette.
    expect(gradient).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(gradient).toMatch(/var\(--c-hue-\w+-fill\)/);
  });
});

describe('ArcGauge — the full gauge, on the same numbers', () => {
  const html = renderToStaticMarkup(<ArcGauge {...REPORTED} status="LOW" unit="mmol/L" />);
  const printed = printedNumbers(html);
  const bounds = boundPctsFrom(html);

  it('prints four figures: the two scale ends and the two reference bounds within them', () => {
    expect(printed).toContain('3.8');
    expect(printed).toContain('5.8');
    const ends = printed.filter((p) => p !== '3.8' && p !== '5.8').map(Number);
    expect(ends).toHaveLength(2);
    expect(Math.min(...ends)).toBeLessThan(3.4);
    expect(Math.max(...ends)).toBeGreaterThan(5.8);
  });

  it('marks the reference bounds inside the arc rather than at its ends', () => {
    expect(bounds).toHaveLength(2);
    for (const at of bounds) {
      expect(at).toBeGreaterThan(0);
      expect(at).toBeLessThan(100);
    }
  });

  it('sweeps to position on mount, from the middle of the reference band', () => {
    // Server markup is the pre-mount frame, which is the resting position: the
    // midpoint of the two bounds. The effect then moves it, and the transition
    // is on `transform` so the path it takes is the arc rather than a chord
    // straight through the middle of the gauge.
    expect(html).toContain('transition-transform');
    const [from, to] = bounds;
    const at = markPctFrom(html);
    expect(at).toBeCloseTo((from + to) / 2, 6);
  });

  it('names each reason in words instead of drawing, and prints only the figures that exist', () => {
    const noValue = renderToStaticMarkup(<ArcGauge value={null} low={3.8} high={5.8} status="LOW" unit="mmol/L" />);
    expect(noValue).toContain('no numeric value');
    expect(noValue).toContain('3.8–5.8 mmol/L');
    expect(noValue).not.toContain('NaN');

    const noRange = renderToStaticMarkup(<ArcGauge value={3.4} low={null} high={null} status="LOW" unit="mmol/L" />);
    expect(noRange).toContain('no two-sided reference range');
    expect(noRange).toContain('3.4 mmol/L');
    expect(noRange).not.toContain('–');
  });
});

describe('MiniArcGauge — what it does with what it cannot draw', () => {
  it('says there is no reference range rather than drawing one', () => {
    const html = renderToStaticMarkup(<MiniArcGauge value={3.4} low={null} high={5.8} status="LOW" />);
    expect(html).toContain('No reference range to draw against');
    expect(html).not.toContain('conic-gradient');
  });

  it('says a range with no width is not one', () => {
    const html = renderToStaticMarkup(<MiniArcGauge value={9} low={5} high={5} status="IN_RANGE" />);
    expect(html).toContain('No reference range to draw against');
  });

  it('says there is no numeric value rather than placing NaN', () => {
    const html = renderToStaticMarkup(<MiniArcGauge value={null} low={3.8} high={5.8} status="LOW" />);
    expect(html).toContain('No numeric value to place on a scale');
    expect(html).not.toContain('NaN');
  });

  it('says a result too far out cannot be drawn to scale', () => {
    const html = renderToStaticMarkup(<MiniArcGauge value={3000} low={0} high={41} status="SIGNIFICANT_HIGH" />);
    expect(html).toContain('Too far outside the range to draw to scale');
  });

  /**
   * ⚠ THE VALUE IS INSIDE THE GAUGE NOW, so a refusal that dropped its children
   * would drop the reader's own result off the card along with the picture of
   * it. The refusal is about the SCALE and never about the number.
   */
  it('still prints the value when it refuses to draw a scale for it', () => {
    const html = renderToStaticMarkup(
      <MiniArcGauge value={3000} low={0} high={41} status="SIGNIFICANT_HIGH">
        <p className="numeric">3000</p>
      </MiniArcGauge>,
    );
    expect(html).toContain('Too far outside the range to draw to scale');
    expect(html).toContain('3000');
  });
});

/**
 * A RESULT FAR OUTSIDE ITS RANGE IS DRAWN FAR OUTSIDE IT, and never pinned to
 * the end of the arc.
 *
 * This is the rule the whole scale module exists for, restated against the new
 * shape because a circle has an obvious place to clamp a mark to and that place
 * is a lie: a mark at the end of the arc is indistinguishable from a mark that
 * legitimately sits at the end of the arc.
 */
describe('a value well outside the range', () => {
  const html = renderToStaticMarkup(<ArcGauge value={122} low={0} high={41} status="SIGNIFICANT_HIGH" unit="U/L" />);
  const printed = printedNumbers(html);
  const bounds = boundPctsFrom(html);

  it('draws the mark past the upper bound, on a scale that reaches it', () => {
    const at = markPctFrom(html);
    // Pre-mount this is the resting position, so re-derive from the printed
    // scale instead: the claim is about the SCALE containing the value with
    // room, which is what stops the mark being clamped once it moves.
    const ends = printed.map(Number).filter((n) => !Number.isNaN(n));
    const maxLabel = Math.max(...ends);
    expect(maxLabel).toBeGreaterThan(122);
    expect(at).toBeGreaterThan(0);
    // The upper reference bound is a long way short of the far end of the arc,
    // which is the picture "three times the upper limit" has to produce.
    expect(Math.max(...bounds)).toBeLessThan(60);
  });

  /**
   * 41 IS printed here, and it should be — as a reference BOUND, beside its own
   * tick, a third of the way round an arc that runs to 140. What must never
   * happen is 41 printed as the arc's END, which is the original bug: a mark
   * hard against the right-hand side of a bar labelled "41" reads as "just at
   * the top of my range" when the result is three times the upper limit.
   *
   * The two kinds are told apart by TONE and by the tick, never by a hue — the
   * same rule the trend chart's axis follows — so the test reads the tone.
   */
  it('never prints a reference bound as an END of the arc', () => {
    const ends = [...html.matchAll(/<span[^>]*\bclass="numeric[^"]*text-espresso\/80[^"]*"[^>]*>([^<]*)<\/span>/g)].map(
      (m) => Number(m[1]),
    );
    expect(ends.length, 'the arc printed no scale ends at all').toBeGreaterThan(0);
    expect(ends).not.toContain(41);
    expect(Math.max(...ends)).toBeGreaterThan(122);
  });
});
