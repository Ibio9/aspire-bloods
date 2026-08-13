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
  MOMENT_BACKDROP,
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
 * THE TWO SURFACES ONE FILL IS DRAWN ON: the plot panel inside a trend chart,
 * and the card a range bar sits on. The ladder is the GEOMETRIC MEAN of the
 * two, because they are not the same distance apart in the two themes and
 * matching one of them lets the other drift by a third. See BAND_FILL.
 */
function bandSurfaces(mode: (typeof MODES)[number]): [string, string] {
  return [tone(mode, '--c-cream-50'), tone(mode, '--c-chart-plot-surface')];
}

function bandRung(mode: (typeof MODES)[number], hue: string): number {
  const fill = tone(mode, `--c-hue-${hue}-fill`);
  const [card, plot] = bandSurfaces(mode);
  return Math.sqrt(contrastRatio(fill, card) * contrastRatio(fill, plot));
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
    for (const hue of BAND_STATES) {
      const got = bandRung(mode, hue);
      const rung = BAND_RUNG[mode][hue];
      expect(got, `the ${hue} band is at ${got.toFixed(3)}:1, ${mode} rung says ${rung.toFixed(3)}`).toBeCloseTo(rung, 1);
    }
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
      (hue) => BAND_RUNG[mode][hue] !== BAND_CONTRAST[hue === 'green' ? 'IN_RANGE' : hue === 'yellow' ? 'HIGH' : 'SIGNIFICANT_HIGH'],
    );
    expect(off, `${mode} departs from the ladder on ${off.join(', ') || 'nothing'}`).toEqual([]);
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
    for (const [hinge, below, above] of BAND_HINGES) {
      const channels = (name: string) =>
        [1, 3, 5].map((i) => parseInt(tone(mode, `--c-hue-${name}-fill`).slice(i, i + 2), 16));
      const [lo, mid, hi] = [below, hinge, above].map(channels);
      for (const [i, c] of mid.entries()) {
        // Within one level: the mix rounds to a whole channel.
        expect(Math.abs(c - (lo[i] + hi[i]) / 2), `the ${hinge} hinge's channel ${i}`).toBeLessThanOrEqual(1);
      }
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

  it('draws a band at the same weight in both themes, on both surfaces', () => {
    // It very nearly wasn't: at the light-mode weights, dark's gold once
    // measured 1.44:1 off the card against light's 1.16:1, because a near-black
    // surface amplifies a luminance difference that a cream one damps. That is
    // the difference between a band and a slab, and it is invisible in a token
    // file.
    //
    // BOTH SURFACES, since Aug 2026. One fill is drawn on the chart's plot
    // panel and on a range bar's card, so holding only one of them is how the
    // range bar quietly drifts while the chart is being looked at.
    //
    // The bound is generous (20%) because the two themes are not obliged to
    // match to three decimal places — it is there to catch a theme drifting a
    // third of the way clear of the other, which is what it did.
    //
    // THE THREE SOLVED STATES, not the two hinges: a hinge is an RGB midpoint,
    // its luminance is therefore not the mean of its neighbours', and holding
    // it to a bound it cannot control would only ever be a bound on its
    // neighbours applied twice. Its own claim is checked above.
    //
    // ALL THREE AGAIN (Aug 2026). The out-of-range band used to be exempt here:
    // 2.04:1 in light and 4.19:1 in dark, a deliberate 2× divergence, because
    // dark's yellow had left the ladder to be a yellow at all. With the LINE
    // carrying the status that band came back, both themes are on one ladder,
    // and there is nothing left to exempt.
    for (const hue of BAND_STATES) {
      for (const surface of ['--c-cream-50', '--c-chart-plot-surface'] as const) {
        const measured = MODES.map((m) => contrastRatio(tone(m, `--c-hue-${hue}-fill`), tone(m, surface)));
        const [light, dark] = measured;
        /**
         * VISIBLE AT ALL — a band nobody can see is a band that is not there.
         *
         * MEASURED AS PERCEPTUAL DISTANCE, NOT AS CONTRAST (Aug 2026). This was
         * a 1.15:1 contrast floor, and when the bands dropped to context weight
         * light's in-range band landed at 1.14 and failed it while being plainly,
         * obviously green. Contrast ratio is a LUMINANCE measure; what makes a
         * large flat region of colour visible against another is mostly its HUE.
         * It is the same argument this file already makes one instrument up,
         * where chroma is measured in OKLab rather than read off HSL saturation.
         *
         * The floor is an OKLab ΔE of 0.05 — roughly where a large field stops
         * being a region and starts being a suspicion. A band that genuinely
         * went grey fails it; a band that is quiet and coloured does not.
         */
        for (const m of MODES) {
          const d = deltaOk(tone(m, `--c-hue-${hue}-fill`), tone(m, surface));
          expect(d, `the ${hue} band in ${m} is ΔE ${d.toFixed(3)} off ${surface}`).toBeGreaterThan(0.05);
        }
        expect(
          Math.max(light, dark) / Math.min(light, dark),
          `on ${surface} the ${hue} band is ${light.toFixed(3)}:1 in light and ${dark.toFixed(3)}:1 in dark`,
        ).toBeLessThan(1.2);
      }
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
      const allowed = Math.min(
        maxChromaAtLightness(hue as 'green' | 'yellow' | 'red', lightnessOf(tone(mode, `--c-hue-${hue}-fill`))),
        ceiling * BAND_CHROMA_SHARE,
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

  it('leaves every band less colourful than the line drawn in the same hue', () => {
    // ── THE ORDERING, IN THE DIMENSION NOBODY WAS WATCHING (Aug 2026) ──────
    //
    // "The line is content, the bands are context" was asserted only as
    // CONTRAST. Solved on contrast alone the bands stayed at full palette
    // chroma and out-coloured the line, which is the ordering inverted however
    // good the contrast numbers look. Both dimensions are held now, and this is
    // the second: for every hue, the band is strictly less chromatic than the
    // colour the trend line is drawn in as it crosses that band.
    //
    // Per hue rather than globally, because the five cannot hold equal chroma
    // at the lightnesses the ladder puts them at — comparing a green band with
    // a red line would be measuring the gamut rather than the design.
    for (const hue of BAND_HUES) {
      const band = okChroma(tone(mode, `--c-hue-${hue}-fill`));
      const line = okChroma(tone(mode, `--c-hue-${hue}-mark`));
      expect(
        band,
        `the ${hue} band is ${band.toFixed(4)} chromatic against a line of ${line.toFixed(4)}`,
      ).toBeLessThan(line);
    }
  });

  it('keeps in range the faintest band of the five, in both themes', () => {
    // THE RUNG THAT IS ACTUALLY LOAD-BEARING. The bands are CONTEXT and the line
    // is content, and the in-range band is the one covering most of a plot — so
    // whatever else moves, the ordinary case has to carry the least colour.
    // Painted at one flat weight, which is what this chart once did, five
    // regions of colour ARE the picture and the reader's own result is a detail
    // on top of them.
    const rungs = BAND_HUES.map((hue) => ({ hue, ratio: bandRung(mode, hue) }));
    for (const other of rungs.filter((r) => r.hue !== 'green')) {
      expect(
        rungs[0].ratio,
        `in range ${rungs[0].ratio.toFixed(3)} is not below ${other.hue} ${other.ratio.toFixed(3)}`,
      ).toBeLessThan(other.ratio);
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
    const rungs = BAND_HUES.map((hue) => bandRung(mode, hue));
    const rising = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] < x);
    expect(rising(rungs), `${mode} rungs ${rungs.map((r) => r.toFixed(2)).join(' ')}`).toBe(true);
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
    // the colour that means "outside the range".
    expect(bandRung(mode, 'green')).toBeLessThan(
      Math.sqrt(contrastRatio(optimal, tone(mode, '--c-cream-50')) * contrastRatio(optimal, tone(mode, '--c-chart-plot-surface'))),
    );
    expect(
      Math.sqrt(contrastRatio(optimal, tone(mode, '--c-cream-50')) * contrastRatio(optimal, tone(mode, '--c-chart-plot-surface'))),
    ).toBeLessThan(BAND_CONTRAST.HIGH);
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

  it('keeps the trend line the most prominent thing on the plot', () => {
    // The instruction the bands were made opaque under, made checkable: if
    // stronger bands bury the line, brighten the LINE — never dull the bands
    // back down. So the line has to clear every band it crosses, including the
    // heaviest and including the optimal narrowing, and it has to beat the
    // boundary hairline while doing it.
    //
    // This is what caught the line at its old value: `bronze-700` measured
    // 2.87:1 on the opaque significantly-out band and `bronze-500` in dark
    // 2.42:1, both under AA-large. See LINE_LIFT.
    const line = tone(mode, '--c-chart-line');
    const edge = tone(mode, '--c-chart-reference-edge');
    for (const band of [...BAND_HUES.map((hue) => tone(mode, `--c-hue-${hue}-fill`)), tone(mode, '--c-band-optimal')]) {
      const lineRatio = contrastRatio(line, band);
      expect(lineRatio, `the trend line on ${band} is ${lineRatio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        WCAG_AA_LARGE_TEXT,
      );
      const edgeRatio = contrastRatio(blend(edge, band, chart.referenceEdgeOpacity), band);
      expect(lineRatio, `the boundary on ${band} out-reads the line`).toBeGreaterThan(edgeRatio);
    }
  });

  it('keeps every status colour readable against EVERY band, not just its own', () => {
    // ── THIS GOT STRICTER IN Aug 2026, AND THE REASON IS THE LINE ──────────
    //
    // It used to check a mark against the band of its OWN hue: a green point
    // lands on the green band, so those two must not meet. That was the whole
    // constraint for as long as these colours were only ever used on point
    // marks, because a point sits where its own status put it.
    //
    // The TREND LINE is drawn in them now, gradiented along its length — so a
    // GOLD segment crosses the GREEN band on its way up to an out-of-range
    // result, and a green segment crosses the gold coming back down. Every one
    // of the five has to clear every one of the five, plus the optimal
    // narrowing, or the line disappears for part of its length.
    //
    // Measured against the OLD heavy bands the worst pair was the dark gold
    // mark on the dark green band at **1.10:1**. That measurement is what
    // forced the bands down to context weight rather than the other way round —
    // see BAND_FILL and MARK_SHIFT in tokens.ts.
    const grounds = [
      ...BAND_HUES.map((hue) => tone(mode, `--c-hue-${hue}-fill`)),
      tone(mode, '--c-band-optimal'),
    ];
    for (const hue of BAND_HUES) {
      for (const band of grounds) {
        const ratio = contrastRatio(tone(mode, `--c-hue-${hue}-mark`), band);
        expect(ratio, `${hue} mark on ${band} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
      }
    }
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

  // THE GLOW IS DARK-ONLY. The token is emitted in both themes so nothing has
  // to branch, but the rule that paints it is `.dark body::before` — so in
  // light there is no near corner and no far corner, there is only the page,
  // and measuring a light-mode panel against a glow that is never drawn would
  // be measuring a fiction. The backdrop in light is the page, twice.
  const glowCore = mode === 'dark' ? blend(tone(mode, '--c-glow'), page, 0.4) : page;

  const panelOnPage = blend(wash, page, alpha);
  const panelOnGlow = blend(wash, glowCore, alpha);
  // The specular band at its peak, over the brightest backdrop the panel has.
  // In light that is the page (no glow is drawn); in dark it is the glow core,
  // which is already the pessimistic case since the source is anchored at the
  // opposite corner of the viewport from this column.
  const sheen = tone(mode, '--c-sheen');
  const panelSheened = blend(sheen, panelOnGlow, PANEL_SHEEN.peak[mode]);

  it('is the same material as every other translucent surface', () => {
    // The colour, not just the blur. The sidebar carried espresso at 6% / 38%
    // while the control bar carried the card tone at 62% / 58% — one material
    // in name and two on screen, which is what made the column read as a
    // slightly-tinted piece of page.
    expect(wash).toBe(tone(mode, '--c-glass'));
  });

  it('separates from the page without becoming a card', () => {
    const fromPage = contrastRatio(panelOnPage, page);
    const cardFromPage = contrastRatio(card, page);
    expect(fromPage, `panel against the page is ${fromPage.toFixed(2)}:1`).toBeGreaterThanOrEqual(1.08);
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
 * ═══ THE RESULTS-READY MOMENT'S GROUND ═══════════════════════════════════
 *
 * Behind the arch is the reader's own Overview, blurred past reading and then
 * veiled — the page colour at `MOMENT_BACKDROP.wash`, and the shadow tone at
 * `MOMENT_BACKDROP.shade` over that. Three things follow from putting a whole
 * screen of content under a translucent surface, and all three are measurable
 * here rather than reviewable in a screenshot:
 *
 *  1. The veil is a CONTRAST BUDGET. Whatever separation the Overview had from
 *     its own page survives at exactly `(1 - wash) × (1 - shade)` of itself,
 *     because two alpha composites multiply — so the ground's remaining
 *     structure is a number that was chosen rather than one that happened.
 *  2. The arch has to dominate it. The failure this is against is a moment
 *     whose doorway is one of several equally-weighted things on the screen.
 *  3. AND THE ARCH IS GLASS. Its text is not on a surface any more; it is on
 *     `--c-glass` at its own alpha over the VEILED GROUND, which is a surface
 *     that did not exist before this screen had a background. That is the one
 *     way this change could actually harm somebody, so it is held at AA for
 *     body text and not at the large-text floor — "Not just now" is 14px.
 *
 * Measured against the CARD tone rather than the page: a card is the most
 * separated thing the Overview paints, so it is the worst case for how much
 * structure comes through, and the page itself is the ground everything else
 * on that screen is measured against.
 */
describe.each(MODES)('%s results-ready backdrop', (mode) => {
  const page = tone(mode, '--c-cream');
  const card = tone(mode, '--c-cream-50');
  const shadow = tone(mode, '--c-shadow');
  const { wash, shade } = { wash: MOMENT_BACKDROP.wash[mode], shade: MOMENT_BACKDROP.shade[mode] };

  /** What a colour on the blurred plate looks like once the veil is over it. */
  const veiled = (hex: string) => blend(shadow, blend(page, hex, wash), shade);

  const ground = veiled(page);
  const cardThroughVeil = veiled(card);
  // The arch: the glass material at its own alpha, over the veiled ground.
  const arch = blend(tone(mode, '--c-glass'), ground, GLASS.wash[mode]);

  it('leaves exactly the share of the Overview the two alphas allow through', () => {
    const survives = (1 - wash) * (1 - shade);
    const before = [1, 3, 5].map((i) => parseInt(card.slice(i, i + 2), 16) - parseInt(page.slice(i, i + 2), 16));
    const after = [1, 3, 5].map(
      (i) => parseInt(cardThroughVeil.slice(i, i + 2), 16) - parseInt(ground.slice(i, i + 2), 16),
    );
    after.forEach((d, i) => {
      // ±1 for the rounding two composites do. The claim is that the veil is a
      // multiplier and that the multiplier is the two numbers in tokens.ts.
      expect(Math.abs(d - before[i] * survives), `channel ${i}: ${d} against ${before[i]} × ${survives}`).toBeLessThanOrEqual(1);
    });
  });

  it('puts the arch well clear of anything left showing behind it', () => {
    const residual = contrastRatio(cardThroughVeil, ground);
    const dominance = contrastRatio(arch, ground);
    expect(
      dominance - 1,
      `the arch stands ${(dominance - 1).toFixed(3)} off the ground and the loudest thing behind it ${(residual - 1).toFixed(3)}`,
    ).toBeGreaterThan((residual - 1) * 2.5);
  });

  it('keeps the arch a surface rather than a hole in the page', () => {
    // It is glass over a ground that is itself mostly page colour, so the two
    // could converge into nothing. Same floor the sidebar panel is held to.
    const separation = contrastRatio(arch, ground);
    expect(separation, `the arch is ${separation.toFixed(3)}:1 off its own ground`).toBeGreaterThanOrEqual(1.08);
  });

  it('keeps every word on the arch at AA over the veiled ground', () => {
    for (const [label, text] of [
      ['the heading', tone(mode, '--c-espresso')],
      // The two quiet ones, at the bottom of the opacity ladder this product
      // allows: the panel line and "Not just now", both /80.
      ['the muted lines', blend(tone(mode, '--c-espresso'), arch, 0.8)],
    ] as const) {
      const ratio = contrastRatio(text, arch);
      expect(ratio, `${label} is ${ratio.toFixed(2)}:1 on the arch`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });
});
