import { describe, it, expect } from 'vitest';
import {
  themeTokens,
  contrastRatio,
  WCAG_AA_TEXT,
  WCAG_AA_LARGE_TEXT,
  status,
  statusTint,
  hueTint,
  chart,
  solveTokens,
  BAND_CONTRAST,
  BAND_RUNG,
  bandChromaCeiling,
  BAND_CHROMA_SHARE,
  statusHue,
  CONTRAST_AT_BOUND,
  CONTRAST_AT_THRESHOLD,
  NO_STATUS_PAINT,
  PANEL_WASH_ALPHA,
  PANEL_SHEEN,
  GLASS,
  GLOW,
  SPARK,
  accent,
  accentScales,
  darkAccentScales,
  brand,
  oklchMix,
  type StatusKey,
} from '@aspire-bloods/shared';

/**
 * The contrast claims in tokens.ts, checked rather than asserted.
 *
 * Dark mode doubled the number of colour pairs in the system, and every one of
 * them was derived by a mix() rather than picked by eye — which is exactly the
 * situation where a plausible-looking value quietly fails AA. So the pairs that
 * actually appear on screen are enumerated here and measured.
 *
 * Two thresholds, per WCAG 2.2:
 *   4.5:1 for body text
 *   3:1   for large text, icons, borders that carry meaning, and UI components
 *
 * Borders that are purely decorative (taupe hairlines, gridlines) are excluded
 * on purpose: they are not the sole carrier of anything, and holding a divider
 * to 3:1 would mean drawing every card outline in a colour that fights the
 * content inside it.
 */

const MODES = ['light', 'dark'] as const;

/**
 * Every hue that lands on a band, and the rung of the ladder it is drawn at.
 *
 * The three STATES take their own band's rung. The two HINGES — olive at a
 * reference bound, orange at a significantly-out threshold — are drawn at the
 * MIDPOINT of the two bands they join, because each is the middle stop of a
 * blend centred on its own boundary. Measuring a hinge at the heavier
 * neighbour's rung (which is what this used to do for orange) measures a colour
 * that is never on screen.
 *
 * THE RUNG IS A CONTRAST RATIO NOW, NOT AN ALPHA (Aug 2026). A band used to be
 * the `plot` hue composited at `BAND_WEIGHT`, so every measurement below had to
 * blend the token against a surface before it could say anything. A band is an
 * opaque fill now — `--c-hue-*-fill` is what lands on screen — and the ladder
 * is the distance each fill stands off the surface it is drawn on. So the
 * numbers here are targets to check against rather than alphas to composite
 * with, and every measurement below reads the token directly.
 */
const BAND_HUES = ['green', 'olive', 'yellow', 'orange', 'red'] as const;

/**
 * The three that are SOLVED, and the two that are DERIVED.
 *
 * A hinge is the exact RGB midpoint of the two fills either side of it, so it
 * cannot also be solved to a rung: an RGB midpoint is not a contrast midpoint
 * (WCAG luminance is not linear in RGB), and asserting it against a separately
 * computed target would be asserting that it is. What has to hold for a hinge
 * is that it IS the midpoint and that it lands between its neighbours — which
 * is what a blend centred on a boundary means and what the test below checks.
 */
const BAND_STATES = ['green', 'yellow', 'red'] as const;
const BAND_HINGES = [
  ['olive', 'green', 'yellow'],
  ['orange', 'yellow', 'red'],
] as const;

/**
 * ONE SURFACE, IN BOTH THEMES (Aug 2026).
 *
 * A band fill is drawn on the chart's plot panel and on a range bar's track,
 * and since the plot went light in both themes those are the same colour: the
 * bar is drawn on the plot surface too, so the two instruments genuinely share
 * a ground.
 *
 * The GEOMETRIC MEAN this used to take is gone with the second surface it was
 * averaging. It existed because the card and the plot were different distances
 * apart in the two themes, and solving against either alone let the other
 * instrument's bands drift a third between themes. There is nothing left to
 * average, and averaging a band against the CARD now would be measuring it
 * against a surface it is never drawn on.
 */
function bandRung(mode: (typeof MODES)[number], hue: string): number {
  return contrastRatio(tone(mode, `--c-hue-${hue}-fill`), tone(mode, '--c-chart-plot-surface'));
}

/**
 * What the ONE saturation cap (`BAND_FILL_SAT_CAP = 0.6`) produced, measured in
 * OKLab chroma before it was replaced. The floor every band now has to beat.
 */
const SINGLE_CAP_CHROMA = {
  light: { green: 0.0915, yellow: 0.1242, red: 0.1037 },
  dark: { green: 0.0696, yellow: 0.0727, red: 0.1412 },
} as const;

function tone(mode: (typeof MODES)[number], name: string): string {
  const hex = themeTokens[mode][name];
  if (!hex) throw new Error(`no such token: ${name} (${mode})`);
  return hex;
}

/**
 * THE sRGB MIDPOINT, kept only so the hinge test can assert the tokens are NOT
 * it. See "puts each hinge exactly halfway": a straight line between two sRGB
 * points passes through the middle of the cube, and the middle of the cube is
 * grey, so this is the operation that produced the dull olive.
 */
/** OKLab, for measuring how far apart two colours actually look. */
function okLab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** The hue angle in degrees — the carrier the five band fills escalate along. */
function hslHue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
  return h * 360;
}

function srgbMix(a: string, b: string, t: number): string {
  return (
    '#' +
    [1, 3, 5]
      .map((i) => {
        const x = parseInt(a.slice(i, i + 2), 16);
        const y = parseInt(b.slice(i, i + 2), 16);
        return Math.round(x + (y - x) * t)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

/**
 * How colourful a colour LOOKS — OKLab chroma, computed here rather than
 * imported so the measurement is independent of the one tokens.ts solved
 * against. The RGB span below is a FLOOR and a fine one; it is not a measure of
 * appearance, which is why an equal-RGB-span solve returned a highlighter green
 * beside a dull gold.
 */
function okChroma(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return Math.hypot(
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  );
}

/**
 * PERCEPTUAL DISTANCE between two colours — OKLab ΔE.
 *
 * Contrast ratio answers "can I read text on this" and sees luminance only, so
 * it calls a gold and an orange of the same luminance 1.00:1. For "can I see
 * that this region is a different colour from that one", which is what a chart
 * band actually has to do, distance in a perceptually uniform space is the
 * measure. Computed here rather than imported, like okChroma, so it stays
 * independent of whatever tokens.ts solved against.
 */
function deltaOk(a: string, b: string): number {
  const lab = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** A hex's own HSL lightness — the coordinate `BAND_FILL` solves. */
function lightnessOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

/**
 * The most OKLab chroma sRGB will hold for a hue at a given lightness.
 *
 * Swept rather than derived: the sRGB gamut boundary in OKLab has no closed
 * form worth writing here, and a sweep is exact to its step. Used to ask "did
 * this fill take the share it was allotted" in the cases where the GAMUT binds
 * before the share does — at dark's lightnesses two of the three cannot reach
 * their share whatever saturation they are given, and a test that ignored that
 * would be asserting a property of sRGB rather than of the design.
 */
function maxChromaAtLightness(hue: 'green' | 'yellow' | 'red', lightness: number): number {
  const [r0, g0, b0] = [1, 3, 5].map((i) => parseInt(statusHue[hue].slice(i, i + 2), 16) / 255);
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r0) h = ((g0 - b0) / d + (g0 < b0 ? 6 : 0)) / 6;
    else if (max === g0) h = ((b0 - r0) / d + 2) / 6;
    else h = ((r0 - g0) / d + 4) / 6;
  }
  const hx = (v: number) => Math.round(Math.max(0, Math.min(255, v * 255))).toString(16).padStart(2, '0');
  const at = (s: number): string => {
    if (s === 0) return `#${hx(lightness)}${hx(lightness)}${hx(lightness)}`;
    const q = lightness < 0.5 ? lightness * (1 + s) : lightness + s - lightness * s;
    const p = 2 * lightness - q;
    const f = (t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return `#${hx(f(h + 1 / 3))}${hx(f(h))}${hx(f(h - 1 / 3))}`;
  };
  let best = 0;
  for (let s = 0; s <= 1; s += 0.005) best = Math.max(best, okChroma(at(s)));
  return best;
}

/** The three surfaces text is ever set on: the page, a card, and an input. */
function surfaces(mode: (typeof MODES)[number]) {
  return {
    page: tone(mode, '--c-cream'),
    card: tone(mode, '--c-cream-50'),
    input: tone(mode, '--c-white'),
  };
}

describe.each(MODES)('%s theme', (mode) => {
  const s = surfaces(mode);

  it('sets body text at AA on every surface', () => {
    for (const [name, bg] of Object.entries(s)) {
      const ratio = contrastRatio(tone(mode, '--c-espresso'), bg);
      expect(ratio, `body text on ${name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });

  it('keeps every muted body tone in the ladder above AA on every surface', () => {
    // Opacity modifiers carry the app's text hierarchy. They composite against
    // the surface, so the effective colour is a mix, not the token — which is
    // why /70 and /60 were quietly failing AA in light mode before this ladder
    // was fixed at three steps. Anything fainter than /80 is now reserved for
    // placeholders, disabled controls and decorative icons, all of which WCAG
    // 1.4.3 exempts, and none of which is the sole carrier of any meaning.
    const text = tone(mode, '--c-espresso');
    for (const alpha of [0.9, 0.85, 0.8]) {
      for (const [name, bg] of Object.entries(s)) {
        const ratio = contrastRatio(blend(text, bg, alpha), bg);
        expect(ratio, `text-espresso/${alpha * 100} on ${name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          WCAG_AA_TEXT,
        );
      }
    }
  });

  it('sets the accent at AA for large text and UI', () => {
    // Bronze is documented as accents/icons/large headings/focus rings only —
    // 3:1, not 4.5:1. bronze-700 is the one used as small text and is checked
    // at the stricter bar below.
    const ratio = contrastRatio(tone(mode, '--c-bronze'), s.page);
    expect(ratio, `bronze on the page is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
  });

  it('sets bronze-700 at AA for body text, since it is used as one', () => {
    for (const [name, bg] of Object.entries(s)) {
      const ratio = contrastRatio(tone(mode, '--c-bronze-700'), bg);
      expect(ratio, `bronze-700 on ${name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });

  it('sets the label on a filled accent at AA', () => {
    // The pairing a naive dark mode always gets wrong: bronze is lightened in
    // dark so it clears AA against the page, at which point a cream label on
    // it measures under 2:1. `--c-onaccent` flips to a dark tone for exactly
    // this, and this is the check that keeps it flipped.
    for (const fill of ['--c-bronze', '--c-bronze-600', '--c-bronze-700', '--c-status-significant-high']) {
      const ratio = contrastRatio(tone(mode, '--c-onaccent'), tone(mode, fill));
      expect(ratio, `on-accent label on ${fill} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });

  it('sets every status label at AA on every surface, including its own tint', () => {
    for (const key of Object.keys(status) as StatusKey[]) {
      const label = tone(mode, `--c-status-${kebab(key)}`);
      const tint = tone(mode, `--c-tint-${kebab(key)}`);
      for (const [name, bg] of [...Object.entries(s), ['its own tint', tint] as const]) {
        const ratio = contrastRatio(label, bg);
        expect(ratio, `${key} label on ${name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
      }
    }
  });

  it('keeps body text readable on a tinted card', () => {
    // The whole point of a tint is that it sits under ordinary content. If the
    // wash pushed body copy below AA, the tint would be buying recognition at
    // the cost of legibility, which is the wrong trade on a blood result.
    for (const key of Object.keys(status) as StatusKey[]) {
      const tint = tone(mode, `--c-tint-${kebab(key)}`);
      const ratio = contrastRatio(tone(mode, '--c-espresso'), tint);
      expect(ratio, `body text on the ${key} tint is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });

  /**
   * ═══ THE STATUS OUTLINE ════════════════════════════════════════════════════
   *
   * The marker result card and the at-a-glance strip carried a filled status
   * GROUND through three settings and four deepenings. Both are neutral glass
   * now and the status is a 2px border, which changes what has to be measured:
   * an outline is a thin graphical object on a translucent pane, so what matters
   * is how far it stands off THAT pane rather than what text can sit on it.
   *
   * ⚠ AND THE FLOOR IS 3:1, THE GRAPHICAL ONE. Status is carried by the gauge
   * arc, the chevron and the word as well, so the outline is reinforcement and
   * answers to WCAG 1.4.11 rather than to 1.4.3. It is measured against the pane
   * AS COMPOSITED, because a border drawn on glass stands on the page showing
   * through the glass and not on the token.
   */
  const pane = blend(tone(mode, '--c-glass-panel'), tone(mode, '--c-cream'), GLASS.panel[mode]);

  it('stands every status outline off the glass it is drawn on', () => {
    for (const key of Object.keys(status) as StatusKey[]) {
      const outline = tone(mode, `--c-outline-${kebab(key)}`);
      const ratio = contrastRatio(outline, pane);
      expect(ratio, `the ${key} outline is ${ratio.toFixed(2)}:1 on the ${mode} pane`).toBeGreaterThanOrEqual(
        WCAG_AA_LARGE_TEXT,
      );
    }
  });

  /**
   * ⚠ THE TWO THEMES ARE NOT THE SAME VALUES AND MUST NOT BE. The ground is a
   * near-white pane in one and a near-black one in the other, so a rendering
   * deep enough to read on the first is a black line on the second. Asserted as
   * an inequality rather than left to the comment: dark is LIFTED, every hue.
   */
  it('lifts every outline in dark rather than reusing the light one', () => {
    for (const key of Object.keys(status) as StatusKey[]) {
      const light = tone('light', `--c-outline-${kebab(key)}`);
      const dark = tone('dark', `--c-outline-${kebab(key)}`);
      expect(dark, `the ${key} outline is the same value in both themes`).not.toBe(light);
      expect(luminance(dark), `the ${key} outline was not lifted in dark`).toBeGreaterThan(luminance(light));
    }
  });

  it('keeps the outline rich rather than a grey line at 2px', () => {
    for (const key of Object.keys(status) as StatusKey[]) {
      const chroma = okChroma(tone(mode, `--c-outline-${kebab(key)}`));
      expect(chroma, `the ${key} outline carries only ${chroma.toFixed(4)} of chroma`).toBeGreaterThan(0.1);
    }
  });

  it('tells the three outline hues apart, which is what the colour is for', () => {
    const green = tone(mode, '--c-outline-in-range');
    const gold = tone(mode, '--c-outline-high');
    const red = tone(mode, '--c-outline-significant-high');
    for (const [a, b, names] of [
      [green, gold, 'in range vs high'],
      [gold, red, 'high vs significantly out'],
      [green, red, 'in range vs significantly out'],
    ] as const) {
      const apart = deltaOk(a, b);
      expect(apart, `${names}: the two outlines are ${apart.toFixed(4)} apart in OKLab`).toBeGreaterThan(0.08);
    }
    // Both golds are one colour, by construction rather than by two records
    // agreeing: direction is the chevron and the word.
    expect(tone(mode, '--c-outline-low')).toBe(gold);
    expect(tone(mode, '--c-outline-significant-low')).toBe(red);
  });

  /**
   * ── THE STRIP'S RING, AND THE HINGE IS THE HALF THAT CAN GO WRONG ────────
   *
   * The at-a-glance strip's outline is one gradient: gold, olive, green, olive,
   * gold. The hinge stops are the OKLCH midpoints of the two outlines either
   * side, because a straight sRGB line between a green and a gold passes through
   * the middle of the cube and the middle of the cube is grey. That is the same
   * fact recorded against the gauge's own ramp, one ring further out, and it is
   * asserted the same way: the hinge equals the OKLCH midpoint AND is not the
   * sRGB one, so a `mix()` creeping back fails here rather than being noticed as
   * a dull patch at 25% of a strip.
   */
  it('hinges the strip ring on the OKLCH midpoint and not the sRGB one', () => {
    const green = tone(mode, '--c-outline-green');
    const gold = tone(mode, '--c-outline-yellow');
    const olive = tone(mode, '--c-outline-olive');
    expect(olive).toBe(oklchMix(green, gold, 0.5));
    expect(olive, 'the strip hinge is the sRGB midpoint, which olives out').not.toBe(srgbMix(green, gold, 0.5));
    // And it is a real step from both ends rather than one of them rounded.
    expect(deltaOk(olive, green)).toBeGreaterThan(0.02);
    expect(deltaOk(olive, gold)).toBeGreaterThan(0.02);
  });


  it('keeps each tint distinguishable from the untinted card it replaces', () => {
    // Not an accessibility threshold — a sanity one. A wash that measures
    // 1.01:1 against the plain card is not a tint, it is a rounding error, and
    // it would be a colour-coding system nobody can see.
    for (const key of Object.keys(status) as StatusKey[]) {
      const tint = tone(mode, `--c-tint-${kebab(key)}`);
      expect(tint, `${key} tint is identical to the card surface`).not.toBe(s.card);
      expect(contrastRatio(tint, s.card)).toBeGreaterThan(1.02);
    }
  });

  it('keeps the summary-bar fills distinct from each other', () => {
    // The bars are the one place three tints sit edge to edge. They also carry
    // a hatch and a text label, so this is a legibility floor, not the sole
    // means of telling them apart.
    const green = tone(mode, '--c-tint-in-range-bar');
    const yellow = tone(mode, '--c-tint-high-bar');
    const red = tone(mode, '--c-tint-significant-high-bar');
    for (const [a, b, names] of [
      [green, yellow, 'in range vs high'],
      [yellow, red, 'high vs significantly out'],
      [green, red, 'in range vs significantly out'],
    ] as const) {
      expect(a, names).not.toBe(b);
    }
  });

  it('lands every band on its own rung of the ladder', () => {
    // THE LADDER, MEASURED AGAINST THE TOKEN THAT IS ACTUALLY PAINTED.
    //
    // A band used to be composited, which made its token unmeasurable on its
    // own — `--c-hue-red-plot` was a bright red in dark and a brick one in
    // light, and neither figure said anything about what a reader saw. It is an
    // opaque fill now, so the fill IS the band and this reads it directly.
    //
    // The rung is the geometric mean of the two surfaces a fill is drawn on,
    // because the chart's plot panel and the card a range bar sits on are not
    // the same distance apart in the two themes — see BAND_FILL. Solving
    // against either one alone leaves the other instrument's bands about a
    // third apart between light and dark.
    //
    // MEASURED AGAINST `BAND_RUNG`, which since Aug 2026 equals `BAND_CONTRAST`
    // in both themes again. The two were allowed to differ for exactly one
    // entry — dark's out-of-range band at 4.45, because at the ordinary rung no
    // yellow exists on a near-black plot and that band was the only thing
    // saying "out of range" in dark. The LINE says it now, so the band went
    // back on the ladder. The two names stay apart because the reason they
    // diverged can recur; the test below holds that they currently do not.
    // ── ⚠ YELLOW IS PINNED TO THE HUE ITSELF AND IS OFF THE RUNG (Aug 2026)
    //
    // The brief was a single exact value — #F5CE3E — for the below/above status
    // colour AND for the gauge stop that renders it, identical in both themes.
    // That is a stronger constraint than a rung: the fill is not solved to a
    // contrast against the plot any more, it IS `statusHue.yellow`.
    //
    // AND IT COULD NOT BE BOTH. A clean light yellow is LIGHTER than the light
    // green — 1.28:1 off the plot against green's 1.51 — so pinning the value
    // and holding the 1.85 rung are contradictory demands, and the previous two
    // passes at this each satisfied the rung and shipped a dark gold. The rung
    // is what gave.
    //
    // WHAT THE RUNG WAS FOR, AND WHY IT COSTS NOTHING HERE: it is a CHART BAND
    // concept. Bands were context behind a trend line and had to escalate in
    // weight without out-reading it. The trend chart has drawn no bands since
    // Aug 2026 and the only instrument painting these fills is the ARC GAUGE,
    // where the five slices are the instrument rather than the background to
    // one. What a gauge is read by is asserted below instead: a monotone HUE
    // ramp, a visible step between every adjacent pair, and a boundary hairline
    // on each — none of which the pinning weakens.
    for (const hue of BAND_STATES) {
      if (hue === 'yellow') continue;
      const got = bandRung(mode, hue);
      const rung = BAND_RUNG[hue];
      expect(got, `the ${hue} band is at ${got.toFixed(3)}:1, the rung says ${rung.toFixed(3)}`).toBeCloseTo(rung, 1);
    }
  });

  it('paints the below/above band as statusHue.yellow itself, byte for byte, in both themes', () => {
    // THE FAULT THIS EXISTS AGAINST, and it had survived two passes: the seed
    // was changed and the RENDERED token stayed dark, because `BAND_FILL`
    // re-derived the hue at its own fixed lightness and saturation. #EAB308 in
    // the palette, #d1aa33 on the screen. A test on the seed would have passed
    // both times.
    expect(tone(mode, '--c-hue-yellow-fill').toLowerCase()).toBe(statusHue.yellow.toLowerCase());
    expect(tone('light', '--c-hue-yellow-fill')).toBe(tone('dark', '--c-hue-yellow-fill'));
    /**
     * ── AND THE STATUS WORD IS THE SAME HEX WHEREVER IT CAN BE READ ────────
     *
     * "Below range" is the one piece of text in the product that carries a
     * status colour, and in dark it was solved to **#dbad00** — a denser, darker
     * gold than the band it names, because the solver maximises chroma subject
     * to AA and nothing told it to prefer the palette's own colour. It reads as
     * muddy for the same reason the band did.
     *
     * The rule is now "take the hue itself where it clears the floor, solve only
     * where it does not", which is general rather than a yellow-shaped
     * exception — green and red are both still solved, because neither clears
     * 4.5:1 on a near-black card.
     *
     * ⚠ AND LIGHT CANNOT, WHICH IS MEASURED RATHER THAN CONCEDED: #F5CE3E is
     * 1.50:1 on the light card. Asserted here as the reason, so nobody
     * "corrects" the asymmetry without meeting the number first.
     */
    if (mode === 'dark') {
      expect(tone('dark', '--c-status-high').toLowerCase()).toBe(statusHue.yellow.toLowerCase());
      expect(tone('dark', '--c-status-low').toLowerCase()).toBe(statusHue.yellow.toLowerCase());
      // Same colour as the band it names, which is the whole of the point.
      expect(tone('dark', '--c-status-high').toLowerCase()).toBe(tone('dark', '--c-hue-yellow-fill').toLowerCase());
    } else {
      const asText = contrastRatio(statusHue.yellow, tone('light', '--c-cream-50'));
      expect(asText, `#F5CE3E on the light card is ${asText.toFixed(2)}:1, so the word cannot take it`).toBeLessThan(
        WCAG_AA_TEXT,
      );
    }
    // And it is a LIGHT yellow rather than a gold: the brief's floor, stated as
    // the thing that actually distinguishes the two.
    const [r, g] = [1, 3].map((i) => parseInt(tone(mode, '--c-hue-yellow-fill').slice(i, i + 2), 16));
    expect(r, 'the below/above band has dropped back into gold').toBeGreaterThanOrEqual(0xf2);
    expect(g, 'the below/above band has dropped back into gold').toBeGreaterThanOrEqual(0xc0);
  });

  it('leaves the ladder in order and, since Aug 2026, departs from it nowhere', () => {
    // The DESIGN's ladder, ordered. It is much quieter than it was — the bands
    // are context now that the trend line carries the status along its own
    // length — but "further out is more strongly marked" is unchanged, and that
    // is what this holds.
    expect(BAND_CONTRAST.IN_RANGE).toBeLessThan(BAND_CONTRAST.HIGH);
    expect(BAND_CONTRAST.HIGH).toBeLessThan(BAND_CONTRAST.SIGNIFICANT_HIGH);
    // NO departures, in either theme. Dark's out-of-range band was the only one
    // there has ever been, and it went back on the ladder when the line took
    // over carrying the status. A new one is a decision somebody has to take
    // deliberately, which is what failing here forces.
    const off = (['green', 'yellow', 'red'] as const).filter(
      (hue) => BAND_RUNG[hue] !== BAND_CONTRAST[hue === 'green' ? 'IN_RANGE' : hue === 'yellow' ? 'HIGH' : 'SIGNIFICANT_HIGH'],
    );
    expect(off, `departs from the ladder on ${off.join(', ') || 'nothing'}`).toEqual([]);
  });

  it('puts each hinge exactly halfway between the two bands it joins', () => {
    // THE WHOLE CLAIM A BOUNDARY BLEND MAKES: a result sitting exactly on the
    // limit is drawn exactly half in each colour. Olive at a reference bound,
    // orange at a significantly-out threshold — neither is ever a state, and
    // neither is solved for. They are computed as the RGB midpoint of the two
    // fills either side, in the theme they are drawn in.
    //
    // The failure this catches is real and was on screen for one iteration:
    // solved independently from `statusHue.olive` (57% saturated against
    // green's 41%), the olive came out MORE chromatic than either neighbour and
    // drew a bright chartreuse stripe down the middle of the blend — the
    // opposite of a hand-over.
    // ── AND "HALF" IS MEASURED IN OKLCH NOW (Aug 2026) ────────────────────
    //
    // The claim is unchanged and the SPACE it is made in is not. This used to
    // check the sRGB channel midpoint, and a straight line between two sRGB
    // points passes through the middle of the cube — which is grey. Measured on
    // the green fill and the clean yellow: sRGB's midpoint is #cdae62, a dull
    // gold LESS colourful than either endpoint. That is the whole of "green to
    // yellow passes through a dull olive", and it is a property of the
    // interpolation rather than of either colour, so no choice of yellow could
    // have fixed it. OKLCH's midpoint is #c9d165, a bright yellow-green.
    for (const [hinge, below, above] of BAND_HINGES) {
      const fill = (name: string) => tone(mode, `--c-hue-${name}-fill`);
      expect(
        fill(hinge).toLowerCase(),
        `the ${hinge} hinge is not the OKLCH midpoint of ${below} and ${above}`,
      ).toBe(oklchMix(fill(below), fill(above), 0.5).toLowerCase());
      // AND IT IS NOT THE sRGB ONE, which is the regression this guards: a
      // `mix()` creeping back in would still be "a midpoint" and would still
      // be between its neighbours in luminance, so the check below cannot see
      // it and only this can.
      expect(
        fill(hinge).toLowerCase(),
        `the ${hinge} hinge is the sRGB midpoint, so the blend dips through grey`,
      ).not.toBe(srgbMix(fill(below), fill(above), 0.5).toLowerCase());
      // AND IT LANDS BETWEEN ITS NEIGHBOURS IN LUMINANCE — which is the one
      // thing a channel-wise midpoint is guaranteed to do, luminance being
      // monotonic in every channel.
      //
      // This used to be asserted on the RUNG, and in dark that is now false for
      // orange: it sits between a 4.45 yellow and a 2.29 red, so a colour
      // between those two in RGB is ABOVE both in contrast against the surface.
      // Chroma is no better — light's is not monotonic across the five either
      // (its red is 0.134 against its gold's 0.140). Luminance is the measure
      // that follows from what a hinge IS, so it is the one asserted here, and
      // the ordering the escalation is carried by is checked on its own below.
      const lum = (name: string) => luminance(tone(mode, `--c-hue-${name}-fill`));
      const [loLum, hiLum] = [lum(below), lum(above)].sort((a, b) => a - b);
      expect(lum(hinge), `the ${hinge} hinge is not between ${below} and ${above} in luminance`).toBeGreaterThan(loLum);
      expect(lum(hinge), `the ${hinge} hinge is not between ${below} and ${above} in luminance`).toBeLessThan(hiLum);
    }
  });

  it('draws the SAME band in both themes, not merely a similar one', () => {
    // ── WHAT THIS TEST USED TO BE, AND WHY IT IS STRONGER NOW ─────────────
    //
    // It used to allow the two themes' bands to differ by up to 20% of their
    // contrast off their own surfaces, and that tolerance was doing real work:
    // at the light-mode weights dark's gold once measured 1.44:1 off the card
    // against light's 1.16:1, because a near-black surface amplifies a
    // luminance difference a cream one damps.
    //
    // THERE IS NOTHING LEFT TO TOLERATE. The plot is one warm off-white in both
    // themes and every band is drawn on it, so the two themes' fills are the
    // same three hexes and the claim is byte equality rather than a bound. A
    // theme-derived value creeping back into a band fails here immediately
    // rather than drifting toward a limit.
    for (const hue of [...BAND_STATES, ...BAND_HINGES.map(([h]) => h), 'optimal-band'] as const) {
      const token = hue === 'optimal-band' ? '--c-band-optimal' : `--c-hue-${hue}-fill`;
      expect(tone('light', token), `the ${hue} fill differs between themes`).toBe(tone('dark', token));
    }
    // And the plot itself, which is the reason all of the above is true.
    expect(tone('light', '--c-chart-plot-surface')).toBe(tone('dark', '--c-chart-plot-surface'));
    // As does everything drawn ON the plot: the line, the marks, the hairline,
    // the ink. Each of these was per-theme and each of them was per-theme
    // BECAUSE the ground was.
    /**
     * ── AND THE LIST GOT SHORTER, WHICH IS THE Aug 2026 CHANGE ────────────
     *
     * The bands were removed from the TREND CHART and the chart moved onto the
     * card. So the things that are still theme-identical are exactly the things
     * still drawn on `PLOT_SURFACE` — the five band fills a RANGE BAR paints,
     * its own mark and that mark's ring — and everything drawn on the CARD went
     * back to being per-theme, because the card is.
     *
     * `--c-chart-point-ring`, `--c-chart-axis-text`, `--c-chart-bound-label`,
     * `--c-chart-bound`, `--c-chart-line` and every `--c-hue-*-mark` are in the
     * per-theme test below instead. `--c-chart-plot-ink` / `-muted` are gone
     * with the panel.
     */
    for (const token of ['--c-rangemark', '--c-rangemark-ring']) {
      expect(tone('light', token), `${token} differs between themes`).toBe(tone('dark', token));
    }
  });

  it('ships the solved colours as literals that still equal their own derivation', () => {
    /**
     * ═══ THE LITERALS AND THE SOLVER CANNOT DRIFT ═══════════════════════════
     *
     * `solveAgainst`, `solveTint` and `solveNeutral` are grid searches, roughly
     * a quarter of a million evaluations between them. Run at module scope they
     * cost **605ms, measured** — and tokens.ts is in the entry chunk, so that
     * is 605ms of blocked first paint for every patient on every visit.
     *
     * So the file does what its own note on `okChroma` has always said: solve
     * at authoring time, ship the numbers. `SOLVED` is what ships and module
     * init is under 2ms.
     *
     * THAT TRADE IS ONLY SAFE WITH THIS TEST. A hardcoded hex is a value that
     * has stopped being derived from anything, and the failure mode is silent:
     * change `statusHue.green`, or `TINT_MIX.wash`, or a card surface, and
     * every one of these should move and none of them would. So the search is
     * re-run here and compared, hex for hex.
     *
     * It is slow (a second or so) and it is the only place that cost is paid.
     */
    const solved = solveTokens(mode);
    for (const hue of BAND_HUES) {
      expect(solved.line[hue], `${mode}: the ${hue} line literal is stale`).toBe(tone(mode, `--c-hue-${hue}-mark`));
      expect(solved.wash[hue], `${mode}: the ${hue} wash literal is stale`).toBe(tone(mode, `--c-hue-${hue}-wash`));
      expect(solved.track[hue], `${mode}: the ${hue} track literal is stale`).toBe(tone(mode, `--c-hue-${hue}-track`));
    }
    expect(solved.label.green, `${mode}: the in-range label literal is stale`).toBe(tone(mode, '--c-status-in-range'));
    expect(solved.label.yellow, `${mode}: the above-range label literal is stale`).toBe(tone(mode, '--c-status-high'));
    expect(solved.label.red, `${mode}: the significantly-out label literal is stale`).toBe(
      tone(mode, '--c-status-significant-high'),
    );
    expect(solved.bound, `${mode}: the boundary hairline literal is stale`).toBe(tone(mode, '--c-chart-bound'));
  });

  it('solves everything drawn ON THE CARD per theme, because the card is', () => {
    /**
     * THE MIRROR OF THE TEST ABOVE, and it is the one that would have caught
     * the failure this change could most easily have made.
     *
     * With the plot panel gone, the trend line, its point marks, the boundary
     * hairline and every label on the axis are drawn straight onto the card —
     * which is a near-white in light and a near-black in dark. A token left
     * theme-identical here is a token solved for one of those two and wrong on
     * the other, and the way it goes wrong is invisible in a screenshot of the
     * theme it was solved for.
     *
     * Measured, on the value this replaced: `--c-chart-axis-text` was the
     * static `PLOT_INK_MUTED` (#6d6861), which on the dark card is 1.94:1 — a
     * tick ladder nobody can read.
     */
    for (const token of [
      // NOT `--c-chart-line`: that is the COMPARISON chart's line, which still
      // crosses bands on `PLOT_SURFACE` and is therefore still one colour in
      // both themes. See the test above.
      '--c-chart-point-ring',
      '--c-chart-bound',
      '--c-chart-bound-label',
      '--c-chart-axis-text',
      ...BAND_HUES.map((h) => `--c-hue-${h}-mark`),
    ]) {
      expect(tone('light', token), `${token} is the same in both themes`).not.toBe(tone('dark', token));
    }
  });

  it('keeps every band visible against the plot it is drawn on', () => {
    /**
     * VISIBLE AT ALL — a band nobody can see is a band that is not there.
     *
     * MEASURED AS PERCEPTUAL DISTANCE, NOT AS CONTRAST. This was a 1.15:1
     * contrast floor, and when the bands dropped to context weight light's
     * in-range band landed at 1.14 and failed it while being plainly, obviously
     * green. Contrast ratio is a LUMINANCE measure; what makes a large flat
     * region of colour visible against another is mostly its HUE.
     */
    for (const hue of BAND_HUES) {
      const d = deltaOk(tone(mode, `--c-hue-${hue}-fill`), tone(mode, '--c-chart-plot-surface'));
      expect(d, `the ${hue} band is ΔE ${d.toFixed(3)} off the plot`).toBeGreaterThan(0.05);
    }
  });

  it('keeps every band unmistakably its own colour rather than a grey with a hue in it', () => {
    // THE COMPLAINT THIS ANSWERS, MEASURED. "Too muted to read as green,
    // yellow and red" is about CHROMA — distance from the neutral axis — and
    // not about HSL saturation, which is a ratio and therefore reports a pale
    // pink and a saturated red as the same figure.
    //
    // While a band was composited, its chroma was very nearly
    // `weight × chroma(hue)` — so the alpha was a hard ceiling and three
    // separate re-solves of the hue could not get past it. The light in-range
    // band measured 0.039: ten RGB levels between its brightest and darkest
    // channel, a grey with a rumour of green in it. An opaque fill has no such
    // ceiling, which is why the floor here is 0.15 rather than the 0.1 that was
    // as much as the old bands could reach.
    for (const hue of BAND_HUES) {
      const band = tone(mode, `--c-hue-${hue}-fill`);
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(band.slice(i, i + 2), 16));
      const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      expect(chroma, `the ${hue} band is ${band}, chroma ${chroma.toFixed(3)}`).toBeGreaterThan(0.15);
    }
  });

  it('gives each band as much colour as its own brand hue carries — a cap PER HUE, not one for all three', () => {
    // THE COMPLAINT THIS ANSWERS: red read as red, green read as olive and gold
    // read as brown. The cause was one saturation cap (0.6) across all three,
    // and the reason one cap cannot work is that HSL saturation is a RATIO
    // while the three hues sit at very different lightnesses — the ladder puts
    // them there deliberately. Measured in OKLab chroma at the old numbers:
    // light 0.0915 / 0.1242 / 0.1037, dark 0.0696 / 0.0727 / 0.1412. One cap
    // flattered gold in light and red in dark and starved green in both.
    //
    // The bound is now per hue and is the colourfulness of the BRAND HUE each
    // band derives from: a green band as chromatic as `statusHue.green` cannot
    // be out of the palette, because that IS the palette's green. So this is
    // both halves of the claim — each band reaches its own ceiling (within the
    // rounding of a 24-bit channel and the ladder it also has to satisfy), and
    // none of them passes it.
    for (const hue of BAND_STATES) {
      const measured = okChroma(tone(mode, `--c-hue-${hue}-fill`));
      const ceiling = bandChromaCeiling(hue as 'green' | 'yellow' | 'red');
      expect(measured, `the ${hue} band is more chromatic than statusHue.${hue} itself`).toBeLessThanOrEqual(
        ceiling * 1.02,
      );
      // ── THE FLOOR IS THE ALLOTTED SHARE, NOT THE WHOLE CEILING (Aug 2026)
      //
      // A band used to take ALL of its hue's palette chroma. Solved that way
      // against the new quiet rungs the bands came out pale but vivid, and the
      // measurement that condemned it is one line: the green band carried 0.123
      // of chroma against the green LINE's 0.096. The context was more
      // colourful than the content — the same inversion the rungs were lowered
      // to fix, surviving in the dimension nobody had measured.
      //
      // So a band takes `BAND_CHROMA_SHARE` of the ceiling and this holds it
      // there from BOTH sides: it must reach essentially all of its share (a
      // band that went grey fails) and must not exceed it (a band creeping back
      // toward the line fails). The old absolute floor — what the single 0.6
      // saturation cap produced — cannot be used any more and `SINGLE_CAP_CHROMA`
      // is kept only as the historical record it is: a fainter band sits at a
      // lightness where less chroma physically exists, so the only way to beat
      // that number now would be to make the bands loud again, which is the
      // change being measured, inverted.
      // ── ⚠ YELLOW TAKES THE WHOLE CEILING, NOT THE SHARE (Aug 2026) ──────
      //
      // The share exists so a band stays less colourful than the trend LINE of
      // the same hue — context under content. The below/above band is no longer
      // solved to anything: the brief pinned it to `statusHue.yellow` itself, so
      // its chroma is the ceiling by definition rather than a share of it, and
      // the ceiling IS `okChroma(statusHue.yellow)`. The rule that actually
      // protects the palette — a band may never be MORE colourful than the hue
      // it derives from — is asserted above and still holds with equality.
      const share = hue === 'yellow' ? 1 : BAND_CHROMA_SHARE;
      const allowed = Math.min(
        maxChromaAtLightness(hue as 'green' | 'yellow' | 'red', lightnessOf(tone(mode, `--c-hue-${hue}-fill`))),
        ceiling * share,
      );
      expect(
        measured,
        `the ${hue} band is ${measured.toFixed(4)} of an allotted ${allowed.toFixed(4)}`,
      ).toBeGreaterThanOrEqual(allowed * 0.93);
      expect(
        measured,
        `the ${hue} band is ${measured.toFixed(4)}, past its allotted ${allowed.toFixed(4)}`,
      ).toBeLessThanOrEqual(allowed * 1.07);
    }
  });

  it('keeps a band less colourful than the line of the same hue, where the gamut allows', () => {
    /**
     * ── WHAT THIS TEST USED TO BE, AND WHY IT HAD TO CHANGE (Aug 2026) ──────
     *
     * "The line is content, the bands are context", asserted in two dimensions:
     * the line had to stand at least 3× as far off the PLOT as its own band,
     * and be more chromatic than it.
     *
     * The first half no longer describes anything. The trend chart has no bands
     * and no plot, so "the line's lead off the plot over its band" measures two
     * things that are never on screen together — and it FAILED, at 2.68× and
     * 1.68×, for a reason that is not a regression: the line is solved against
     * the CARD now, so its distance from `PLOT_SURFACE` is an accident.
     * Deleting it and keeping a green number would have been the wrong trade;
     * the requirement it stood for is asserted directly instead, in
     * "keeps the trend line clear of the CARD it is now drawn on".
     *
     * THE SECOND HALF SURVIVES AND IS STILL WORTH HAVING, because the two
     * instruments still share a vocabulary: a range bar paints the five band
     * fills and the trend line is drawn in the five line colours, and a reader
     * seeing both on one marker page should not find the CONTEXT more colourful
     * than the CONTENT.
     *
     * THE GOLD EXCEPTION IS UNCHANGED and is a gamut fact rather than a fudge.
     * A yellow at a low luminance is a brown in any colour space, so the gold
     * LINE cannot out-chroma the gold BAND while clearing contrast on the card.
     * Named, with the two hinges either side of it, rather than removed.
     */
    const CHROMA_EXEMPT = new Set(['yellow', 'olive', 'orange']);
    for (const hue of BAND_HUES) {
      if (CHROMA_EXEMPT.has(hue)) continue;
      const band = okChroma(tone(mode, `--c-hue-${hue}-fill`));
      const line = okChroma(tone(mode, `--c-hue-${hue}-mark`));
      expect(
        band,
        `the ${hue} band is ${band.toFixed(4)} chromatic against a line of ${line.toFixed(4)}`,
      ).toBeLessThan(line);
    }
  });

  it('keeps every band a visible step from the ones either side of it', () => {
    // ── WHAT REPLACED "IN RANGE IS THE FAINTEST OF THE FIVE" (Aug 2026) ────
    //
    // That was true and load-bearing while these were CHART BANDS: five regions
    // of colour behind a trend line, where the in-range band covers most of the
    // plot and the ordinary case therefore has to carry the least. The trend
    // chart has drawn no bands since Aug 2026 and the only instrument painting
    // these is the ARC GAUGE, where each fill is a slice of the instrument
    // rather than a field behind one — and where the yellow is pinned to
    // `statusHue.yellow` outright, which puts a clean light yellow above the
    // green in lightness and makes the old ordering arithmetically impossible.
    //
    // What a gauge actually requires of five adjacent slices is that a reader
    // can see where one ends and the next begins, which is a SEPARATION rather
    // than an ordering. Measured in OKLab, where equal distances look equally
    // different; the floor is a fortieth of the distance between the palette's
    // green and its red, comfortably above "these are the same colour".
    const dE = (a: string, b: string) => {
      const [la, aa, ba] = okLab(a);
      const [lb, ab, bb] = okLab(b);
      return Math.hypot(la - lb, aa - ab, ba - bb);
    };
    for (let i = 1; i < BAND_HUES.length; i++) {
      const a = tone(mode, `--c-hue-${BAND_HUES[i - 1]}-fill`);
      const b = tone(mode, `--c-hue-${BAND_HUES[i]}-fill`);
      const d = dE(a, b);
      expect(d, `${BAND_HUES[i - 1]} and ${BAND_HUES[i]} are ${d.toFixed(4)} apart in OKLab`).toBeGreaterThan(0.045);
    }
    // And each of them is genuinely on the plot rather than lost in it.
    for (const hue of BAND_HUES) {
      const r = bandRung(mode, hue);
      expect(r, `the ${hue} band is ${r.toFixed(3)}:1 off the plot`).toBeGreaterThan(1.2);
    }
  });

  it('escalates continuously across all five, by contrast, in both themes', () => {
    // ── ONE CARRIER AGAIN (Aug 2026) ───────────────────────────────────────
    //
    // "Further out is more strongly marked" was asserted on the contrast rung
    // in both themes, then on CHROMA in dark, and now on contrast again. The
    // detour is worth recording because it was a symptom rather than a design:
    // dark's out-of-range band had been lifted off the ladder to 4.45 so it
    // would read as a yellow rather than an ochre, which put it ABOVE the red
    // band and ran the contrast ladder backwards — so the test had to find some
    // other measure that still ran continuously, and chroma did.
    //
    // With the trend line carrying the status, that band went back on the
    // ladder (see BAND_RUNG) and the contrast ordering is true in both themes
    // again. One rule for both is worth more than two: a theme quietly
    // departing from the ladder now fails here rather than being absorbed by a
    // second carrier.
    //
    // Chroma is deliberately NOT asserted monotonic. It never was in light —
    // its red sits below its gold and has since the bands went opaque — and the
    // bands are held to a share of the palette per hue now, which is a
    // different claim, made in its own test above.
    //
    // ── AND THE CARRIER IS HUE NOW, NOT CONTRAST (Aug 2026) ───────────────
    //
    // Contrast stopped running continuously the moment the below/above band was
    // pinned to `statusHue.yellow` itself: a clean light yellow is LIGHTER than
    // the light green, so the five measure 1.51 1.38 1.28 1.69 2.27 off the
    // plot. That is the brief's own trade — one exact value for the status
    // yellow, in both themes, rather than a value solved to a rung — and it is
    // the third time this pair of demands has been met by keeping the rung and
    // shipping a dark gold.
    //
    // What escalates instead is the thing a traffic light IS: the HUE ANGLE,
    // running monotonically from green through the clean yellow to red, with no
    // reversal anywhere along the ramp. That is the property a reader reads off
    // an arc, it holds in both themes, and unlike the contrast ordering it is
    // not in tension with pinning any one of the five. The non-colour carriers
    // are untouched and are still what actually says the status: the chevron,
    // the word, and the boundary hairline on every band.
    const hues = BAND_HUES.map((hue) => hslHue(tone(mode, `--c-hue-${hue}-fill`)));
    const falling = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] > x);
    expect(falling(hues), `${mode} hue angles ${hues.map((h) => h.toFixed(1)).join(' ')}`).toBe(true);
    // Green really is green and red really is red, rather than the ramp merely
    // being monotone somewhere off in the blues.
    expect(hues[0], 'the in-range band is not a green').toBeGreaterThan(70);
    expect(hues[hues.length - 1], 'the significantly-out band is not a red').toBeLessThan(20);
  });

  it('shades the optimal narrowing into the in-range band without making it a boundary', () => {
    // An optimal range is a NARROWING of in-range, drawn as the same green a
    // rung deeper. Two failures either side of that: too little and it is
    // invisible, too much and it reads as the edge of a different region — on a
    // chart where the edge of a region is a clinical threshold.
    const optimal = tone(mode, '--c-band-optimal');
    const green = tone(mode, '--c-hue-green-fill');
    const ratio = contrastRatio(optimal, green);
    expect(ratio, `the optimal narrowing is ${ratio.toFixed(3)}:1 off the in-range band`).toBeGreaterThan(1.06);
    expect(ratio, `the optimal narrowing is ${ratio.toFixed(3)}:1 off the in-range band`).toBeLessThan(1.3);
    // And it never reaches the next rung up, or the narrowing would be drawn in
    // the colour that means "outside the range". Measured on the plot, which is
    // the one surface a band is drawn on — the geometric mean this used to take
    // included the CARD, and with the plot light in both themes that put dark's
    // figure at 3.52 against a rung of 1.85 while the drawn colours were
    // identical in the two themes.
    const optimalRung = contrastRatio(optimal, tone(mode, '--c-chart-plot-surface'));
    expect(bandRung(mode, 'green')).toBeLessThan(optimalRung);
    expect(optimalRung).toBeLessThan(BAND_CONTRAST.HIGH);
  });

  it('keeps a band boundary visible on the heaviest band it crosses', () => {
    // THE GREYSCALE CARRIER. The bands blend across a boundary rather than
    // meeting at a step, so this hairline is the only thing that says exactly
    // where the reference bound is — and it is what has to survive the colour
    // being taken away. Measured AT ITS DRAWN OPACITY over the band, not as a
    // bare token: at `taupe-600` and 0.55 it landed at 1.11:1 on the
    // significantly-out band, a line nobody can see across the one region where
    // seeing it matters most.
    //
    // Bounded above as well, and that bound is not decoration either: a
    // near-solid rule over every boundary is what made the edge of the
    // reference range the strongest mark on the old chart, when the reader's
    // own result should be.
    const edge = tone(mode, '--c-chart-reference-edge');
    for (const hue of BAND_HUES) {
      const band = tone(mode, `--c-hue-${hue}-fill`);
      const drawn = blend(edge, band, chart.referenceEdgeOpacity);
      const ratio = contrastRatio(drawn, band);
      expect(ratio, `the boundary hairline on the ${hue} band is ${ratio.toFixed(2)}:1`).toBeGreaterThan(1.6);
      expect(ratio, `the boundary hairline on the ${hue} band is ${ratio.toFixed(2)}:1`).toBeLessThan(3.5);
    }
  });

  it('keeps the comparison line clear of every band it crosses', () => {
    // `--c-chart-line` is the COMPARISON chart's line only — two or three
    // markers on one normalised axis, which is the one chart that still draws
    // bands. The single-marker trend chart draws none (Aug 2026) and its line
    // is `--c-hue-*-mark`, checked against the card below.
    //
    // This is what caught the line at its old value: `bronze-700` measured
    // 2.87:1 on the opaque significantly-out band and `bronze-500` in dark
    // 2.42:1, both under AA-large. See LINE_LIFT.
    const line = tone(mode, '--c-chart-line');
    for (const band of [...BAND_HUES.map((hue) => tone(mode, `--c-hue-${hue}-fill`)), tone(mode, '--c-band-optimal')]) {
      const lineRatio = contrastRatio(line, band);
      expect(lineRatio, `the comparison line on ${band} is ${lineRatio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        WCAG_AA_LARGE_TEXT,
      );
    }
  });

  it('keeps the trend line clear of the CARD it is now drawn on, in both themes', () => {
    /**
     * ═══ THE ASSERTION THIS REPLACED, AND WHY IT NO LONGER DESCRIBES ANYTHING
     *
     * It measured every one of the five line/mark colours against every one of
     * the five BAND FILLS, because the trend line used to be drawn over them:
     * a gold segment crossed the green band on its way up, so all 25 pairs had
     * to clear AA-large. That measurement is what forced the bands down to
     * context weight in the first place — the worst pair was 1.10:1.
     *
     * THE BANDS ARE GONE FROM THE TREND CHART (Aug 2026). The line is drawn on
     * the card, crosses nothing, and those 25 pairs are 25 facts about two
     * things that are never on screen together. Keeping the old assertion would
     * have been worse than deleting it: it would have gone on passing or
     * failing about a relationship that does not exist, and it would have
     * pinned the line's colour to a constraint that has been lifted — which is
     * exactly what stopped it being a proper green in light mode.
     *
     * WHAT IS ASSERTED INSTEAD IS THE REQUIREMENT: "the line must clear the
     * card surface at AA-large in each theme". Solved to 4.5 (see
     * LINE_FILL_TARGET), floored here at 3.
     */
    const card = tone(mode, '--c-cream-50');
    for (const hue of BAND_HUES) {
      const ratio = contrastRatio(tone(mode, `--c-hue-${hue}-mark`), card);
      expect(ratio, `the ${hue} line on the card is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
    }
  });

  it('lights every point identically, and the bead always out-reads its own light', () => {
    /**
     * ── ONE WHITE SPARK, AND IT IS BOUNDED AT BOTH ENDS (Aug 2026) ─────────
     *
     * A point is a bright white core inside a wide soft falloff, IDENTICAL AT
     * EVERY STATUS — no shapes, no per-status colour, nothing varying but the
     * most recent point being brighter and a little larger. So this test no
     * longer loops the five hues: there is one core colour, one halo colour per
     * theme, and the loop would be the same assertion five times.
     *
     * Two things can go wrong and neither is visible in a screenshot review,
     * because a glow looks plausible at almost any strength until it is
     * compared with something:
     *
     *   TOO STRONG   the halo becomes a filled disc behind the bead, the bead
     *                dissolves into its own light, and the chart has grown a
     *                region — which is the one thing the bands' removal was for.
     *   TOO WEAK     there is no spark, and the most recent point reads exactly
     *                like the four behind it.
     *
     * MEASURED AT THE CORE'S OWN EDGE, which is where the ramp's plateau ends.
     * That is the hottest part of the gradient anybody ever sees, so every
     * bound below is a worst case rather than an average.
     *
     * ── AND THE TWO THEMES ARE TWO DIFFERENT PHENOMENA ────────────────────
     *
     * Dark is a white core inside a WHITE falloff: light added to a near-black
     * card. Light is the same white core inside a WARM DARK falloff, because a
     * white halo on a cream card measures about 1.05:1 — not a dim bloom,
     * nothing at all. So in light the pair that makes the point exist is the
     * HALO against the card, and the bead is what sits brightest inside it;
     * that inversion is asserted rather than assumed.
     */
    const card = tone(mode, '--c-chart-surface');
    const core = tone(mode, '--c-chart-spark-core');
    const haloTone = tone(mode, '--c-chart-spark-halo');
    const halo = blend(haloTone, card, SPARK.core[mode]);

    // 1. THE BEAD IS ALWAYS THE BRIGHTEST PART OF ITS OWN SPARK, in both
    //    themes and by construction rather than by two numbers agreeing. In
    //    dark that means white against a dimmer white; in light, white against
    //    a soft dark. Either way the reader's eye lands on the point rather
    //    than on the light around it.
    const bead = contrastRatio(core, halo);
    expect(bead, `${mode}: the core is ${bead.toFixed(2)}:1 off its own halo`).toBeGreaterThan(1.6);

    // 2. AND THERE IS ACTUALLY A SPARK. A halo that does not separate from the
    //    card at all is an effect nobody has, which is how a token quietly
    //    becomes decoration that was tuned to nothing.
    const light = contrastRatio(halo, card);
    expect(light, `${mode}: the halo is ${light.toFixed(3)}:1 off the card`).toBeGreaterThan(1.1);

    // 3. THE POINT IS VISIBLE AT ALL. In dark the white core does that on its
    //    own (15:1 off a near-black card). In light it cannot — white on cream
    //    is about 1.05:1 — and the halo is what carries it, which is exactly
    //    why light's halo is dark rather than a weaker version of dark's. The
    //    pair that has to clear is whichever of the two is doing the work.
    const beadOnCard = contrastRatio(core, card);
    expect(
      Math.max(beadOnCard, light),
      `${mode}: the core is ${beadOnCard.toFixed(2)}:1 off the card and the halo ${light.toFixed(2)}:1`,
    ).toBeGreaterThan(1.25);

    // 4. THE HALO IS NOT A REGION. It stays under the separation a CARD has
    //    from the page — past that it stops being light around a mark and
    //    becomes a filled shape on the plot.
    expect(light, `${mode}: the halo is ${light.toFixed(2)}:1 off the card`).toBeLessThan(3);
  });

  it('never varies a point by status', () => {
    /**
     * THE ONE ASSERTION THAT SAYS WHAT THIS CHANGE WAS. The spark's colours are
     * not indexed by status and must never become so — a point drawn in its own
     * state's colour is the same fact the line already carries along its length
     * at that exact x, and it costs the point the one thing it is uniquely
     * placed to say, which is where it is.
     *
     * Written as a check on the TOKEN NAMES rather than on the component,
     * because a per-status spark would arrive as `--c-chart-spark-core-high`
     * long before it arrived as a prop.
     */
    const perStatus = Object.keys(solveTokens(mode)).filter(
      (name) => name.startsWith('--c-chart-spark') && BAND_HUES.some((hue) => name.includes(hue)),
    );
    expect(perStatus, 'the spark is uniform: no per-status core or halo token').toEqual([]);
  });

  it('keeps the line’s casing three times quieter than the line', () => {
    /**
     * The line's glow is three wider strokes of its own path at shares of one
     * alpha, so what lands on the card is their composite — 1−∏(1−aᵢ) — and
     * that is the number worth bounding rather than any single layer's.
     *
     * THE ORDERING IS THE SAME ONE THE BANDS ANSWERED TO: the line is the
     * content, its casing is context, and the content stands at least 3× as far
     * off the surface as the context. It is the claim that stops a glow being
     * turned up until the chart has two lines on it — which is exactly what the
     * first two-layer version looked like, because a flat outermost layer ends
     * at a visible edge.
     */
    const card = tone(mode, '--c-chart-surface');
    const alpha = SPARK.line.alpha[mode];
    const composite = SPARK.line.layers.reduce((acc, l) => 1 - (1 - acc) * (1 - alpha * l.share), 0);
    for (const hue of BAND_HUES) {
      const line = tone(mode, `--c-hue-${hue}-mark`);
      const casing = contrastRatio(blend(line, card, composite), card);
      expect(
        contrastRatio(line, card) / casing,
        `${mode}: the ${hue} line is ${contrastRatio(line, card).toFixed(2)}:1 off the card ` +
          `and its casing ${casing.toFixed(3)}:1`,
      ).toBeGreaterThanOrEqual(3);
      // And it is drawn at all — see the third bound above.
      expect(casing, `${mode}: the ${hue} casing is ${casing.toFixed(3)}:1 off the card`).toBeGreaterThan(1.1);
    }
  });

  it('keeps the five line colours far enough apart to be told apart', () => {
    /**
     * WITH NOTHING BEHIND IT, THE LINE IS THE WHOLE CHART — so "green reads as
     * green and red reads as red" is now a statement about the five colours
     * against EACH OTHER rather than against a ground.
     *
     * PERCEPTUAL DISTANCE, NOT CONTRAST. Two colours at the same luminance
     * measure 1.00:1 and are obviously different colours; the pair this has to
     * protect is green-against-gold, which is a hue difference almost entirely.
     * The floor is the distance at which the three STATES are unmistakable on a
     * 5px stroke, and the two hinges are excluded because they are deliberately
     * midpoints of their neighbours — a hinge is meant to be close to both.
     */
    const states = ['green', 'yellow', 'red'] as const;
    for (const [i, a] of states.entries()) {
      for (const b of states.slice(i + 1)) {
        const distance = deltaOk(tone(mode, `--c-hue-${a}-mark`), tone(mode, `--c-hue-${b}-mark`));
        expect(distance, `${a} and ${b} lines are ${distance.toFixed(3)} apart`).toBeGreaterThan(0.09);
      }
    }
  });

  it('draws the boundary hairline so it is present without out-reading the line', () => {
    /**
     * THE MIDDLE RUNG, on the card now rather than on a band.
     *
     * With the bands gone these four rules are the ONLY thing saying where a
     * patient's reference range is, so "visible" is a harder requirement than
     * it was. And they still must not be the loudest thing on the plot: the
     * reader's own result is.
     *
     * Both halves, measured against the card: the hairline stands off it, and
     * every one of the five line colours stands further off it than the
     * hairline does.
     */
    const card = tone(mode, '--c-cream-50');
    const bound = tone(mode, '--c-chart-bound');
    const boundRatio = contrastRatio(bound, card);
    expect(boundRatio, `the boundary hairline on the card is ${boundRatio.toFixed(2)}:1`).toBeGreaterThan(1.8);
    expect(boundRatio, `the boundary hairline on the card is ${boundRatio.toFixed(2)}:1`).toBeLessThan(3.5);
    for (const hue of BAND_HUES) {
      const lineRatio = contrastRatio(tone(mode, `--c-hue-${hue}-mark`), card);
      expect(lineRatio, `the boundary out-reads the ${hue} line`).toBeGreaterThan(boundRatio);
    }
    // And the threshold rules are QUIETER than the reference bounds, which is
    // half of how the two are told apart without colour (the other half is the
    // dash). Composited at their drawn opacity over the card.
    const drawnThreshold = contrastRatio(blend(bound, card, chart.thresholdOpacity), card);
    expect(drawnThreshold, 'the threshold rule is not quieter than the reference bound').toBeLessThan(boundRatio);
  });

  it('keeps the range-bar mark readable on every segment it can stand on', () => {
    // The bar's mark is NOT a status colour — it is `rangemark`, white in dark
    // and espresso in light, because a mark drawn in its own state's colour is
    // a mark drawn in the shade of the segment it is standing on. It moved onto
    // brighter segments with this change, so it is measured on all of them.
    const mark = tone(mode, '--c-rangemark');
    for (const band of [...BAND_HUES.map((hue) => tone(mode, `--c-hue-${hue}-fill`)), tone(mode, '--c-band-optimal')]) {
      const ratio = contrastRatio(mark, band);
      expect(ratio, `the range-bar mark on ${band} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
    }
  });

  it('emits every role of every hue, both hinges included', () => {
    // Neither hinge is ever a status, so neither has a `--c-tint-*` alias and
    // both would be silently missing if the emitter only walked the five
    // states. Olive is the middle of the blend across a reference bound and
    // orange the middle of the blend across a severity threshold; without them
    // the bar and the chart fall back to a hard step at every boundary — which
    // is the thing the boundary gradient exists to remove.
    for (const hue of ['green', 'olive', 'yellow', 'orange', 'red']) {
      for (const role of ['wash', 'band', 'fill', 'track', 'edge', 'mark']) {
        expect(themeTokens[mode][`--c-hue-${hue}-${role}`], `--c-hue-${hue}-${role}`).toBeTruthy();
      }
    }
  });

  it('gives every status a wash, bar, band, fill, edge and mark', () => {
    for (const key of Object.keys(status) as StatusKey[]) {
      for (const suffix of ['', '-bar', '-band', '-fill', '-edge', '-mark']) {
        expect(themeTokens[mode][`--c-tint-${kebab(key)}${suffix}`], `${key}${suffix}`).toBeTruthy();
      }
    }
  });

  it('makes each wash a visible step off the card, not a rounding error', () => {
    // The failure this catches is the one the tints actually had: a wash so
    // faint that yellow read as the cream card and red read as the cream card,
    // i.e. colour-coding nobody can see. 1.06:1 is roughly the point at which
    // a large flat field stops being distinguishable side by side.
    for (const key of Object.keys(status) as StatusKey[]) {
      const ratio = contrastRatio(tone(mode, `--c-tint-${kebab(key)}`), s.card);
      expect(ratio, `${key} wash against the card is ${ratio.toFixed(3)}:1`).toBeGreaterThan(1.06);
    }
  });

  it('separates the three hues from each other at every strength that sits side by side', () => {
    // Green, yellow and red have to be told apart as bands in a chart and as
    // segments in a bar. Not an accessibility threshold — shape, hatch and the
    // written label carry those — but a wash where all three measure the same
    // is a wash doing no work at all.
    for (const role of ['wash', 'band', 'track', 'fill'] as const) {
      const seen = new Map<string, string>();
      for (const hue of ['green', 'yellow', 'red']) {
        const v = tone(mode, `--c-hue-${hue}-${role}`);
        expect(seen.has(v), `${hue} ${role} duplicates ${seen.get(v)}`).toBe(false);
        seen.set(v, hue);
      }
    }
  });

  it('keeps the key swatch legible as a swatch, hairline and all', () => {
    // WHAT `--c-hue-*-band` ACTUALLY IS, and this test used to have it wrong.
    //
    // It measured the point MARK against this role, which sounds right and is
    // a pair that never appears: `-band` is drawn in exactly one place, the
    // 18×12 key swatch in MultiTrendChart, and nothing is ever plotted on it.
    // The ground a mark really lands on is `-fill`, which the test above
    // measures. The two agreed for as long as every mark was lighter than
    // every band; they stopped agreeing when the out-of-range mark had to step
    // toward the ground instead (see MARK_SHIFT_DARK), and what failed was an
    // assertion about a thing nobody can see.
    //
    // What the swatch does need is its own hairline — the same rule every
    // boundary on the chart follows, so the key reads in greyscale too.
    for (const hue of BAND_HUES) {
      const swatch = tone(mode, `--c-hue-${hue}-band`);
      const ratio = contrastRatio(tone(mode, '--c-chart-reference-edge'), swatch);
      expect(ratio, `the key swatch hairline on ${hue} is ${ratio.toFixed(2)}:1`).toBeGreaterThan(1.3);
    }
  });
});

/**
 * THE SPARK'S SHAPE, which is one shape in both themes.
 *
 * `radius` and `ramp` are geometry — a spark is the same object whichever room
 * it is in, and only how much of it there is changes with the ground. So these
 * are asserted once rather than per theme, and the per-theme half is measured
 * above.
 */
describe('the point spark’s falloff', () => {
  it('is a falloff: ascending offsets, descending shares, nothing at the rim', () => {
    const offsets = SPARK.ramp.map(([offset]) => offset);
    const shares = SPARK.ramp.map(([, share]) => share);
    expect(offsets[0], 'the ramp starts at the centre').toBe(0);
    expect(offsets[offsets.length - 1], 'the ramp ends at the rim').toBe(1);
    expect(shares[0], 'the core is the full strength').toBe(1);
    // NOTHING AT THE RIM, and it is not a nicety: a gradient that ends above
    // zero ends at an EDGE, which is the flat 13px disc this replaced.
    expect(shares[shares.length - 1], 'the ramp reaches nothing at its rim').toBe(0);
    for (const [i, offset] of offsets.entries()) {
      if (i === 0) continue;
      expect(offset, `offset ${offset} does not follow ${offsets[i - 1]}`).toBeGreaterThan(offsets[i - 1]);
      expect(shares[i], `share ${shares[i]} rises above ${shares[i - 1]}`).toBeLessThanOrEqual(shares[i - 1]);
    }
  });

  it('holds its plateau behind the glyph, and falls fast once outside it', () => {
    // A mark of radius r sits inside a halo of `radius`×r, so the glyph's own
    // edge is at 1/radius of the way out. THE PLATEAU MUST REACH IT: that is
    // what makes the mark's stroke sit on flat light rather than on a gradient
    // (which would shade one side of a 5px triangle differently from the other)
    // and it is what makes the visible part of the halo start on the falloff.
    const glyphEdge = 1 / SPARK.radius;
    const plateau = SPARK.ramp.filter(([, share]) => share === 1).map(([offset]) => offset).pop() ?? 0;
    expect(plateau, `the plateau ends at ${plateau} and the glyph's edge is at ${glyphEdge.toFixed(3)}`).toBeGreaterThanOrEqual(
      glyphEdge,
    );
    // TIGHT CORE, WIDE TAIL. Half the strength must be gone by the time the
    // halo is halfway out, or what is drawn is a disc with soft edges.
    const halfway = SPARK.ramp.find(([offset]) => offset >= 0.5)?.[1] ?? 1;
    expect(halfway, `the ramp still carries ${halfway} of its core at half the radius`).toBeLessThanOrEqual(0.6);
  });

  it('is solved per theme rather than reused, and the two land at the same presence', () => {
    /**
     * THE TWO THEMES CANNOT SHARE A NUMBER HERE, and it is not a preference.
     * In dark the halo is white — light added to a near-black card, which reads
     * as emission. In light it is espresso on a near-white card, which is a soft
     * shadow. Two different phenomena rendering one idea.
     *
     * ── AND THE ALPHAS ARE NO LONGER COMPARABLE (Aug 2026) ─────────────────
     *
     * This test used to assert `dark > light`, on the reasoning that ink
     * carries further per unit of alpha than light does. That was true while
     * BOTH halos were the same status colour. They are different colours now,
     * so their alphas answer different questions and neither ordering means
     * anything — asserting one would be pinning a coincidence.
     *
     * What is asserted instead is the thing the ordering was a proxy for: the
     * spark has COMPARABLE PRESENCE in the two rooms, measured off the card.
     * The per-theme bounds are in the theme suites above; this is the pair.
     */
    const separation = (mode: 'light' | 'dark') => {
      const card = tone(mode, '--c-chart-surface');
      return contrastRatio(blend(tone(mode, '--c-chart-spark-halo'), card, SPARK.core[mode]), card);
    };
    const [light, dark] = [separation('light'), separation('dark')];
    const ratio = Math.max(light, dark) / Math.min(light, dark);
    expect(
      ratio,
      `the halo stands ${light.toFixed(2)}:1 off the card in light and ${dark.toFixed(2)}:1 in dark`,
    ).toBeLessThan(1.5);

    // The line's casing IS still the same colour in both themes — the status
    // hues — so its two alphas remain comparable and the old ordering holds.
    expect(SPARK.line.alpha.dark, 'the casing is no brighter in dark than in light').toBeGreaterThan(
      SPARK.line.alpha.light,
    );
    // And the earlier points are always quieter than the most recent one.
    expect(SPARK.pastShare).toBeGreaterThan(0);
    expect(SPARK.pastShare).toBeLessThan(1);
  });

  it('draws its casing outermost-first and faintest-first', () => {
    // The layers composite, so a wider layer painted at a HIGHER share would
    // put the strongest light furthest from the line — which is not a falloff,
    // it is a halo with a hole in it.
    const layers = [...SPARK.line.layers];
    for (const [i, layer] of layers.entries()) {
      if (i === 0) continue;
      expect(layer.extra, `layer ${i} is ${layer.extra}px wide, no narrower than ${layers[i - 1].extra}`).toBeLessThan(
        layers[i - 1].extra,
      );
      expect(layer.share, `layer ${i} is fainter than the wider one outside it`).toBeGreaterThan(layers[i - 1].share);
    }
    expect(layers[layers.length - 1].share, 'the innermost layer carries the full casing alpha').toBe(1);
    expect(layers.length, 'two layers leave a visible edge — see SPARK.line').toBeGreaterThanOrEqual(3);
  });
});

/**
 * The bug that made the entire status colour layer invisible, and the guard
 * that stops it coming back.
 *
 * The custom properties hold bare channels ("205 218 193") so Tailwind can
 * composite an opacity into them. A token handed to a `style` prop, an SVG
 * `fill` or a gradient stop as a bare `var(--x)` therefore resolves to a
 * string that is not a colour — the browser silently drops the declaration and
 * the element renders in inherited text colour or black. Nothing throws,
 * nothing logs, and a status badge, a chart band and a range bar all quietly
 * turn grey. Every runtime token must be wrapped in `rgb()`.
 */
describe('runtime colour tokens', () => {
  const runtime: [string, string][] = [
    ...Object.entries(status).map(([k, v]) => [`status.${k}.cssVar`, v.cssVar] as [string, string]),
    ...Object.entries(statusTint).flatMap(([k, roles]) =>
      Object.entries(roles).map(([r, v]) => [`statusTint.${k}.${r}`, v] as [string, string]),
    ),
    ...Object.entries(hueTint).flatMap(([k, roles]) =>
      Object.entries(roles).map(([r, v]) => [`hueTint.${k}.${r}`, v] as [string, string]),
    ),
    // What a result with NO status paints as. It is reached by exactly the same
    // style props, SVG fills and gradient stops as the five, so it fails in
    // exactly the same silent way if it is ever written as a bare var().
    ...Object.entries(NO_STATUS_PAINT).map(([r, v]) => [`NO_STATUS_PAINT.${r}`, v] as [string, string]),
    ...Object.entries(chart)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [`chart.${k}`, v as string] as [string, string]),
  ];

  it('wraps every one in rgb(), so it is a colour rather than three numbers', () => {
    for (const [name, value] of runtime) {
      expect(value, `${name} = "${value}" is not a usable colour value`).toMatch(
        /^rgb\(var\(--c-[a-z0-9-]+\)\)$/,
      );
    }
  });

  it('points every one at a variable the theme actually emits', () => {
    // A typo in a variable name fails exactly the same way — silently, in
    // black — so the reference is checked as well as the shape.
    for (const [name, value] of runtime) {
      const varName = value.replace(/^rgb\(var\(/, '').replace(/\)\)$/, '');
      for (const mode of MODES) {
        expect(themeTokens[mode][varName], `${name} points at ${varName}, which ${mode} does not emit`).toBeTruthy();
      }
    }
  });
});

/** Composite `hex` at `alpha` over `bg` — what an opacity modifier actually renders as. */
/**
 * WCAG relative luminance. `contrastRatio` is the right tool for "can this be
 * read" and the wrong one for "how much lighter is this": its +0.05 floor makes
 * two RGB levels of white look like a whole surface against a near-black page,
 * and a third of pure white look like nothing against a cream one. The sheen is
 * a quantity of light, so it is measured as one.
 */
function luminance(hex: string): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function blend(hex: string, bg: string, alpha: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(hex);
  const [r2, g2, b2] = p(bg);
  const c = (a: number, b: number) =>
    Math.round(a * alpha + b * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * THE SIDEBAR PANEL, in both shells.
 *
 * It is a translucent wash rather than a surface, so none of it is a token you
 * can read straight out of the map: what lands on screen is `--c-panel` at
 * `PANEL_WASH_ALPHA` over whatever happens to be behind, and "whatever happens
 * to be behind" is the page in most of the column and the corner glow in the
 * top-right of it. So each pair is composited here first and then measured.
 *
 * `--c-panel` IS `--c-glass` (tokens.ts sets both from one expression), which
 * is asserted below rather than assumed: the sidebar and the pinned control bar
 * are one material, and two names for one colour is one edit away from being
 * two colours.
 *
 * Four properties, and the panel is wrong if any one of them goes:
 *
 *  1. It reads as a panel against the plain page — the far corner, where there
 *     is no glow at all and the wash is the only thing distinguishing the two
 *     regions.
 *  2. It still lets the light through — the near corner, where the panel must
 *     be visibly brighter than its own unlit part rather than a flat lid over
 *     the glow.
 *  3. Every label on it still clears AA, on the darkest part of the panel AND
 *     on the brightest. A wash that lifts the surface eats the contrast of the
 *     text standing on it, and the inactive nav label is the tightest of them.
 */
describe.each(MODES)('%s sidebar panel', (mode) => {
  const page = tone(mode, '--c-cream');
  const card = tone(mode, '--c-cream-50');
  const wash = tone(mode, '--c-panel');
  const alpha = PANEL_WASH_ALPHA[mode];

  // THE GLOW IS DRAWN IN BOTH THEMES NOW (Aug 2026), so the light-mode panel has
  // a near corner and a far corner as well and this is no longer measuring a
  // fiction there. The alpha comes from `GLOW.primary` rather than a literal, so
  // moving the source's strength moves this measurement with it — the sidebar is
  // against the left edge and the primary source is anchored at 96% 1%, so the
  // core is the pessimistic backdrop rather than the real one.
  const glowCore = blend(tone(mode, '--c-glow'), page, GLOW.primary[mode]);

  const panelOnPage = blend(wash, page, alpha);
  const panelOnGlow = blend(wash, glowCore, alpha);
  // The specular band at its peak, over the brightest backdrop the panel has.
  // In light that is the page (no glow is drawn); in dark it is the glow core,
  // which is already the pessimistic case since the source is anchored at the
  // opposite corner of the viewport from this column.
  const sheen = tone(mode, '--c-sheen');
  const panelSheened = blend(sheen, panelOnGlow, PANEL_SHEEN.peak[mode]);

  /**
   * ── THE MATERIAL IS SHARED; THE COLOUR IS NOT, IN DARK (Aug 2026) ────────
   *
   * This used to assert `--c-panel === --c-glass` outright, and the reason was
   * good: the sidebar had carried espresso at 6%/38% while the control bar
   * carried the card tone, which is one material in name and two on screen.
   *
   * What that unification got right is the MATERIAL — the same blur, the same
   * saturation, the same specular streak, the same lit edge, the same grain,
   * and those are still shared and still emitted from one record. What it got
   * wrong for this one surface is the COLOUR: the card tone is a pale warm
   * brown, the dark surface scale lifts toward a warm mid-brown, and at 78%
   * over the page the column resolved to #252220 — a BROWN rail beside a
   * near-black page, which is precisely the register `nightBase`'s own note
   * warns against. Dark takes a near-black of its own now.
   *
   * ── AND LIGHT FOLLOWED IT (Aug 2026), FOR A DIFFERENT REASON WITH THE SAME
   *    SHAPE ────────────────────────────────────────────────────────────────
   *
   * The light page is a soft near-white now, so the card tone on it was a
   * near-white sheet on a near-white page: 1.13:1 of total headroom for the
   * whole ladder, and a white specular that lifted the pane by 1% where the
   * material's own test asks for 2%. Light's column goes DOWN off the page too.
   *
   * So the claim is the same in both themes and is stated once: the sidebar is
   * its own colour, and it is BELOW the page rather than above it. The material
   * is asserted where it lives — the blur, the saturation and the sheen are one
   * record shared with `.glass`, and `e2e/patient-sidebar.spec.ts` reads them
   * off the element.
   */
  it('is its own colour, below the page, and the material is still the shared one', () => {
    expect(wash).not.toBe(tone(mode, '--c-glass'));
    expect(luminance(wash), 'the sidebar is not below the page').toBeLessThan(luminance(page));
  });

  /**
   * ⚠ THE FLOOR IS DIRECTION-AWARE, AND THE ARITHMETIC IS WHY.
   *
   * While the panel was LIGHTER than the page there was unlimited room above it
   * and 1.08:1 was an easy bar. Going the other way there is almost none:
   * WCAG's ratio is (L₁+0.05)/(L₂+0.05), the dark page's luminance is 0.0055,
   * so a panel of PURE BLACK — which the palette forbids — would measure
   * 0.0555/0.05 = 1.11:1 and that is the ceiling for the whole direction.
   * Asking for 1.08 downward is asking for a panel 3% off black.
   *
   * So dark is held at 1.03 and the separation is carried where it always
   * actually was: `--c-panel-edge` at 3.40:1, asserted below, which the note on
   * that token already calls "the whole of the separation wherever the glow
   * does not reach". Do not raise this floor without redoing the arithmetic —
   * the only way to satisfy it is a black sidebar.
   */
  it('separates from the page without becoming a card', () => {
    const fromPage = contrastRatio(panelOnPage, page);
    const cardFromPage = contrastRatio(card, page);
    const floor = mode === 'dark' ? 1.03 : 1.08;
    expect(fromPage, `panel against the page is ${fromPage.toFixed(3)}:1`).toBeGreaterThanOrEqual(floor);
    // Page, then panel, then card. A panel that has climbed past the card is a
    // surface again, and the whole point of a wash is that it is not one.
    expect(fromPage, `panel ${fromPage.toFixed(2)}:1 vs card ${cardFromPage.toFixed(2)}:1`).toBeLessThan(cardFromPage);
  });

  it.runIf(mode === 'dark')('dims the light without blocking it', () => {
    // Dimmer than the unwashed glow beside it...
    const dimmed = contrastRatio(glowCore, panelOnGlow);
    expect(dimmed, `the glow is only ${dimmed.toFixed(2)}:1 dimmer under the panel`).toBeGreaterThan(1.03);
    // ...and still plainly there, rather than a flat lid.
    const stillLit = contrastRatio(panelOnGlow, panelOnPage);
    expect(stillLit, `the lit part of the panel is only ${stillLit.toFixed(2)}:1 above the unlit part`).toBeGreaterThan(
      1.15,
    );
  });

  it('keeps every label on it at AA, lit and unlit', () => {
    const labels = {
      // The inactive nav label — the tightest pair in the panel.
      'nav label': tone(mode, '--c-taupe-900'),
      'active nav label': tone(mode, '--c-espresso'),
      'staff return link': tone(mode, '--c-bronze-700'),
    };
    for (const [name, colour] of Object.entries(labels)) {
      for (const [where, bg] of [
        ['unlit', panelOnPage],
        ['lit', panelOnGlow],
        // THE BRIGHTEST GROUND A LABEL EVER STANDS ON, added with the sheen
        // (Aug 2026). The specular band is drawn over the wash and under the
        // content, so a nav row in the top third of the column sits on the
        // panel PLUS the highlight. Measuring only the flat wash would leave
        // the one part of the panel the sheen changed unchecked, which is the
        // part it was added to.
        ['sheened', panelSheened],
      ] as const) {
        const ratio = contrastRatio(colour, bg);
        expect(ratio, `${name} on the ${where} panel is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
      }
    }
  });

  /**
   * THE SHEEN IS A HIGHLIGHT, NOT A SECOND SURFACE.
   *
   * It exists because the blur cannot do the job on its own — there is nothing
   * behind this column but a flat colour and a smooth gradient, and blurring a
   * smooth gradient returns it unchanged (see PANEL_SHEEN in tokens.ts). But a
   * band of light bright enough to turn the top of the column into a slab has
   * stopped being a reflection.
   *
   * MEASURED IN LUMINANCE, NOT IN CONTRAST RATIO, and the first attempt at this
   * test is why. Against a #11100e page the ratio is dominated by WCAG's +0.05
   * floor: two RGB levels of white measure 1.26:1, a hair under a card's 1.28,
   * so the check capped the dark sheen at about 0.022 — invisible — while
   * waving 0.30 of PURE WHITE through in light, where the same formula moves
   * 1.16 to 1.21. It was strict where nothing was wrong and slack where
   * something would have been. Contrast ratio answers "can this text be read",
   * which is the AA check above; it does not answer "how much lighter is this".
   *
   * The bound is per theme because the thing being bounded differs:
   *
   *  · DARK — A REFLECTION IS NEVER BRIGHTER THAN THE LIGHT IT REFLECTS. The
   *    glow lifts this panel by a measurable amount where it lands on it, and
   *    the sheen may add at most that much. Physical, self-adjusting, and it
   *    holds the sheen to the one thing on the page it is a reflection OF.
   *    (The panel over the glow is ALREADY brighter than a card — that is the
   *    light doing its job, and the ladder has always been about the panel's
   *    unlit body, which is what `separates from the page` measures.)
   *  · LIGHT — no glow is drawn at all, so there is no light to be a reflection
   *    of and the bound is the ladder itself: even at its peak the panel stays
   *    below a card.
   */
  it('is lit by the sheen without the highlight becoming a surface', () => {
    const flat = luminance(panelOnPage);
    const peak = luminance(blend(sheen, panelOnPage, PANEL_SHEEN.peak[mode]));
    // It does something. A sheen that measures identical to the flat wash is a
    // custom property somebody set to zero, which is the failure this whole
    // material was added to fix and would otherwise pass silently.
    expect(peak, `the sheen lifts the panel by ${(peak - flat).toFixed(5)}, which is nothing`).toBeGreaterThan(
      flat * 1.02,
    );

    if (mode === 'dark') {
      const lit = luminance(panelOnGlow);
      expect(
        peak - flat,
        `the sheen adds ${(peak - flat).toFixed(4)} where the glow itself adds only ${(lit - flat).toFixed(4)}`,
      ).toBeLessThanOrEqual(lit - flat);
    } else {
      expect(peak, `the sheened panel is at ${peak.toFixed(4)} against a card's ${luminance(card).toFixed(4)}`).toBeLessThan(
        luminance(card),
      );
    }
  });

  it('draws the hairline stronger than the border it replaced', () => {
    const edge = contrastRatio(tone(mode, '--c-panel-edge'), page);
    const taupe = contrastRatio(tone(mode, '--c-taupe'), page);
    expect(edge, `panel edge ${edge.toFixed(2)}:1 vs taupe ${taupe.toFixed(2)}:1`).toBeGreaterThan(taupe);
    // Legible on its own where the wash is faintest, but never a line of light.
    expect(edge).toBeGreaterThanOrEqual(1.6);
    expect(edge).toBeLessThan(WCAG_AA_TEXT);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE SECOND FAMILY — AND THE ONE RULE THAT KEEPS IT OFF THE STATUS COLOURS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two accents were added because the palette had none: bronze, espresso, cream,
 * taupe and five status hues all live between 10° and 90°, so the product had no
 * cool colour at all and the only accent anything could reach for was the brand
 * one.
 *
 * The constraint on them is not aesthetic. An accent may never be mistakable for
 * a STATE, because green, gold and red on this product are a statement about
 * somebody's blood. "Looks different enough" is not a check, so the separation
 * is stated as something measurable and asserted here:
 *
 *     BLUE IS STRICTLY THE LOWEST CHANNEL IN EVERY STATUS HUE AND IN BRONZE.
 *     IT IS NEVER STRICTLY THE LOWEST IN EITHER ACCENT, AT ANY STEP.
 *
 * It holds through the whole 50–900 ladder in both themes because mixing toward
 * white, toward espresso or toward the page moves all three channels together
 * and cannot reorder them — which is what makes this a structural claim rather
 * than a lucky one.
 */
describe('the accent family', () => {
  const channels = (hex: string) => {
    const n = hex.replace('#', '');
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)] as const;
  };
  /** Blue below BOTH of the others — the shape every warm hue in this palette has. */
  const blueStrictlyLowest = (hex: string) => {
    const [r, g, b] = channels(hex);
    return b < r && b < g;
  };

  /**
   * ⚠ THE BRAND ACCENT CAME OUT OF THIS LIST (Aug 2026), and the rule is
   * stronger for it.
   *
   * It used to read "every status hue AND bronze", because the whole palette was
   * warm and the accents were defined as the cool things in it. The palette is
   * neutral and cool throughout now — `brand.bronze` is a slate — so including
   * it would be asserting that the brand accent is warm, which is the thing that
   * was just deliberately undone.
   *
   * What is left is the claim that actually protects a reader: an accent must
   * never be mistakable for a STATE. The status hues are still all blue-lowest —
   * they are untouched, and they are the only colours in the product that mean
   * something clinical — and neither accent is. Losing bronze from the list
   * narrows the rule to exactly the surface it was written for.
   */
  it('gives every status hue the warm channel shape', () => {
    for (const [name, hex] of Object.entries(statusHue)) {
      expect(blueStrictlyLowest(hex), `${name} ${hex} is not blue-lowest, so the separation rule has no basis`).toBe(
        true,
      );
    }
  });

  it('pins the status hues as literals, so nothing changes them by accident', () => {
    // Pinned so a palette change cannot quietly take the clinical layer with it.
    // Every edit to this list is deliberate and is argued at `statusHue`.
    //
    // ── THE YELLOW WAS REPLACED (Aug 2026), AND THE OLIVE WITH IT ──────────
    //
    // #C79A16 → #EAB308: the old seed read as a dingy mustard, and because a
    // band fill is bounded by `bandChromaCeiling` — the colourfulness of the
    // brand hue it derives from — a dull seed capped how clean the band could
    // ever be. 0.1405 → 0.1617 of OKLab chroma at the same 45° hue angle.
    //
    // Olive follows by construction rather than by choice: it is the exact RGB
    // midpoint of green and yellow, and a hinge that is not the midpoint of its
    // own two neighbours is a third colour wearing a hinge's name.
    expect(statusHue).toEqual({
      green: '#5E8C3A',
      olive: '#A7AF36',
      yellow: '#F5CE3E',
      orange: '#C4711F',
      red: '#B23A28',
    });
    // The hinge really is the midpoint, checked rather than trusted — and in
    // OKLCH, which is the space every blend between two status colours is
    // computed in since Aug 2026. See `oklchMix`.
    expect(oklchMix(statusHue.green, statusHue.yellow, 0.5).toLowerCase()).toBe(statusHue.olive.toLowerCase());
  });

  it('gives neither accent that shape, at any step, in either theme', () => {
    for (const family of ['teal', 'slate'] as const) {
      for (const scale of [accentScales[family], darkAccentScales[family]]) {
        for (const [step, hex] of Object.entries(scale)) {
          expect(
            blueStrictlyLowest(hex),
            `${family}-${step} is ${hex}, which has the channel shape of a status hue`,
          ).toBe(false);
        }
      }
    }
  });

  /**
   * BURNT AMBER WAS THE THIRD CANDIDATE AND IT FAILS THIS. Written down here
   * rather than in a comment because "we considered it and rejected it" is only
   * worth anything if the rejection can be re-run: amber lands around 35–40°,
   * between bronze at 22° and the status gold at 45°, and there is no opacity at
   * which a decorative hue the colour of ABOVE RANGE becomes safe on a page of
   * blood results.
   */
  it('rejects burnt amber by the same rule it accepted the other two by', () => {
    expect(blueStrictlyLowest('#B5651D'), 'burnt amber has the channel shape of a status hue').toBe(true);
  });

  it('keeps both accents out of the marker surfaces entirely', () => {
    // Neither accent may be the value of a token any status surface reads. This
    // is the token-level half of the rule; the class-level half is that a tinted
    // card refuses the pane material outright (see Card.tsx).
    const forbidden = new Set<string>(Object.values(accent).map((h) => h.toLowerCase()));
    for (const mode of MODES) {
      for (const key of [
        '--c-tint-in-range',
        '--c-tint-high',
        '--c-tint-significant-high',
        '--c-hue-green-fill',
        '--c-hue-yellow-fill',
        '--c-hue-red-fill',
        '--c-rangemark',
        '--c-chart-reference-edge',
      ]) {
        expect(forbidden.has(tone(mode, key).toLowerCase()), `${key} in ${mode} is an accent hue`).toBe(false);
      }
    }
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TWO AMBIENT SOURCES, AND THE CONTRAST AT EVERY CORNER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A glow sits at `z-index: -1` behind every scrap of content, so it cannot
 * reduce the contrast of a character directly. What it does is change the GROUND
 * a character stands on, and the page is a ground: every heading and every line
 * of body copy outside a card sits on it.
 *
 * ── AND THERE ARE FOUR OF THEM NOW (Aug 2026) ──────────────────────────────
 *
 * A key at 50% 0%, a fill at 0% 50%, a green at 99% 99%, and a diagonal ribbon
 * of five soft blobs crossing the whole viewport. The cores are still measured
 * one at a time below, because "no page token fails under any single source" is
 * a claim worth keeping legible — but the claim that MATTERS is the sampled one:
 * every point of the viewport with all four composited in paint order, worst
 * ground wins. Adding a source without adding it to the sampler would leave that
 * measurement quietly describing a page that is no longer the one being drawn.
 */
describe.each(MODES)('%s ambient sources', (mode) => {
  const page = tone(mode, '--c-cream');
  const card = tone(mode, '--c-cream-50');

  /**
   * The three source positions and radii, exactly as globals.css writes them.
   *
   * ⚠ THE RADII ARE PER MODE NOW (Aug 2026, fourth pass) — `GLOW.radius[mode]`,
   * read from tokens.ts rather than restated as a number, so a change to the
   * size in the token layer cannot silently stop being the size this sampler
   * measures. Stored there as CSS percentage strings (`'112%'`), parsed back to
   * the fraction this geometry works in.
   */
  const pct = (s: string) => parseFloat(s) / 100;
  const SOURCES = {
    rx: pct(GLOW.radius[mode].x),
    ry: pct(GLOW.radius[mode].y),
    a: { x: 0.5, y: 0 },
    b: { x: 0, y: 0.5 },
    c: { x: 0.99, y: 0.99 },
  };

  /**
   * THE DIAGONAL RIBBON, as globals.css writes it: five soft blobs whose centres
   * follow a bowed diagonal, each at its own share of the streak's peak so the
   * band fades into both corners. Restated here for the same reason the ramp is
   * — this block is only worth anything if it is sampling the thing that paints.
   */
  const STREAK = {
    rx: pct(GLOW.streakRadius[mode].x),
    ry: pct(GLOW.streakRadius[mode].y),
    blobs: [
      { x: 0.04, y: 0.08, share: 0.45 },
      { x: 0.32, y: 0.2, share: 0.85 },
      { x: 0.56, y: 0.38, share: 1 },
      { x: 0.78, y: 0.62, share: 0.85 },
      { x: 0.96, y: 0.92, share: 0.6 },
    ],
  };

  /** The ribbon's own five-stop ramp, again as written. */
  const STREAK_RAMP: [number, number][] = [
    [0, 1],
    [0.25, 0.6],
    [0.5, 0.28],
    [0.75, 0.09],
    [1, 0],
  ];

  /**
   * The ramp, as multiples of a source's peak — the same nine stops globals.css
   * writes, restated here so the sampling below is measuring the curve that is
   * actually painted rather than a linear stand-in for it.
   */
  const RAMP: [number, number][] = [
    [0, 1],
    [0.09, 0.7],
    [0.19, 0.4125],
    [0.3, 0.25],
    [0.42, 0.1375],
    [0.55, 0.0675],
    [0.7, 0.0275],
    [0.85, 0.0075],
    [1, 0],
  ];

  /** A source's alpha at `r` radii from its own centre, interpolated as CSS does. */
  function rampAt(r: number, peak: number, ramp: [number, number][] = RAMP): number {
    if (r >= 1) return 0;
    for (let i = 1; i < ramp.length; i++) {
      const [x1, y1] = ramp[i];
      if (r <= x1) {
        const [x0, y0] = ramp[i - 1];
        const t = x1 === x0 ? 0 : (r - x0) / (x1 - x0);
        return (y0 + (y1 - y0) * t) * peak;
      }
    }
    return 0;
  }

  /**
   * The ribbon at one point: five blobs in one background-image list, so they
   * composite over each other in paint order (first layer on top) rather than
   * summing. Modelled the same way here.
   */
  function streakAt(x: number, y: number): number {
    let alpha = 0;
    for (const blob of [...STREAK.blobs].reverse()) {
      const r = Math.hypot((x - blob.x) / STREAK.rx, (y - blob.y) / STREAK.ry);
      const a = rampAt(r, GLOW.streak[mode] * blob.share, STREAK_RAMP);
      alpha = 1 - (1 - alpha) * (1 - a);
    }
    return alpha;
  }

  const underPrimary = blend(tone(mode, '--c-glow'), page, GLOW.primary[mode]);
  const underSecondary = blend(tone(mode, '--c-glow-2'), page, GLOW.secondary[mode]);
  const underTertiary = blend(tone(mode, '--c-glow-3'), page, GLOW.tertiary[mode]);

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE WHOLE VIEWPORT, SAMPLED — WHICH REPLACED "CHECK EACH CORNER".
   * ═════════════════════════════════════════════════════════════════════════
   *
   * The sources used to be 2.07 radii apart, so at every point at least one had
   * already reached zero and no pixel carried both. That was the entire
   * justification for measuring the two cores separately, and it stopped being
   * true the moment they were enlarged to 88% × 80% (1.49 radii apart now).
   *
   * So the measurement changed rather than the claim being quietly dropped: the
   * viewport is sampled on a grid, BOTH ramps are composited at every point in
   * paint order, and the worst ground found anywhere is what the floors are
   * asserted against. It is a strictly stronger check than the corners were —
   * the corners are two of the points it visits — and, unlike them, it survives
   * somebody making these bigger again, moving one, or adding a third.
   *
   * The vignette is deliberately NOT composited in. It only ever darkens, and in
   * dark mode darkening the ground moves the contrast of light text the SAFE
   * way; including it would flatter every number here.
   */
  const worstGround = (() => {
    const g1 = tone(mode, '--c-glow');
    const g2 = tone(mode, '--c-glow-2');
    const g3 = tone(mode, '--c-glow-3');
    const streak = tone(mode, '--c-streak');
    let worst = page;
    let worstRatio = Infinity;
    let at = { x: 0, y: 0 };
    const STEPS = 60;
    for (let i = 0; i <= STEPS; i++) {
      for (let j = 0; j <= STEPS; j++) {
        const x = i / STEPS;
        const y = j / STEPS;
        const a1 = rampAt(Math.hypot((x - SOURCES.a.x) / SOURCES.rx, (y - SOURCES.a.y) / SOURCES.ry), GLOW.primary[mode]);
        const a2 = rampAt(Math.hypot((x - SOURCES.b.x) / SOURCES.rx, (y - SOURCES.b.y) / SOURCES.ry), GLOW.secondary[mode]);
        const a3 = rampAt(Math.hypot((x - SOURCES.c.x) / SOURCES.rx, (y - SOURCES.c.y) / SOURCES.ry), GLOW.tertiary[mode]);
        // Paint order, bottom to top: the ribbon is on `html::before` and is
        // therefore under everything body paints; then the key (first gradient
        // in body::before's stack), the fill, and the green.
        const ground = blend(g3, blend(g2, blend(g1, blend(streak, page, streakAt(x, y)), a1), a2), a3);
        // "Worst" is decided on BODY COPY, which is the token with the least
        // room and the one every other floor is a fraction of.
        const r = contrastRatio(tone(mode, '--c-espresso'), ground);
        if (r < worstRatio) {
          worstRatio = r;
          worst = ground;
          at = { x, y };
        }
      }
    }
    return { ground: worst, ratio: worstRatio, at };
  })();

  it('reports where on the page the ambient layer bites hardest', () => {
    // eslint-disable-next-line no-console
    console.log(
      `  ${mode}: worst ground ${worstGround.ground} at ${(worstGround.at.x * 100).toFixed(0)}%,` +
        `${(worstGround.at.y * 100).toFixed(0)}% — body copy ${worstGround.ratio.toFixed(2)}:1` +
        ` (bare page ${contrastRatio(tone(mode, '--c-espresso'), page).toFixed(2)}:1)`,
    );
    // The sampler has to actually find the light. If the worst point it can find
    // is the bare page, every ramp resolved to zero and this whole block is
    // measuring nothing — which is exactly how a broken custom property would
    // look from in here.
    expect(worstGround.ground, 'the sampler never found any source').not.toBe(page);
    // And it has to find the RIBBON, which is the one source with no core of its
    // own in a corner — if `streakAt` returned zero everywhere the grid would
    // still find the key and this block would pass while measuring three
    // sources out of four.
    expect(streakAt(0.56, 0.38), 'the ribbon resolved to nothing at its own brightest blob').toBeGreaterThan(0);
  });

  it('leaves every text token above its floor at the worst point on the page', () => {
    const body = contrastRatio(tone(mode, '--c-espresso'), worstGround.ground);
    expect(body, `body copy at the worst point in ${mode} is ${body.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      WCAG_AA_TEXT,
    );
    for (const token of ['--c-bronze', '--c-taupe-900']) {
      const r = contrastRatio(tone(mode, token), worstGround.ground);
      expect(r, `${token} at the worst point in ${mode} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        WCAG_AA_LARGE_TEXT,
      );
    }
  });

  it('still lets a card separate from the page at the worst point', () => {
    const r = contrastRatio(card, worstGround.ground);
    expect(r, `a card at the worst point in ${mode} is ${r.toFixed(2)}:1 off the page`).toBeGreaterThan(1.05);
  });

  /**
   * ⚠ THIS USED TO ASSERT THE KEY LIGHT WAS WARM (Aug 2026).
   *
   * That was the right check while the product was: a gold key against a teal
   * fill is unmistakably two lamps. Both lights are cool now — the gold was the
   * last warm thing left after the retheme and the most visible — so "one is
   * warm" is no longer the thing that separates them.
   *
   * What always mattered is that they are DISTINGUISHABLE, so that is what is
   * measured: a real hue angle between them. Two cool lights 34° apart still
   * read as two sources; two lights of one colour are one wide light, which is
   * exactly the failure the original pair of viewport-sized radials had.
   */
  const chan = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const hueOf = (hex: string) => {
    const [r, g, b] = chan(hex).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d === 0) return 0;
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
    return h * 360;
  };

  /**
   * ── THREE SOURCES NOW, AND THE CLAIM IS PAIRWISE (Aug 2026) ────────────────
   *
   * The brief is a page lit in blue, white and a touch of green rather than one
   * flat field, and "three lamps" is only true if a reader can name them
   * separately. Two sources 10° apart are one light with a wide falloff, which
   * is the failure this file has recorded twice — once for the original pair of
   * viewport-sized radials, and once when the retheme left the key and the teal
   * fill 4° apart. Asserting it PAIRWISE is what stops a third source being
   * added into the gap between the first two.
   */
  it('gives every source a hue a reader could name separately from the others', () => {
    const sources = {
      key: tone(mode, '--c-glow'),
      fill: tone(mode, '--c-glow-2'),
      green: tone(mode, '--c-glow-3'),
    };
    const names = Object.keys(sources) as (keyof typeof sources)[];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = sources[names[i]];
        const b = sources[names[j]];
        expect(a, `${names[i]} and ${names[j]} are the same colour`).not.toBe(b);
        const apart = Math.abs(hueOf(a) - hueOf(b));
        const separation = Math.min(apart, 360 - apart);
        expect(
          separation,
          `${names[i]} and ${names[j]} are ${separation.toFixed(0)}° apart in ${mode}`,
        ).toBeGreaterThan(20);
      }
    }
  });

  /**
   * ⚠ THE THIRD SOURCE MAY NOT BE A STATUS GREEN, AND THIS IS THE
   * MACHINE-CHECKABLE FORM OF THAT. Every status hue in this palette has blue
   * strictly lowest; that is the rule the two brand accents already answer to,
   * for the reason that a decorative hue with a state's channel shape reads as
   * a state. An ambient green in the corner of a results page is the one
   * ambient decision capable of being read as a finding, so dark's third source
   * is a MINT — red lowest — and no alpha of it over any surface can reorder
   * the channels.
   *
   * ⚠ LIGHT'S PALETTE WENT WARM (Aug 2026, fifth pass) AND THIS STILL HOLDS,
   * WHICH IS WORTH NOTING RATHER THAN ASSUMING. Blue-lowest is what warm means
   * in sRGB, so a bronze-and-gold palette could easily have failed this
   * outright — it does not, because the one hue placed in the THIRD role (the
   * only one this test reads) is the rose, chosen specifically to sit outside
   * the crowded warm band and out past red toward magenta, where there is
   * enough blue that blue is never the lowest channel either. See `GLOW` in
   * tokens.ts for the palette's own account of why. `--c-glow` and `--c-glow-2`
   * were never bound by this rule and are not checked by it, in either theme.
   */
  it('keeps the third source out of the shape of a status colour', () => {
    const [r, g, b] = chan(tone(mode, '--c-glow-3'));
    expect(b, `the third source is ${tone(mode, '--c-glow-3')}, which has blue lowest`).toBeGreaterThan(Math.min(r, g));
  });

  /**
   * ⚠ AND THE WARM PALETTE NEEDS A SECOND, MORE GENERAL CHECK ALONGSIDE THE
   * ONE ABOVE (Aug 2026, fifth pass). The channel-order test above reads one
   * custom property; a palette built from bronze, gold and rose sits, by
   * definition, in the same hue neighbourhood the clinical reds, oranges and
   * yellows already occupy — "warm" and "close to a status hue's own angle"
   * are close to the same request. So every LIGHT point source is measured by
   * hue DISTANCE against every status hue directly: none may land within 5° of
   * one. Measured at the values in this palette, the closest pair is the fill
   * against red at 6.1° — the floor is set with a point of margin under that
   * rather than exactly on it.
   *
   * DARK IS UNCHECKED HERE ON PURPOSE. Its three sources are the cool blues and
   * mint this file has always used, nowhere near the 0-90° arc the five status
   * hues occupy, and asserting a floor neither theme's palette was designed
   * against would be pinning a coincidence rather than a decision.
   */
  if (mode === 'light') {
    it("is well clear of every status hue's own angle", () => {
      const sources = {
        key: tone(mode, '--c-glow'),
        fill: tone(mode, '--c-glow-2'),
        third: tone(mode, '--c-glow-3'),
      };
      for (const [name, hex] of Object.entries(sources)) {
        for (const [statusName, statusHex] of Object.entries(statusHue)) {
          const apart = Math.abs(hueOf(hex) - hueOf(statusHex));
          const separation = Math.min(apart, 360 - apart);
          expect(
            separation,
            `${name} (${hex}) is ${separation.toFixed(1)}° from statusHue.${statusName} (${statusHex})`,
          ).toBeGreaterThan(5);
        }
      }
    });
  }

  it('is a fill rather than a second key', () => {
    // Equal sources cancel each other's direction and the page goes flat again
    // with more colour in it. Key, fill and green are strictly ordered in both
    // themes for that reason.
    expect(GLOW.secondary[mode]).toBeLessThan(GLOW.primary[mode]);
    expect(GLOW.tertiary[mode]).toBeLessThan(GLOW.secondary[mode]);
    // ⚠ THE RIBBON WAS "QUIETEST OF THE FOUR" THROUGH THE SIXTH PASS, IN BOTH
    // THEMES — DARK STILL IS. It covers the whole viewport there, so it is the
    // source with the most of the page inside it, and that reasoning still
    // holds for a theme nobody asked to change.
    //
    // LIGHT NO LONGER IS (Aug 2026, seventh pass — "I like the PS4 streak
    // thing, implement that"). The brief was for the ribbon to be SEEN, which
    // is the opposite request from "quietest of the four", so it moved up
    // rather than staying pinned under a rule built for the opposite brief.
    // It still sits below the key, which stays the single brightest source in
    // both themes by construction.
    if (mode === 'dark') {
      expect(GLOW.streak[mode]).toBeLessThan(GLOW.tertiary[mode]);
    } else {
      expect(GLOW.streak[mode]).toBeLessThan(GLOW.primary[mode]);
    }
  });

  /**
   * ⚠ THE FLOOR. Body copy on the page clears AA text under either source at its
   * core; everything else on the page clears AA-large.
   *
   * `--c-bronze` is held to the LARGE floor rather than the text one, and that
   * is not a concession made for the glows: it measures 4.18:1 on the bare cream
   * page before any of this exists, so it has never been a body-text colour
   * there. It is a link and an accent, and 3:1 is the floor it has always
   * answered to.
   */
  it('leaves every text token on the page above its floor at every core', () => {
    for (const [where, ground] of [
      ['bare page', page],
      ['under the key light', underPrimary],
      ['under the fill light', underSecondary],
      ['under the green light', underTertiary],
    ] as const) {
      const body = contrastRatio(tone(mode, '--c-espresso'), ground);
      expect(body, `body copy ${where} in ${mode} is ${body.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
      for (const token of ['--c-bronze', '--c-taupe-900']) {
        const r = contrastRatio(tone(mode, token), ground);
        expect(r, `${token} ${where} in ${mode} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
      }
    }
  });

  /**
   * ── AND THE TWO THEMES NEED TWO DIFFERENT CLAIMS HERE ──────────────────────
   *
   * DARK had a key light before this pass, so the claim that means anything
   * about the NEW one is comparative: the fill must not take any page token
   * below where the source already there puts it. It is a long way from doing
   * so — teal at 0.20 on near-black is a far gentler ground than gold at 0.36.
   *
   * LIGHT had no glow at all, so there is no prior source to compare with and a
   * comparative test there would be measuring one new thing against another.
   * What is asserted instead is a BUDGET, and it is PER SOURCE rather than
   * combined: each of the three point sources may spend at most a sixth of the
   * bare page's own body-copy contrast, measured at its own core alone.
   *
   * ⚠ THIS IS WHAT ACTUALLY BOUNDS THE FILL'S PEAK (Aug 2026, fourth pass) —
   * see the note on `GLOW.secondary` in tokens.ts. Measured at the current
   * values: key 7.0%, green 8.0%, fill 14.8% — the fill is a genuine mid blue
   * rather than a near-white tint like the other two, so it is the one this
   * budget actually binds.
   */
  if (mode === 'dark') {
    it('never makes a ground harsher than the source that was already there', () => {
      for (const token of ['--c-espresso', '--c-bronze', '--c-taupe-900']) {
        const withFill = contrastRatio(tone(mode, token), underSecondary);
        const withKey = contrastRatio(tone(mode, token), underPrimary);
        expect(
          withFill,
          `${token} is ${withFill.toFixed(2)}:1 under the new fill against ${withKey.toFixed(2)}:1 under the existing key`,
        ).toBeGreaterThanOrEqual(withKey);
      }
    });
  } else {
    it('spends at most a sixth of the page’s own contrast on either source', () => {
      const bare = contrastRatio(tone(mode, '--c-espresso'), page);
      for (const [which, ground] of [
        ['key', underPrimary],
        ['fill', underSecondary],
        ['green', underTertiary],
      ] as const) {
        const lit = contrastRatio(tone(mode, '--c-espresso'), ground);
        expect(lit / bare, `the ${which} light costs ${(100 - (lit / bare) * 100).toFixed(1)}% of the page`).toBeGreaterThan(
          0.85,
        );
      }
    });
  }

  it('still lets a card separate from the page it is lit on', () => {
    for (const [where, ground] of [
      ['under the key light', underPrimary],
      ['under the fill light', underSecondary],
      ['under the green light', underTertiary],
    ] as const) {
      const r = contrastRatio(card, ground);
      expect(r, `a card ${where} in ${mode} is ${r.toFixed(2)}:1 off the page`).toBeGreaterThan(1.05);
    }
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE PAGE-SURFACE PANE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The third alpha in the glass family, on the structural surfaces of a page.
 * Three things have to hold at once and they pull against each other: it has to
 * be a visible surface, it has to stay below a card (a container must not
 * out-read the things inside it), and every piece of text on it has to clear AA
 * against the BRIGHTEST backdrop the material can produce — which is the pane
 * over a lit page with its own specular streak at peak on top of that.
 */
describe.each(MODES)('%s page-surface pane', (mode) => {
  const page = tone(mode, '--c-cream');
  const card = tone(mode, '--c-cream-50');
  const litPage = blend(tone(mode, '--c-glow'), page, GLOW.primary[mode]);

  const paneOnPage = blend(tone(mode, '--c-glass-panel'), page, GLASS.panel[mode]);
  const paneOnLit = blend(tone(mode, '--c-glass-panel'), litPage, GLASS.panel[mode]);
  const paneSheened = blend(tone(mode, '--c-glass-edge'), paneOnLit, GLASS.sheen.peak[mode]);

  it('carries a trace of the theme own second accent rather than a colour of its own', () => {
    // A pane the colour of a card is a card. A pane with its own hue is a fifth
    // surface colour nobody chose. It is the glass colour with the counter-light
    // mixed into it at GLASS.tint, and that is the whole of the difference.
    expect(tone(mode, '--c-glass-panel')).not.toBe(tone(mode, '--c-glass'));
    const shift = contrastRatio(tone(mode, '--c-glass-panel'), tone(mode, '--c-glass'));
    expect(shift, `the pane tint moved the glass colour by ${shift.toFixed(3)}:1`).toBeLessThan(1.2);
  });

  /**
   * ── THE FILL IS NO LONGER WHAT SEPARATES A PANE (Aug 2026) ───────────────
   *
   * The alpha came down from 0.68/0.62 to 0.46/0.42 so more of the ambient
   * light reaches through, and the flat body consequently sits much closer to
   * the page — 1.03:1 in light, where the floor used to be 1.05.
   *
   * That is not the fill failing, it is the fill being asked to do less. What a
   * reader sees is the pane WITH its specular streak and its lit edge on it,
   * and those are what the separation is measured on now. It is a truer
   * measurement either way: the streak is drawn over the wash and under the
   * content on every pane in the product, so a check that ignored it was
   * measuring a surface nobody is looking at.
   */
  it('is a surface rather than a tint of the page', () => {
    const streaked = blend(tone(mode, '--c-glass-edge'), paneOnPage, GLASS.sheen.peak[mode]);
    const flat = contrastRatio(paneOnPage, page);
    const lit = contrastRatio(streaked, page);
    expect(
      lit,
      `the pane is ${lit.toFixed(3)}:1 off the page with its streak (${flat.toFixed(3)}:1 without)`,
    ).toBeGreaterThan(1.05);
    // And the fill is still pulling in the right direction rather than being
    // decorative — a pane identical to the page is one somebody set to zero.
    expect(flat, `the pane's own fill is ${flat.toFixed(3)}:1 off the page`).toBeGreaterThan(1.01);
  });

  it('stays below a card, because a container must not out-read its contents', () => {
    expect(Math.abs(luminance(paneOnPage) - luminance(page))).toBeLessThan(
      Math.abs(luminance(card) - luminance(page)),
    );
  });

  /**
   * ── AND THE ORDER OF THE THREE ALPHAS INVERTED (Aug 2026) ────────────────
   *
   * A pane used to be the most OPAQUE of the three translucent surfaces, on the
   * reasoning that it has cards and headings behind it — more structure than the
   * sidebar has to diffuse, less than the pinned control bar does.
   *
   * It is the most TRANSPARENT of the three now, and the reasoning is the same
   * one read the other way round. What each surface has behind it decides how
   * much it must OBSCURE, and the answers are not ordered by how much structure
   * is back there — they are ordered by how much of it would be a problem:
   *
   *   control bar  0.62 / 0.58  the reader's own results scroll under it, and
   *                             body copy legible through a pinned bar is the
   *                             one thing this material exists to prevent.
   *   sidebar      0.75 / 0.68  navigation, which must not be read through the
   *                             page it navigates.
   *   a pane       0.46 / 0.42  nothing moves under it, and it covers more of
   *                             the viewport than either — so it is the surface
   *                             with the most ambient light to transmit and the
   *                             least reason to stop any of it.
   *
   * The ordering is still asserted, so a change to one that crossed another
   * fails here rather than being noticed on a screenshot; what changed is which
   * way round it goes and, more usefully, why.
   */
  it('transmits more than the sidebar or the control bar, which is what its alpha is for', () => {
    expect(GLASS.panel[mode]).toBeLessThan(GLASS.wash[mode]);
    expect(GLASS.wash[mode]).toBeLessThan(PANEL_WASH_ALPHA[mode]);
  });

  it('keeps every label on it at AA, streak and all', () => {
    const body = contrastRatio(tone(mode, '--c-espresso'), paneSheened);
    expect(body, `body copy on the lit, streaked pane in ${mode} is ${body.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      WCAG_AA_TEXT,
    );
    // The floor of the opacity ladder — /80 — is the tightest label on it.
    const quiet = contrastRatio(blend(tone(mode, '--c-espresso'), paneSheened, 0.8), paneSheened);
    expect(quiet, `an /80 label on the pane in ${mode} is ${quiet.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  /**
   * ── THE STREAK IS BOUNDED IN LUMINANCE, PER THEME, AND NOT IN CONTRAST ─────
   *
   * The same two bounds `.panel-wash`'s sheen answers to, for the same reason
   * they had to be split there. They are two different physical claims because
   * a highlight on a dark ground and a highlight on a light one are two
   * different phenomena:
   *
   *  · DARK — A REFLECTION IS NEVER BRIGHTER THAN THE LIGHT IT REFLECTS. The key
   *    lifts this pane by a measurable amount where it lands on it, and the
   *    streak may add at most that much. Physical, self-adjusting, and it holds
   *    the streak to the one thing on the page it is a reflection OF. (The pane
   *    over the glow is ALREADY brighter than a card — that is the light doing
   *    its job, and the ladder has always been about the pane's UNLIT body,
   *    which `stays below a card` measures.)
   *  · LIGHT — the sources are a tenth of dark's, so the same bound would hold
   *    the streak to almost nothing. There the bound is the ladder itself: even
   *    at its peak over a lit page, the pane stays below a card.
   */
  it('lights the pane without the streak becoming a surface of its own', () => {
    const flatUnlit = luminance(paneOnPage);
    const flatLit = luminance(paneOnLit);
    const peak = luminance(paneSheened);
    // It does something at all — a streak measuring identical to the flat wash
    // is a custom property somebody set to zero, which is the failure the whole
    // material exists to fix and would otherwise pass silently.
    expect(
      Math.abs(peak - flatLit),
      `the streak moves the pane by ${(peak - flatLit).toFixed(5)}, which is nothing`,
    ).toBeGreaterThan(0.0005);

    if (mode === 'dark') {
      expect(
        peak - flatLit,
        `the streak adds ${(peak - flatLit).toFixed(4)} where the key light itself adds only ${(flatLit - flatUnlit).toFixed(4)}`,
      ).toBeLessThanOrEqual(flatLit - flatUnlit);
    } else {
      expect(peak, `the streaked pane is at ${peak.toFixed(4)} against a card's ${luminance(card).toFixed(4)}`).toBeLessThan(
        luminance(card),
      );
    }
  });

  /**
   * ⚠ THE ONE PLACE IT MAY NOT GO. The trend chart's five line colours and both
   * gauges' five band fills are solved at a fixed ratio against `--c-cream-50`.
   * A pane is not that colour, so a marker result card — or the marker page's own
   * two cards — becoming a pane would move the ground a CLINICAL palette was
   * measured on, silently. Asserted as an inequality rather than trusted to the
   * comment above it.
   */
  /**
   * ⚠ THE ONE PLACE A PANE MAY NOT GO, PINNED AS A NUMBER RATHER THAN A RULE.
   *
   * Glass is the DEFAULT surface now (see Card.tsx), so "a chart never sits on a
   * pane" is an exception somebody has to keep, and an exception kept by comment
   * is one that gets deleted by whoever tidies next. This is the measurement it
   * rests on.
   *
   * The trend line's five status colours are solved at `LINE_FILL_TARGET` —
   * 4.5:1 — against `--c-cream-50`, the card. Measured on a pane, in light, at
   * the pane's own alpha: 4.53–4.82:1 on a card becomes 3.73:1, and 3.44:1 on a
   * pane sitting under the key light. That is the CLINICAL palette failing its
   * own solve because a decorative surface moved out from under it.
   *
   * ── AND THIS TEST RETIRES ITSELF ─────────────────────────────────────────
   * It asserts the exception is still NEEDED. If the line palette is ever
   * re-solved so that every hue clears the target on a lit pane, this fails —
   * and the right response is to delete the `surface="card"` on the two chart
   * cards and then delete this, with evidence rather than by taste.
   */
  it('is not a surface the trend line was ever solved against', () => {
    expect(paneOnPage).not.toBe(card);
    if (mode !== 'light') return;
    const worst = (['green', 'olive', 'yellow', 'orange', 'red'] as const)
      .map((hue) => contrastRatio(tone(mode, `--c-hue-${hue}-mark`), paneOnLit))
      .reduce((a, b) => Math.min(a, b));
    const onCard = (['green', 'olive', 'yellow', 'orange', 'red'] as const)
      .map((hue) => contrastRatio(tone(mode, `--c-hue-${hue}-mark`), card))
      .reduce((a, b) => Math.min(a, b));
    expect(onCard, `the line does not clear its own target on a card: ${onCard.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      worst,
      `the trend line now clears ${worst.toFixed(2)}:1 on a lit pane — the chart cards no longer need surface="card"`,
    ).toBeLessThan(4.5);
  });
});
