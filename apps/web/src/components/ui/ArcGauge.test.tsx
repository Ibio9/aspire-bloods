import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArcGauge, MiniArcGauge } from './ArcGauge';
import { GAUGE_BOUNDARIES } from '../../lib/rangeScale';

/**
 * =============================================================================
 *  THE ARC GAUGE, ON THE NUMBERS THE RANGE BAR WAS REPORTED WITH.
 * =============================================================================
 *
 * 3.4 against a lab reference range of 3.8–5.8 — a value BELOW its entire range.
 * The instrument has been rebuilt twice around it and the assertions have
 * changed both times, so it is worth being clear which claim is being tested
 * now and which one it replaced.
 *
 *   THE BAR       drew a scale, and the bug was that it PRINTED NOTHING: the
 *                 only figures near the picture were the card's own "Lab
 *                 reference range 3.8–5.8" two lines below, so the mark inside a
 *                 coloured track read as a value inside the range.
 *   THE ARC       drew the same scale bent round, printed its ends, and
 *                 introduced a bug a straight bar cannot have — THE GREEN MOVED.
 *                 An above-range value slid the in-range arc toward the start of
 *                 the ring and a below-range value slid it toward the end, so
 *                 two cards side by side showed the reference zone in two
 *                 different places.
 *   NOW           the ring is FIXED and symmetric. Green central, gold flanking,
 *                 red at both ends, identical on every gauge in the product. The
 *                 mark is placed by WHICH BAND the value is in and where inside
 *                 it, so the colour under the mark always agrees with the word
 *                 beside it.
 *
 * The geometry is asserted in `lib/rangeScale.property.test.ts` over ~5,000
 * generated inputs. What is asserted HERE is what the component renders from it:
 * that the ring really is a constant, that the mark's rotation matches the
 * placement, that the four hairlines are drawn at the four fixed angles, and
 * that a refusal never swallows the reader's own value.
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
 * The mark's position along the arc, 0–1, recovered from its wrapper's rotation.
 *
 * The wrapper is rotated by `screenAngle + 90` — the mark sits at its twelve
 * o'clock, and twelve o'clock is −90° in screen degrees — so undoing that and
 * then the arc's own start and sweep gives back the fraction. Written out rather
 * than read off an attribute so that if this and the component ever disagree,
 * one of the two is wrong and the failure says which.
 */
function markAt(html: string): number {
  const m = html.match(/rotate\(([-\d.]+)deg\)/);
  expect(m, 'the gauge did not render a rotated mark').not.toBeNull();
  return (Number(m![1]) - 90 - ARC_START_DEG) / ARC_SWEEP_DEG;
}

/**
 * Every hairline crossing the ring, as fractions along the arc, sorted.
 *
 * They are radial lines, so the angle is recoverable from the outer endpoint
 * against the centre (50, 50) in the SVG's 0–100 user space. MATCHED ON THE
 * MARKUP AND NOT ON A COLOUR: the bar's version of this used to name a Tailwind
 * class, so when the ticks had to change colour it matched nothing and reported
 * "0 bounds found" rather than "the tick changed colour".
 */
function hairlines(html: string): number[] {
  const lines = [...html.matchAll(/<line\b[^>]*\bx2="([-\d.]+)"[^>]*\by2="([-\d.]+)"[^>]*>/g)];
  return lines
    .map(([, xs, ys]) => {
      let deg = (Math.atan2(Number(ys) - 50, Number(xs) - 50) * 180) / Math.PI;
      // atan2 returns (−180, 180]; the arc runs 135° → 405°, so its second half
      // comes back negative and has to be brought onto the arc's own turn.
      if (deg < ARC_START_DEG) deg += 360;
      return (deg - ARC_START_DEG) / ARC_SWEEP_DEG;
    })
    .sort((a, b) => a - b);
}

/** Every figure the gauge prints, in document order. */
function printedNumbers(html: string): string[] {
  return [...html.matchAll(/<span[^>]*\bclass="numeric[^"]*"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
}

/** The conic gradient the ring is painted with. */
function ringGradientFrom(html: string): string {
  const m = html.match(/conic-gradient\([^;"]*\)/);
  expect(m, 'the gauge did not paint a conic ring').not.toBeNull();
  return m![0];
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE RING IS THE SAME PICTURE ON EVERY GAUGE. This is the whole change.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('the ring', () => {
  const cases = [
    { what: 'a value below its range', props: { value: 3.4, low: 3.8, high: 5.8 }, status: 'LOW' as const },
    { what: 'three times the upper limit', props: { value: 122, low: 0, high: 41 }, status: 'SIGNIFICANT_HIGH' as const },
    { what: 'well below the lower limit', props: { value: 65, low: 125, high: 375 }, status: 'LOW' as const },
    { what: 'squarely in range', props: { value: 4.8, low: 3.8, high: 5.8 }, status: 'IN_RANGE' as const },
    { what: 'a range spanning six orders of magnitude', props: { value: 5, low: 1, high: 1_000_000 }, status: 'IN_RANGE' as const },
  ];

  const gradients = cases.map((c) => ringGradientFrom(renderToStaticMarkup(<ArcGauge {...c.props} status={c.status} />)));

  it('paints byte-identically whatever the value is doing', () => {
    // Not "similar", not "the same stops in the same order" — identical strings.
    // A gauge whose ring is a function of its value is the bug this replaced,
    // and a weaker assertion would pass a version that had crept back toward it.
    for (let i = 1; i < gradients.length; i++) {
      expect(gradients[i], `${cases[i].what} painted a different ring from ${cases[0].what}`).toBe(gradients[0]);
    }
  });

  it('sweeps three quarters of a turn from the lower left, and leaves the last quarter empty', () => {
    // 225° from twelve o'clock, clockwise, is the lower-left corner. The whole
    // reading order of the instrument rests on this one number.
    expect(gradients[0]).toContain('conic-gradient(from 225deg');
    // The gap is a HARD stop rather than a fade — two stops at the same position
    // do not interpolate, which is what keeps the arc from ending in the grey
    // shoulder a fade toward `transparent` would take it through.
    expect(gradients[0]).toContain('75.000%, transparent 75.000%');
    expect(gradients[0]).toContain('transparent 100%');
  });

  it('puts green in the centre, gold either side of it and red at both ends', () => {
    const stops = [...gradients[0].matchAll(/var\(--c-hue-(\w+)-fill\)\)\s+([\d.]+)%/g)].map((m) => ({
      hue: m[1],
      at: Number(m[2]) / 75, // conic percent back to a fraction of the arc
    }));
    expect(stops.length, 'the ring painted no band fills at all').toBeGreaterThan(8);
    const first = stops[0];
    const last = stops[stops.length - 1];
    expect(first.hue, 'the arc does not start in red').toBe('red');
    expect(last.hue, 'the arc does not end in red').toBe('red');
    // The middle of the arc is green, and it is green symmetrically.
    const green = stops.filter((s) => s.hue === 'green').map((s) => s.at);
    expect(green.length, 'there is no green on the ring').toBeGreaterThan(0);
    expect(Math.min(...green)).toBeLessThan(0.5);
    expect(Math.max(...green)).toBeGreaterThan(0.5);
    expect(Math.min(...green) + Math.max(...green), 'the green is not centred').toBeCloseTo(1, 6);
    // Gold flanks it on both sides.
    const gold = stops.filter((s) => s.hue === 'yellow').map((s) => s.at);
    expect(gold.some((a) => a < Math.min(...green)), 'no gold below the green').toBe(true);
    expect(gold.some((a) => a > Math.max(...green)), 'no gold above the green').toBe(true);
  });

  it('carries the five band fills rather than a colour of its own', () => {
    // A literal hex here would mean somebody had reinvented the palette rather
    // than reaching for the tokens the trend chart and both PDFs already use.
    expect(gradients[0]).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(gradients[0]).toMatch(/var\(--c-hue-\w+-fill\)/);
  });

  /**
   * ═══ THE ARC IS OPAQUE, AND THAT IS WHY THE GOLD IS THE SAME GOLD IN BOTH
   *     THEMES (Aug 2026) ═════════════════════════════════════════════════
   *
   * The five fills are byte-identical across the themes and always have been —
   * `tokenContrast.test.ts` asserts it at the token layer. What made dark's gold
   * read as a muddy dark yellow was that the MASK feathered a quarter of the
   * ring's width, so a quarter of it was composited against the card: toward
   * near-black in dark, toward cream in light. One colour, two grounds, opposite
   * results, and no re-solve of the hue could have reached it.
   *
   * So what is asserted here is the thing the token test cannot see: that
   * nothing between the token and the pixel introduces an alpha. Every one of
   * these has been a real bug in this component or in the tokens it reads.
   */
  /**
   * The ring's inline style, with the two entities `renderToStaticMarkup`
   * introduces put back. `style` is an ATTRIBUTE in static markup, so an
   * apostrophe inside the mask's data URI arrives as `&#x27;` — which the
   * browser un-escapes when it parses the attribute, and which React never
   * produces at all on the client, where the style is set as a DOM property.
   * Asserting against the escaped form would be asserting about the test
   * harness.
   */
  const ringStyle = (html: string): string => {
    const m = html.match(/class="arc-gauge__ring[^"]*"[^>]*style="([^"]*)"/);
    expect(m, 'the gauge did not render a ring element').not.toBeNull();
    return m![1].replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  };

  it('paints the arc fully opaque — no alpha, no blend, no filter, anywhere on it', () => {
    const style = ringStyle(renderToStaticMarkup(<ArcGauge value={4.8} low={3.8} high={5.8} status="IN_RANGE" />));
    // `rgb(var(--x) / 0.4)` and `rgba(…)` are the two ways a token gets an alpha
    // put on it at a call site. Neither belongs on this element.
    expect(style, 'a gradient stop carries an alpha').not.toMatch(/rgba\(/);
    expect(style, 'a gradient stop carries a slash alpha').not.toMatch(/var\(--c-hue-\w+-fill\)\s*\/\s*[\d.]/);
    expect(style, 'the arc carries an opacity').not.toMatch(/(^|[;\s])opacity:/);
    expect(style, 'the arc carries a blend mode').not.toMatch(/mix-blend|mixBlend|background-blend/);
    expect(style, 'the arc carries a filter').not.toMatch(/filter:/);
  });

  /**
   * ═══ THE RAMP IS INTERPOLATED PERCEPTUALLY (Aug 2026) ══════════════════
   *
   * Green met yellow through a dull olive, and after the yellow itself was
   * replaced it STILL did — because the dip is a property of the interpolation
   * space rather than of either endpoint. A straight line between two sRGB
   * points passes through the middle of the cube and the middle of the cube is
   * grey.
   *
   * Two things answer it and the test holds both, because either alone is
   * weaker than it looks: the hinge STOPS are OKLCH midpoints (asserted in
   * tokenContrast.test.ts, where the hexes are), and the gradient BETWEEN the
   * stops is interpolated `in oklch` where the browser can. The sRGB string is
   * the fallback and must still be emitted — `background: var(--x)` resolving
   * to something unparseable falls back to the property's INITIAL value, not to
   * the previous declaration, so a single oklch-only paint is an invisible
   * gauge on every browser that cannot read it.
   */
  it('offers both a perceptual ramp and an sRGB fallback, with identical stops', () => {
    const html = renderToStaticMarkup(<ArcGauge value={4.8} low={3.8} high={5.8} status="IN_RANGE" />);
    const style = ringStyle(html);
    const srgb = style.match(/--ring-paint:\s*(conic-gradient\([^;"]*\))/);
    const oklch = style.match(/--ring-paint-oklch:\s*(conic-gradient\([^;"]*\))/);
    expect(srgb, 'the sRGB fallback ramp is not emitted').not.toBeNull();
    expect(oklch, 'the perceptual ramp is not emitted').not.toBeNull();
    expect(oklch![1]).toContain('conic-gradient(in oklch from');
    expect(srgb![1], 'the fallback is not plain sRGB').not.toContain('in oklch');
    // ONE STOP LIST. The two differ by the interpolation keyword and by nothing
    // else — two hand-maintained ramps would drift, and the one that drifted
    // would be the one almost nobody renders.
    expect(oklch![1].replace('in oklch ', '')).toBe(srgb![1]);
    // The paint reaches the element as a custom property so `@supports` in
    // globals.css can choose between them; an inline `background` could not be
    // overridden by a stylesheet without `!important`.
    expect(style, 'the ring paints from an inline background again').not.toMatch(/(^|;)\s*background:/);
  });

  it('cuts the annulus with a stroked circle rather than a feathered radial', () => {
    // THE MEASUREMENT THIS REPLACED: `radial-gradient(… transparent 84.87%, #000
    // 87.44%, #000 99%, transparent 100%)` ramped over 2.57 points of radius at
    // the inner edge and 1 at the outer — 1.8px and 0.7px of partial alpha on a
    // 9.7px ring at the card size, i.e. 26% of the band. A stroked circle has
    // the browser's own sub-pixel geometric antialiasing at the boundary and a
    // fully opaque interior.
    const style = ringStyle(renderToStaticMarkup(<ArcGauge value={4.8} low={3.8} high={5.8} status="IN_RANGE" />));
    expect(style, 'the ring mask is a gradient again').not.toMatch(/mask-image:[^;]*radial-gradient/i);
    expect(style).toMatch(/mask-image:\s*url\("data:image\/svg\+xml/i);
    expect(style, 'the mask is not a stroke').toMatch(/circle/);
    expect(style, 'the mask stroke is not opaque white').toMatch(/stroke='%23ffffff'/);
    expect(style, 'the mask has a fill, so it is a disc rather than a ring').toMatch(/fill='none'/);
    // Laid out against the element rather than an intrinsic size the SVG does
    // not declare — an auto-sized mask is a mask that can be the wrong radius.
    expect(style).toMatch(/mask-size:\s*100% 100%/);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE MARK IS IN THE BAND ITS OWN STATUS NAMES.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('the mark', () => {
  it('draws a below-range result in the low gold, left of the green', () => {
    const at = markAt(renderToStaticMarkup(<MiniArcGauge {...REPORTED} status="LOW" />));
    expect(at).toBeGreaterThan(GAUGE_BOUNDARIES.lowThreshold);
    expect(at).toBeLessThan(GAUGE_BOUNDARIES.low);
  });

  it('draws three times the upper limit in the right-hand red, and not at the end of the arc', () => {
    const at = markAt(renderToStaticMarkup(<MiniArcGauge value={122} low={0} high={41} status="SIGNIFICANT_HIGH" />));
    expect(at).toBeGreaterThan(GAUGE_BOUNDARIES.highThreshold);
    // NEVER CLAMPED. The outer bands are unbounded in value and finite in angle,
    // so the placement saturates toward the end and never arrives — a mark
    // pinned to the end has stopped carrying information.
    expect(at).toBeLessThan(1);
  });

  /**
   * ⚠ THE THRESHOLD IS EXPLICIT HERE ON PURPOSE. 65 against 125–375 is LOW and
   * not significantly low: the default severity threshold is 1.5× the range's
   * own WIDTH, which for a 250-wide range is 375, so significantly-low does not
   * begin until −250. That surprised this test into being written wrongly first
   * time, which is exactly the kind of thing a marker's own `severityThreshold`
   * exists to correct — so this passes one, as a real marker with a narrow band
   * would.
   */
  it('draws a value below its entire range in the left-hand red', () => {
    const at = markAt(
      renderToStaticMarkup(
        <MiniArcGauge value={65} low={125} high={375} severityThreshold={30} status="SIGNIFICANT_LOW" />,
      ),
    );
    expect(at).toBeLessThan(GAUGE_BOUNDARIES.lowThreshold);
    expect(at).toBeGreaterThan(0);
  });

  it('draws the middle of the range at the middle of the arc', () => {
    const at = markAt(renderToStaticMarkup(<MiniArcGauge value={4.8} low={3.8} high={5.8} status="IN_RANGE" />));
    expect(at).toBeCloseTo(0.5, 6);
  });

  it('does not sweep on a card — a grid of 165 of these is not an animation', () => {
    const html = renderToStaticMarkup(<MiniArcGauge {...REPORTED} status="LOW" />);
    expect(html).not.toContain('transition-transform');
  });

  it('sweeps from the centre of the green on the full gauge', () => {
    // Server markup is the pre-mount frame. It rests at the middle of the ring
    // rather than at the midpoint of two bounds, which on a fixed ring is the
    // same place on every card — so a grid of them settles together.
    const html = renderToStaticMarkup(<ArcGauge {...REPORTED} status="LOW" unit="mmol/L" />);
    expect(html).toContain('transition-transform');
    expect(markAt(html)).toBeCloseTo(0.5, 6);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE HAIRLINES, AND THE TWO FIGURES THAT SURVIVED.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('the boundaries', () => {
  const html = renderToStaticMarkup(<ArcGauge {...REPORTED} status="LOW" unit="mmol/L" />);

  it('marks all four boundaries, at the four fixed angles', () => {
    expect(hairlines(html)).toEqual([
      expect.closeTo(GAUGE_BOUNDARIES.lowThreshold, 6),
      expect.closeTo(GAUGE_BOUNDARIES.low, 6),
      expect.closeTo(GAUGE_BOUNDARIES.high, 6),
      expect.closeTo(GAUGE_BOUNDARIES.highThreshold, 6),
    ]);
  });

  /**
   * TWO FIGURES, NOT FOUR. The two ends of the arc used to be printed because the
   * ring WAS a number line; they now mean "significantly below" and
   * "significantly above", which are states rather than quantities, so a figure
   * at each end would label a position that no longer corresponds to it.
   */
  it('prints the two reference bounds and nothing else', () => {
    expect(printedNumbers(html)).toEqual(['3.8', '5.8']);
  });

  it('prints no figures at all on a card', () => {
    // The card states its reference range in words two lines below, and two
    // figures round a 176px arc sit closer to the value in the middle than to
    // the hairlines they would be naming.
    expect(printedNumbers(renderToStaticMarkup(<MiniArcGauge {...REPORTED} status="LOW" />))).toEqual([]);
    // The hairlines stay, so the boundary is still marked and still findable
    // with the colour taken away.
    expect(hairlines(renderToStaticMarkup(<MiniArcGauge {...REPORTED} status="LOW" />))).toHaveLength(4);
  });
});

describe('what it says when it cannot draw', () => {
  it('names the result, the range and the status for a screen reader', () => {
    const html = renderToStaticMarkup(<MiniArcGauge {...REPORTED} status="LOW" />);
    expect(html).toContain('aria-label="Result 3.4, reference range 3.8–5.8, status: Below range"');
  });

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

  it('refuses an open-topped range rather than drawing against a sentinel', () => {
    const html = renderToStaticMarkup(<MiniArcGauge value={97} low={60} high={999} status="IN_RANGE" />);
    expect(html).toContain('No upper limit to draw a scale against');
  });

  /**
   * ⚠ AND "TOO FAR OUT TO DRAW TO SCALE" IS NO LONGER A REFUSAL.
   *
   * It existed because a value twenty times the width of its own range squeezed
   * the reference band into a sliver of a numeric axis, and a band you cannot
   * see is not a scale. A fixed ring has no such failure mode — the green is a
   * third of the arc whatever the value does — so the case that used to be
   * refused in words is now simply DRAWN, in the right band.
   */
  it('draws a result that used to be too far out to place at all', () => {
    const html = renderToStaticMarkup(<MiniArcGauge value={3000} low={0} high={41} status="SIGNIFICANT_HIGH" />);
    expect(html).not.toContain('Too far outside the range');
    expect(html).toContain('conic-gradient');
    expect(markAt(html)).toBeGreaterThan(GAUGE_BOUNDARIES.highThreshold);
    expect(markAt(html)).toBeLessThan(1);
  });

  /**
   * ⚠ THE VALUE IS INSIDE THE GAUGE, so a refusal that dropped its children
   * would drop the reader's own result off the card along with the picture of
   * it. The refusal is about the SCALE and never about the number.
   */
  it('still prints the value when it refuses to draw a scale for it', () => {
    const html = renderToStaticMarkup(
      <MiniArcGauge value={97} low={60} high={999} status="IN_RANGE">
        <p className="numeric">97</p>
      </MiniArcGauge>,
    );
    expect(html).toContain('No upper limit to draw a scale against');
    expect(html).toContain('97');
  });

  it('prints only the figures that exist on the full gauge', () => {
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
