/**
 * Aspire Bloods design tokens — single source of truth for color, type, and
 * status semantics. Tailwind config and every component consume this file;
 * no raw hex belongs anywhere else in the codebase.
 */

// ---------------------------------------------------------------------------
// Brand palette (exact, from Aspire Clinic brand guidelines — do not alter)
// ---------------------------------------------------------------------------

export const brand = {
  bronze: '#8a5e45',
  espresso: '#423c36',
  cream: '#e3dfd3',
  taupe: '#c9bca9',
  white: '#ffffff',
} as const;

// ---------------------------------------------------------------------------
// Color math — tints/shades are derived programmatically from the four brand
// hues only. Tints mix toward white; shades mix toward espresso (the brand's
// own darkest tone) since pure black is not permitted anywhere in the system.
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const n = hex.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mix(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r: RGB = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  return rgbToHex(r);
}

/**
 * THE SAME HUE AT A DIFFERENT LIGHTNESS AND SATURATION — the one operation
 * `mix` cannot do.
 *
 * Every other colour in this file is a mix between two hexes, and a mix can
 * only ever move a colour along the straight line joining them. That is the
 * right tool for a wash (the surface plus a little of the hue) and the wrong
 * one for "the same gold, brighter" — mixing gold toward white raises its
 * lightness and DROPS its saturation, and a gold with the saturation taken out
 * of it is beige. Mixing it toward black keeps the saturation and drops the
 * lightness, and a dark yellow is olive. Those two dead ends are the whole of
 * why the dark chart bands read as mud: there was no way to say "brighter AND
 * still gold" with the tools this file had.
 *
 * So: convert to HSL, keep the hue angle, set the other two outright.
 */
function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6 : max === gn ? ((bn - rn) / d + 2) / 6 : ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

/** `hex`'s own hue angle, at the saturation and lightness given. */
function reHsl(hex: string, saturation: number, lightness: number): string {
  const [h] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, saturation, lightness]));
}

/**
 * `hex`'s own HUE ANGLE, at a saturation and a lightness that are both solved.
 *
 * The operation an OPAQUE band fill needs. It used to take the hue's own
 * saturation capped at one shared number, and that cap is what this replaced —
 * see `BAND_FILL` for the measurement and `bandChroma` for what a saturation is
 * solved against now. Only the hue angle survives untouched, which is what
 * keeps a band the brand colour rather than a new one.
 */
function reLightness(hex: string, lightness: number, saturation: number): string {
  const [h] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, saturation, lightness]));
}

/** A hex's own saturation — for the call sites that deliberately keep it. */
function ownSaturation(hex: string): number {
  return rgbToHsl(hexToRgb(hex))[1];
}

/**
 * HOW COLOURFUL SOMETHING LOOKS — the OKLab chroma, i.e. the distance from the
 * neutral axis in a space built so that equal distances look equally colourful.
 *
 * It exists because the two obvious measures both lie, and both lies are
 * recorded in this file's history:
 *
 *  · HSL SATURATION is a ratio. It calls a pale pink and a fire-engine red the
 *    same figure, and it was the thing being capped when the bands read as
 *    "green mutters, red shouts".
 *  · THE RGB SPAN (max − min channel) is what tokenContrast.test.ts measures as
 *    a FLOOR, and it is right for a floor and wrong for a target. Solved for an
 *    equal RGB span the three bands came out `#98db65`, `#cfb158`, `#eb8677` —
 *    a highlighter green beside a dull gold — because a green at 63% lightness
 *    can hold an enormous RGB span while looking ordinary and a red cannot.
 *
 * Not exported: it is used to solve `BAND_FILL` at authoring time and the
 * solved numbers are what ship. Kept here rather than in a script because the
 * numbers below are meaningless without it.
 */
function okChroma(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return Math.hypot(
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  );
}

/**
 * THE CEILING ON A BAND FILL'S COLOURFULNESS, PER HUE — and it is not a number
 * anybody typed in.
 *
 * A band fill may be as colourful as the BRAND HUE it is derived from, and no
 * more. That is what "still in the palette" means, stated as something
 * measurable: `statusHue.green` is the greenest green this product has, so a
 * green band as chromatic as it is cannot be out of the palette, and one more
 * chromatic than it has left. Per hue by construction, because the three brand
 * hues are not equally colourful — 0.1235, 0.1405 and 0.1590 in OKLab chroma —
 * and forcing them to one figure is the single-cap mistake wearing a different
 * hat.
 */
export function bandChromaCeiling(hue: 'green' | 'yellow' | 'red'): number {
  return okChroma(statusHue[hue]);
}

/** Tailwind-style 50-900 scale: light tints (toward white) through the base
 * hue (500) to dark shades (toward espresso, never toward pure black). */
function buildScale(baseHex: string): Record<number, string> {
  const steps: Record<number, number> = {
    50: -0.9, 100: -0.75, 200: -0.55, 300: -0.35, 400: -0.15,
    500: 0, 600: 0.2, 700: 0.4, 800: 0.6, 900: 0.8,
  };
  const scale: Record<number, string> = {};
  for (const [step, t] of Object.entries(steps)) {
    if (t === 0) scale[Number(step)] = baseHex;
    else if (t < 0) scale[Number(step)] = mix(baseHex, brand.white, -t);
    else scale[Number(step)] = mix(baseHex, brand.espresso, t);
  }
  return scale;
}

export const scales = {
  bronze: buildScale(brand.bronze),
  espresso: buildScale(brand.espresso),
  cream: buildScale(brand.cream),
  taupe: buildScale(brand.taupe),
} as const;

/**
 * A deeper-than-espresso tone for large dark surfaces (e.g. a split-panel
 * login background) — mixed a controlled 32% toward true black, same
 * derivation method as the tint/shade scales above. Deliberately NOT
 * '#000000': the brand rules forbid pure black anywhere, so this stays a
 * warm, dark espresso rather than a neutral black. Large dark surfaces
 * only — never body text (espresso itself already covers that).
 */
export const ink = mix(brand.espresso, '#000000', 0.32);

/**
 * A handful of ink shades for dark-surface chrome (headers, hero panels,
 * dark nav) that needs more than one dark tone to read as layered rather
 * than flat — a border or hover state on a dark panel can't borrow the
 * light-surface `taupe`/`cream-200` tokens, they'd disappear or clash.
 * `border` sits between `ink` and `cream` for hairline dividers on dark
 * surfaces; `hover` and `deep` mix further toward black for interactive
 * states and the darkest gradient stop, same "never pure black" rule as
 * `ink` itself.
 */
export const inkScale = {
  DEFAULT: ink,
  border: mix(ink, brand.cream, 0.22),
  hover: mix(ink, '#000000', 0.18),
  deep: mix(ink, '#000000', 0.4),
} as const;

// ---------------------------------------------------------------------------
// The traffic-light hues.
//
// Three hues carry the five states, plus TWO HINGES that are never states:
//
//   significantLow / significantHigh → RED
//   low            / high            → YELLOW
//   inRange                          → GREEN
//   OLIVE is the transition between green and yellow, drawn at a REFERENCE
//          BOUND. ORANGE is the transition between yellow and red, drawn at a
//          SIGNIFICANTLY-OUT THRESHOLD. Neither is ever a status of its own.
//
// THERE ARE TWO HINGES BECAUSE THERE ARE TWO BOUNDARIES (Aug 2026). Orange was
// on its own for as long as the ramp ran ACROSS a band — yellow at the
// reference bound shading out to orange at the threshold — which put the
// colour change in the middle of a region and a hard edge at the boundary. The
// gradient sits AT each boundary now, centred on it, so a value one unit inside
// the range and one unit outside it are drawn a hair apart rather than in two
// different colours. That needs a colour for the midpoint of green→yellow in
// exactly the way the threshold already had one for yellow→red.
//
// They cannot be derived from a palette with no green/yellow/red in it, so
// they are picked — but picked against two constraints at once, which is what
// keeps them from turning a blood result into a dashboard:
//
//  1. Warm-leaning and low-saturation enough to sit on cream and on the warm
//     near-black browns. Every one of them is pulled off its pure hue toward
//     the bronze/espresso axis; none is a web red, a lemon or a signal green.
//  2. Saturated ENOUGH that a soft wash of it is still unmistakably the colour
//     it is meant to be. The previous tint bases failed this second test: at a
//     12% wash the orange read as beige and the red as pink, which is the cost
//     of colour-coding with none of the benefit.
//
// Everything downstream — washes, bars, chart bands, boundary lines, point
// fills, and the status text colours themselves — is mixed from these four and
// from nothing else, per theme.
// ---------------------------------------------------------------------------

export const statusHue = {
  /** Warm leaf-green. Unmistakably green, never a signal green. */
  green: '#5E8C3A',
  /**
   * The hinge at a REFERENCE BOUND — never a state.
   *
   * The exact RGB midpoint of green and yellow, written out rather than
   * computed so the palette stays a list of hexes somebody can read: (0x5E +
   * 0xC7)/2 = 0x93, (0x8C + 0x9A)/2 = 0x93, (0x3A + 0x16)/2 = 0x28. It has to
   * be the midpoint, because the whole claim the gradient makes is that a
   * result sitting exactly on the limit is drawn exactly half in each colour.
   */
  olive: '#939328',
  /** Warm gold. Yellow at this luminance, not lemon and not brown. */
  yellow: '#C79A16',
  /** The hinge at a SIGNIFICANTLY-OUT THRESHOLD — never a state. */
  orange: '#C4711F',
  /** Warm brick-red. Unmistakably red, never a web #f00 alert. */
  red: '#B23A28',
} as const;

export type StatusHue = keyof typeof statusHue;

/**
 * The status TEXT/ICON colour, per state.
 *
 * Derived from the hue above by mixing toward espresso until it clears AA for
 * body text on every surface it lands on — the page, a card, an input, and its
 * own wash. That is why the green is a deep leaf rather than the hue itself:
 * `statusHue.green` on cream measures about 3:1, which is fine for a band and
 * not fine for a word.
 *
 * `high` and `low` share a colour and `significantHigh`/`significantLow` share
 * a colour, exactly as before. Direction is carried by the icon and by the
 * word; the hue carries severity only.
 */
function statusTextHex(hue: StatusHue): string {
  // Yellow has by far the highest intrinsic luminance, so it needs the most
  // pulling down to reach 4.5:1 — the amount is per hue rather than one
  // constant, so each lands just past the threshold instead of all three
  // being dragged to the darkest one's level.
  // Olive is carried for completeness — it is a hinge, never a state, so no
  // status label is ever set in it — and it sits between its two neighbours.
  const toward: Record<StatusHue, number> = { green: 0.45, olive: 0.54, yellow: 0.63, orange: 0.49, red: 0.22 };
  return mix(statusHue[hue], brand.espresso, toward[hue]);
}

export const status = {
  inRange: {
    label: 'In range',
    hex: statusTextHex('green'),
    icon: 'dash', // level/dash mark
    hue: 'green' as StatusHue,
    /** Runtime color, theme-aware. Use this anywhere the value is applied to a live element. */
    cssVar: 'rgb(var(--c-status-in-range))',
  },
  high: {
    label: 'Above range',
    hex: statusTextHex('yellow'),
    icon: 'chevron-up',
    hue: 'yellow' as StatusHue,
    cssVar: 'rgb(var(--c-status-high))',
  },
  low: {
    label: 'Below range',
    hex: statusTextHex('yellow'), // same tone as `high`; direction is carried by icon, not colour
    icon: 'chevron-down',
    hue: 'yellow' as StatusHue,
    cssVar: 'rgb(var(--c-status-low))',
  },
  significantHigh: {
    label: 'Significantly above range',
    hex: statusTextHex('red'),
    icon: 'chevron-double-up',
    hue: 'red' as StatusHue,
    cssVar: 'rgb(var(--c-status-significant-high))',
  },
  significantLow: {
    label: 'Significantly below range',
    hex: statusTextHex('red'),
    icon: 'chevron-double-down',
    hue: 'red' as StatusHue,
    cssVar: 'rgb(var(--c-status-significant-low))',
  },
} as const;

export type StatusKey = keyof typeof status;

// ---------------------------------------------------------------------------
// Status TINTS — a deliberate, documented change to the design system.
//
// The system's original rule was "no green, amber or red anywhere". That rule
// was about not turning a person's blood results into a dashboard, and it is
// still the reason everything below is a *wash* rather than a fill. But
// patients arrive expecting traffic-light coding on a blood result, and
// withholding it made the page harder to scan without making it any calmer.
//
// So: five tints, from three hues, on every surface that shows a result — the
// card, the row, the range bar, the chart bands, the sparkline, the counts
// strip, the category bars, and the status word in a tooltip.
//
//   significantLow  → red      significantHigh → red
//   low             → yellow   high            → yellow
//   inRange         → green    (orange = the transition, never a state)
//
// Four rules hold, and the colour is worthless without them:
//
//  1. Colour is the LAST thing that carries status, never the first. The
//     level mark / chevron / doubled chevron and the word ("Above range")
//     are unchanged and still carry the whole meaning in greyscale and to a
//     colourblind reader. Red and green are the most commonly confused pair
//     there is; delete every colour here and nothing is lost. Chart bands
//     therefore carry a boundary line and a written key, never hue alone.
//  2. Surfaces and marks, not body copy. A tinted card keeps its taupe border,
//     its espresso text and its ordinary shadow. The one text that takes a
//     status colour is the status word itself, which is a label for that
//     colour rather than content sitting in it.
//  3. Low-saturation and warm-leaning, but not to the point of beige. See the
//     note on `statusHue`: the wash has to still read as the colour it is.
//  4. Nothing escalates beyond the colour. No pulse, no warning triangle, no
//     red body copy, no "danger"/"healthy" vocabulary anywhere. Someone
//     reading a bad number is not to be frightened by the interface; the
//     out-of-range prompt points calmly at their GP with contact details.
// ---------------------------------------------------------------------------

const STATUS_TINT_HUE: Record<StatusKey, StatusHue> = {
  significantLow: 'red',
  low: 'yellow',
  inRange: 'green',
  high: 'yellow',
  significantHigh: 'red',
};

/**
 * How much of the hue survives, per role. Each is a mix from the surface the
 * thing actually sits on toward the hue, so nothing needs an opacity at the
 * call site and the two themes cannot drift.
 *
 *  · `wash`  — the card/row/tile background. The faintest of them, because it
 *              sits under body text that has to stay comfortably readable; but
 *              raised from the old 12% because at 12% the yellow and red were
 *              indistinguishable from the cream card they replaced.
 *  · `band`  — a chart band. Sits behind a line and points, so it stays calm,
 *              but it is a field of colour with no body text on it and can
 *              carry more hue than the wash.
 *  · `track` — the range-bar track and the category summary bars. A field of
 *              colour with nothing on top at all; at wash strength it would
 *              simply disappear.
 *  · `edge`  — a boundary line, a band's own hairline, the ring on a plotted
 *              point. Nearly the hue itself.
 *  · `mark`  — the fill of a plotted point or a range-bar dot. The one role
 *              NOT mixed from the surface: it sits on a band of its own colour
 *              and would wash into it, so it is the hue itself taken a step
 *              past full strength — deepened in light, lifted in dark. Checked
 *              at 3:1 against its own band by tokenContrast.test.ts, because
 *              "the point disappeared into the band" is a chart that has lost
 *              the shape layer status actually depends on.
 */
const TINT_MIX = {
  wash: 0.21,
  // Eased from 0.28 when the dark page and card were lifted (see nightBase).
  // A wash is a mix from the surface toward the hue, so a lighter surface with
  // the same mix lands lighter — and the status LABEL then has to be dragged
  // most of the way to the text tone to keep AA against its own wash, which
  // costs it the chroma that makes it recognisably green or gold. Giving up
  // two points of wash buys back the label. It still measures ~1.5:1 against
  // the card it replaces, which is a wash you can see across a room.
  washDark: 0.2,
  band: 0.3,
  bandDark: 0.32,
  track: 0.58,
  trackDark: 0.6,
  edge: 0.92,
  edgeDark: 0.82,
} as const;

/**
 * The point fill, per hue, as a distance from the hue itself — toward espresso
 * in light and toward the theme's text tone in dark.
 *
 * Per hue rather than one constant for the same reason `statusTextHex` is:
 * yellow starts far brighter than the others, so a single value that made
 * yellow legible on its own band would drag green and red into mud.
 *
 * RE-SOLVED WITH THE OPAQUE BANDS (Aug 2026), and every value went up. A mark
 * stands on its own state's band and has to clear 3:1 against it; the bands
 * are painted now rather than composited at 15–40%, so each one is between a
 * third and a half again as far from the surface as it was, and the mark has to
 * step further off the hue to stay visible on it. Solved per hue for the
 * SMALLEST shift clearing 3.2:1 — every step past that is chroma spent for
 * nothing — and green is solved against the OPTIMAL fill as well as its own
 * band, since an in-range point can land inside the narrowing.
 *
 * The cost is real and is recorded rather than hidden: light's gold mark is
 * #6b592c and its amber #6f4f2e, which are dark warm browns rather than the
 * gold and amber they were. Status is still carried by the mark's SHAPE, by the
 * word in the tooltip and by the word in the key; the mark's own colour has
 * never been the thing that says it, and a mark that has vanished into its band
 * loses the shape layer, which is the thing that does.
 */
const MARK_SHIFT: Record<StatusHue, number> = { green: 0.44, olive: 0.53, yellow: 0.69, orange: 0.66, red: 0.46 };

/**
 * The same, in dark — and it is a SEPARATE RECORD now (Aug 2026), because the
 * bands got stronger and the mark has to keep standing off its own band.
 *
 * The two themes fail in opposite directions, which is why one record could not
 * serve both. A mark shifts toward the theme's TEXT tone: in light that is
 * espresso, so a bigger shift makes the mark darker and it gains contrast
 * against a pale band; in dark it is a warm cream, so a bigger shift makes the
 * mark lighter and it gains contrast against a dark one. Raising `BAND_WEIGHT`
 * therefore needs MORE shift in both themes — and by different amounts per hue,
 * since the four do not start at the same luminance in either.
 *
 * Red in dark is the one that actually bound. At the old 0.12 it measured
 * 2.7:1 against the new significantly-out band, which is a point mark
 * disappearing into the region it is standing on — the failure the shape layer
 * cannot afford, since shape is what carries status when colour is taken away.
 * Solved per hue for the SMALLEST shift that clears 3.2:1 on its own band at
 * that band's own weight, because every step past that is chroma spent for
 * nothing. tokenContrast.test.ts measures the result at 3:1.
 *
 * RE-SOLVED with the opaque bands (Aug 2026), and dark went the OTHER WAY from
 * light — three of the five need no shift at all now. A dark band is lighter
 * than the plot it sits on, and the lifted hue is already well clear of it;
 * what was binding before was a MUDDIER band closer to the mark's own tone.
 * Zero is a real answer here and not a missing one: the mark is the lifted hue
 * itself, which is the most chromatic it can be, and only orange and red — the
 * two heaviest bands — need to be pulled off it.
 */
const MARK_SHIFT_DARK: Record<StatusHue, number> = { green: 0.04, olive: 0, yellow: 0, orange: 0.22, red: 0.46 };

/**
 * How far each hue is lifted toward the theme's text tone before anything in
 * dark is derived from it.
 *
 * Small, and smaller than it used to be (it was a flat 0.34). A lift toward a
 * near-white desaturates, and on a near-black page the hue does not need much
 * of one to be visible — what it needs is to stay chromatic. Yellow gets the
 * least because it starts brightest; red gets the most because a brick red is
 * the darkest of the four and the one most at risk of disappearing.
 */
const DARK_HUE_LIFT: Record<StatusHue, number> = { green: 0.2, olive: 0.15, yellow: 0.1, orange: 0.14, red: 0.26 };

/**
 * The strength of a dark FILL — the fraction of the lifted hue that survives
 * against black — per role and then per hue.
 *
 * Per role: a band sits behind data and stays calm; a track has nothing on it
 * at all and can carry far more; an edge is nearly the hue itself.
 *
 * Per hue: the multiplier corrects for the fact that the four hues do not
 * start at the same luminance. Yellow at the same fraction as green is a
 * headlight; red at the same fraction as yellow is a smear. These are the
 * numbers at which the three read as green, gold and red side by side on
 * #110F0D, checked by tokenContrast.test.ts for separation and for the point
 * mark still standing off its own band.
 */
const DARK_FILL = { band: 0.46, track: 0.78, edge: 0.94 } as const;
const DARK_FILL_HUE: Record<StatusHue, number> = { green: 1, olive: 0.9, yellow: 0.82, orange: 0.9, red: 1.08 };

/**
 * ---------------------------------------------------------------------------
 * THE `fill` ROLE — A BAND IS PAINTED NOW, NOT COMPOSITED (Aug 2026).
 * ---------------------------------------------------------------------------
 *
 * This role was called `plot` and was "the hue as the browser should composite
 * it", drawn at 15% / 28% / 40% over whatever was underneath. That is what made
 * the bands read washed out, and no amount of re-solving the hue could fix it,
 * because the failure was structural rather than chromatic: **the chroma of a
 * composited band is very nearly `weight × chroma(hue)`**, so at 15% the
 * in-range band could carry at most 15% of any colour that exists. Three
 * separate re-solves of this record are recorded in the git history, each
 * chasing "the bands are muddy" round the same ceiling. The ceiling was the
 * alpha.
 *
 * A band is now a SOLID FILL. No alpha anywhere in the chain: the rect is
 * opaque, the gradient stops are opaque, and nothing behind a band shows
 * through it. The weight ladder did not go away — it moved from the alpha into
 * the colour, which is what `BAND_CONTRAST` (statusBands.ts) states and what
 * this record solves for.
 *
 * WHAT IS FREE NOW AND WHAT IS NOT. Chroma is free: an opaque fill can be as
 * saturated as it likes, which is why every band roughly doubled its colour
 * without moving a single rung of the ladder. Saturation is therefore the thing
 * that has to be held DOWN rather than pushed up — an unconstrained solve for
 * maximum chroma returns #66e900 and #ff7c68, a highlighter green and a neon
 * salmon, which are correct answers to the wrong question.
 *
 * ── THE CAP IS PER HUE NOW, AND IT IS SOLVED (Aug 2026) ────────────────────
 *
 * It was ONE saturation cap, `BAND_FILL_SAT_CAP = 0.6`, applied to all three:
 * green kept its own 41% (under the cap, so untouched), gold and red were both
 * pulled to 60%. The complaint that produced this rewrite was that red read as
 * red while green read as olive and gold as brown, and the cause is exactly
 * that one number.
 *
 * A SINGLE CAP CANNOT WORK, because HSL saturation is a RATIO and the three
 * hues sit at very different lightnesses — the ladder puts them there on
 * purpose. Measured, at the old numbers, in OKLab chroma (how colourful a thing
 * actually looks):
 *
 *     light   green 0.0915   gold 0.1242   red 0.1037     spread 36%
 *     dark    green 0.0696   gold 0.0727   red 0.1412     spread 103%
 *
 * So one cap flattered gold in light and red in dark and starved green in both.
 * "Green has less headroom at its lightness than red does" is a fact about the
 * sRGB gamut, and a cap that ignores it is a cap that hits one hue and misses
 * the others.
 *
 * WHAT IT IS SOLVED AGAINST. Each hue is given as much chroma as it can carry
 * at the lightness its own rung puts it at, bounded by `bandChromaCeiling` —
 * the colourfulness of the BRAND HUE it derives from. A green band as chromatic
 * as `statusHue.green` cannot be out of the palette, because that IS the
 * palette's green; one more chromatic than it has left. So the bound is per hue
 * by construction and is not a number anybody chose. Both the saturation and
 * the lightness are then solved together, since changing one moves the other's
 * contrast.
 *
 * MEASURED AFTER, same units:
 *
 *     light   green 0.1234   gold 0.1407   red 0.1341     spread 14%
 *     dark    green 0.0985   gold 0.0812   red 0.1593     spread 96%
 *
 * Every band gained: green +35% / +42%, gold +13% / +11%, red +29% / +13%. In
 * light the three are now within 14% of each other, which is what "comparable
 * intensity" looks like as a number.
 *
 * DARK'S GOLD IS THE ONE THAT IS STILL SHORT, and the reason is worth writing
 * down so nobody re-solves it hoping for a different answer. The rungs are
 * contrast ratios against a near-black surface, so a dark band's LUMINANCE is
 * fixed low by the ladder: gold's rung of 1.88 puts it at 21% lightness, and a
 * yellow at 21% lightness is a brown in any colour space, because that is what
 * a dark yellow is. Its 0.0812 is the most sRGB will hold there. Lifting the
 * whole ladder ~30% buys gold 0.0937 and costs the chart the thing the ladder
 * is for — the bands are context and the line is content — so it was measured
 * and not taken.
 *
 * ── WHICH SURFACE THE LADDER IS MEASURED AGAINST, AND WHY IT IS BOTH ────────
 *
 * One fill is drawn on two surfaces: the chart's plot panel and the card a
 * range bar sits on. Those two are not the same distance apart in the two
 * themes — light's plot is a step DOWN from its card and dark's plot is a step
 * down from its card as well, which pushes a light (darker) band closer to the
 * plot and a dark (lighter) band further from it. Measured: solving the ladder
 * against the card alone leaves the CHART's bands 33% apart between themes;
 * solving it against the plot alone leaves the RANGE BAR's 30% apart. Neither
 * instrument is the junior one.
 *
 * So the ladder is the GEOMETRIC MEAN of the two contrasts, which splits the
 * difference exactly: both instruments land within 16% across the two themes,
 * inside the 20% tolerance tokenContrast.test.ts has always held bands to.
 *
 * Measured, at these values — contrast off the card / off the plot panel:
 *
 *     light   green 1.62 / 1.39   gold 2.04 / 1.74   red 2.49 / 2.12
 *     dark    green 1.41 / 1.59   gold 1.78 / 2.01   red 2.16 / 2.44
 *
 * and CHROMA, as the composited band was → as the painted fill is:
 *
 *     light   green 0.114 → 0.243   gold 0.200 → 0.776   red 0.400 → 0.396
 *     dark    green 0.125 → 0.157   gold 0.224 → 0.333   red 0.337 → 0.490
 *
 * ── THE THREE THINGS THAT MOVE WITH IT ─────────────────────────────────────
 *
 * BAND_FILL, LINE_LIFT AND MARK_SHIFT ARE ONE DECISION, exactly as PLOT_LIFT,
 * BAND_WEIGHT and MARK_SHIFT were. A stronger band is closer to the trend line
 * and closer to the point mark standing on it, and both have to move away from
 * it — the line by getting brighter (never the band by getting duller: the line
 * is the content and the bands are the context, and that ordering is a fact
 * about the chart rather than about how much ink is on it), the mark by taking
 * a bigger step off its own hue. Change any rung of `BAND_CONTRAST` and all
 * three are solved again.
 *
 * ── THE TWO HINGES ARE NOT SOLVED, THEY ARE MIDPOINTS ──────────────────────
 *
 * Only the three STATES are solved. Olive and orange are the exact RGB midpoint
 * of the two fills either side of them, computed where they are drawn rather
 * than taken from `statusHue`, and that is the whole claim a boundary blend
 * makes: a result sitting exactly on the limit is drawn exactly half in each.
 * Solving a hinge independently broke it — `statusHue.olive` is 57% saturated
 * against green's 41%, so an independently-solved olive came out MORE chromatic
 * than either neighbour and drew a bright chartreuse stripe along the reference
 * bound, which is the opposite of a blend.
 */
interface BandFill {
  /** Solved per hue against `bandChromaCeiling`, never one shared cap. */
  saturation: number;
  /** Solved so the fill lands on its own rung of BAND_CONTRAST. */
  lightness: number;
}

const BAND_FILL: Record<'light' | 'dark', Record<'green' | 'yellow' | 'red' | 'optimal', BandFill>> = {
  // The hue angle is the brand hue's own and is never touched. Both other
  // coordinates are solved: the lightness by the ladder, the saturation by the
  // palette's own ceiling on that hue. See the note above for the measurement.
  light: {
    green: { saturation: 0.514, lightness: 0.673 }, // #a6d681, okC 0.1234
    yellow: { saturation: 0.676, lightness: 0.527 }, // #d8af35, okC 0.1407
    red: { saturation: 0.793, lightness: 0.695 }, // #ef8474, okC 0.1341
    // The optimal narrowing: the same green at the same saturation, a rung
    // deeper. 1.13:1 off the in-range band — a visible shading-in, and nothing
    // like the step a boundary makes.
    optimal: { saturation: 0.514, lightness: 0.6 }, // #93cd65
  },
  dark: {
    green: { saturation: 0.795, lightness: 0.156 }, // #244808, okC 0.0985
    yellow: { saturation: 0.789, lightness: 0.211 }, // #604a0b, okC 0.0812
    red: { saturation: 0.707, lightness: 0.382 }, // #a72f1d, okC 0.1593
    optimal: { saturation: 0.795, lightness: 0.174 }, // #285009
  },
};

/**
 * THE TREND LINE, AND IT IS BRIGHTER BECAUSE THE BANDS ARE (Aug 2026).
 *
 * It was `bronze-700` in light and `bronze-500` in dark, and on the opaque
 * significantly-out band those measure 2.87:1 and 2.42:1 — under AA-large,
 * i.e. a line buried by its own context. The rule when that happens is written
 * down and is one direction only: brighten the LINE.
 *
 * Solved rather than stepped along the scale, and for a reason worth stating.
 * The bronze scale's dark end is mixed toward espresso, so `bronze-900` clears
 * the band comfortably (3.73:1) at a chroma of 0.090 — a warm grey, a line that
 * has stopped being bronze on a plot where bronze is the one colour that means
 * "your series". Solved at bronze's OWN saturation and nothing higher (the
 * bronze hue sits at 19°, between the status red at 8° and the status orange at
 * 30°, so a saturated bronze line would read as a status colour crossing the
 * plot) it lands at 3.36:1 in light and 3.33:1 in dark, at a chroma of 0.20 —
 * darker AND more bronze than the step it replaces.
 */
const LINE_LIFT: Record<'light' | 'dark', number> = {
  light: 0.296, // #654532
  dark: 0.709, // #ceae9c
};

// ---------------------------------------------------------------------------
// Dark mode.
//
// Every token below has a dark counterpart, derived rather than hand-picked so
// the two themes cannot drift. Dark surfaces are the warm near-black browns
// the palette already contains (espresso mixed toward black), never a pure
// black and never a cool grey — a neutral-grey dark mode under this palette
// looks like a different product with the logo swapped in.
//
// The scales invert by ROLE, not by number:
//  - `cream` is the surface family. In both themes a lower step number means
//    a more raised surface: light gets brighter, dark gets brighter too.
//  - `espresso` (text), `bronze` (accent) and `taupe` (borders) are contrast
//    families. In both themes a higher step number means more contrast
//    against the page: light gets darker, dark gets lighter.
//  - `white` is the recessed input surface. Light: actual white, brighter
//    than the card. Dark: darker than the card, so a field still reads as cut
//    into the surface rather than floating on it.
//
// Status tints are re-derived against the dark surface rather than reused —
// a 12% wash tuned for cream is invisible on a near-black brown.
// ---------------------------------------------------------------------------

/**
 * The darkest warm tone in the system: espresso taken most of the way to
 * black, never past it.
 *
 * 0.60 → 0.44 → 0.74. The middle value is the one worth explaining, because it
 * was the wrong answer to a real problem. Dark mode read as a cave, so the
 * surfaces were lifted until a card separated from the page without any help —
 * and the result was a page that read BROWN. Not dark and warm: brown. At 0.44
 * this base is #25211E, and a whole viewport of #25211E with a wide, low-
 * contrast glow washed over it is a mid-brown field, which is the opposite of
 * the near-black, atmospheric register the clinic's own site is in.
 *
 * 0.74 is #110F0D: black at a glance, warm on inspection (r > g > b, never a
 * neutral #111 and never a cool one). Separation is no longer asked of the base
 * being light; it comes from the card being genuinely lifted off it (see the
 * surface scale below), from the hairline border, and from the one corner of
 * warm light — in that order, so the interface still works with the glow turned
 * off entirely.
 */
const nightBase = mix(brand.espresso, '#000000', 0.74);
/** The lift direction for dark surfaces — toward a warm mid-brown, never toward grey. */
const nightLift = mix(brand.espresso, brand.taupe, 0.55);

/** Surface family in dark: lower step = more raised. */
function buildDarkSurfaceScale(base: string): Record<number, string> {
  // The raised steps are a long way apart, and they have to be: a lift is a
  // RATIO against the surface under it, so the same 0.10 mix that visibly
  // raised a card off #25211E is nearly invisible against #110F0D. The card
  // (step 50) lands about 1.5:1 above the page, which is a step you can see
  // across a room and still well below the point where the page stops reading
  // as black.
  const steps: Record<number, number> = {
    50: 0.2, 100: 0.27, 200: 0.35, 300: 0.45, 400: 0.58,
    500: 0, 600: -0.2, 700: -0.4, 800: -0.6, 900: -0.8,
  };
  const out: Record<number, string> = {};
  for (const [step, t] of Object.entries(steps)) {
    const n = Number(step);
    out[n] = t === 0 ? base : t > 0 ? mix(base, nightLift, t) : mix(base, '#000000', -t);
  }
  return out;
}

/** Contrast family in dark: higher step = brighter, i.e. more contrast against the page. */
function buildDarkContrastScale(base: string, page: string): Record<number, string> {
  const steps: Record<number, number> = {
    50: -0.86, 100: -0.72, 200: -0.52, 300: -0.32, 400: -0.14,
    500: 0, 600: 0.16, 700: 0.32, 800: 0.5, 900: 0.68,
  };
  const out: Record<number, string> = {};
  for (const [step, t] of Object.entries(steps)) {
    const n = Number(step);
    out[n] = t === 0 ? base : t < 0 ? mix(base, page, -t) : mix(base, brand.white, t);
  }
  return out;
}

const darkPage = nightBase;
/** Text: a warm light cream, never pure white — white body text on a warm dark surface glares. */
const darkText = mix(brand.cream, brand.white, 0.45);
/** Accent: bronze lifted far enough to clear AA against the dark page. */
const darkBronze = mix(brand.bronze, brand.cream, 0.42);
/** Borders: a warm mid-brown that shows against every dark surface without becoming a line of light. */
const darkTaupe = mix(brand.taupe, nightBase, 0.66);

export const darkScales = {
  cream: buildDarkSurfaceScale(darkPage),
  espresso: buildDarkContrastScale(darkText, darkPage),
  bronze: buildDarkContrastScale(darkBronze, darkPage),
  taupe: buildDarkContrastScale(darkTaupe, darkPage),
} as const;

/**
 * The recessed input surface. Light: literal white, one step brighter than
 * the card. Dark: one step *darker* than the card, which is what makes the
 * same inset shadow read as recessed in both themes.
 *
 * Eased from 0.35 to 0.18 when the page went to #110F0D. A field cut 35% below
 * a near-black page is #0B0A09, which is not a recessed surface, it is a hole —
 * and the depth cue stops working the moment there is no further down to go.
 * The card is now lifted far enough that a field sitting just below the PAGE
 * still reads as recessed relative to the card it is drawn on.
 */
const darkWhite = mix(darkPage, '#000000', 0.18);

/**
 * The status label colour in dark, re-derived from the HUE rather than
 * lightened from the light-mode value.
 *
 * Lightening the light-mode hex is what a naive dark mode does here, and it
 * desaturates twice: the light value is already pulled toward espresso to
 * clear AA on cream, and pulling that toward a warm cream as well lands on a
 * beige that is no longer recognisably green or gold. Starting from the hue
 * each time keeps the chroma and only spends contrast where it is needed.
 *
 * Lifted further than the light-mode equivalent is darkened, because a status
 * label in dark has to clear AA against its OWN wash as well as the page — and
 * the dark wash carries more hue (26% against light's 16%), so it is the
 * tighter of the two constraints.
 */
function darkStatusHex(hue: StatusHue): string {
  // Re-derived a second time (Aug 2026) against the near-black base. The
  // surfaces went DOWN this round rather than up, so every one of these has
  // more room than it had and can keep more of its own chroma: the binding
  // constraint is still AA against its own wash, and the wash is now a mix from
  // a much darker card. Solved per hue for the smallest lift that clears 4.5:1
  // on the wash, the page, the card and the input — spending more than that is
  // spending chroma for nothing, and chroma is the whole reason a status colour
  // exists.
  const toward: Record<StatusHue, number> = { green: 0.44, olive: 0.39, yellow: 0.34, orange: 0.42, red: 0.5 };
  return mix(statusHue[hue], darkText, toward[hue]);
}

/** Every colour token, per theme, as a flat map of CSS custom property → hex. */
function buildThemeTokens(mode: 'light' | 'dark'): Record<string, string> {
  const dark = mode === 'dark';
  const s = dark ? darkScales : scales;
  const surface = dark ? darkScales.cream[500] : brand.cream;
  // A tint washes toward the surface it sits on: the card in light mode, the
  // card in dark mode too — both are `cream-50`, which is what a tinted card
  // actually replaces.
  const tintTowards = dark ? darkScales.cream[50] : scales.cream[50];

  /**
   * The hue as it exists in THIS theme, before any wash.
   *
   * Dark is re-derived rather than reusing the light hue: the same brick red
   * that sits calmly on cream is a muddy near-invisible smear on a warm
   * near-black, and the same gold is a glare. Lifting toward the theme's own
   * text tone puts every hue at roughly the weight of body copy in its own
   * theme, which is what makes a 30% band read the same in both.
   */
  const themedHue = (hue: StatusHue): string => (dark ? mix(statusHue[hue], darkText, DARK_HUE_LIFT[hue]) : statusHue[hue]);

  /**
   * A FILL of colour in dark: a chart band, a range-bar segment, a boundary
   * line. Mixed from BLACK toward the hue, not from the warm surface toward it,
   * and that difference is the whole of why the chart bands read as green,
   * gold and red now instead of as three shades of mud.
   *
   * A wash is a tint OF THE CARD and is still mixed from the card, because it
   * is the card's own background and has to belong to it. A band is not: it is
   * a region of colour drawn over the plot, and mixing it from a warm brown
   * near-black adds red to every hue at once. On the old base that produced a
   * green band of #434A36 — a colour with more red in it than green — and a red
   * band a shade away from it. Mixing from neutral black keeps each hue's own
   * channel ratios and only takes lightness away, so green stays green.
   *
   * The per-hue strengths exist for the same reason `statusTextHex` and
   * `MARK_SHIFT` have per-hue values: yellow starts far brighter than the other
   * three, and one constant that made green visible would make yellow glare.
   */
  const darkFill = (hue: StatusHue, role: 'band' | 'track' | 'edge'): string =>
    // Clamped at 1: red's edge multiplier takes it fractionally past the hue
    // itself, and "past the hue" is not a colour anybody chose.
    mix('#000000', themedHue(hue), Math.min(1, DARK_FILL[role] * DARK_FILL_HUE[hue]));

  const out: Record<string, string> = {};

  for (const family of ['bronze', 'espresso', 'cream', 'taupe'] as const) {
    const scale = s[family];
    out[`--c-${family}`] = dark
      ? scale[500]
      : family === 'bronze' ? brand.bronze
      : family === 'espresso' ? brand.espresso
      : family === 'cream' ? brand.cream
      : brand.taupe;
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      out[`--c-${family}-${step}`] = scale[step];
    }
  }

  out['--c-white'] = dark ? darkWhite : brand.white;
  out['--c-page'] = surface;

  /**
   * ── THE SIDEBAR IS THE GLASS MATERIAL NOW, NOT A WASH OF ITS OWN ────────
   *
   * It was `brand.espresso` at 6% / 38%, which is a different colour from
   * every other translucent surface in the product, and the reason given was
   * that a sidebar has nothing but the page and the glow behind it while a
   * pinned control bar has the reader's own results. That reasoning is about
   * ALPHA and it was applied to the COLOUR, which is what made the column read
   * as a slightly-tinted piece of page rather than as a panel in front of one.
   * Measured: 1.10:1 off the light page and 1.17:1 off the dark one. A card is
   * 1.30:1 and 1.28:1. So a "panel" that is a tenth of the way to being a
   * surface, on a page whose surfaces are subtle to begin with.
   *
   * Same colour as `--c-glass` now — the CARD tone — set from one expression so
   * the two cannot drift, and kept under its own name because Tailwind's
   * `panel` colour resolves through it. The alpha is still the sidebar's own
   * (`PANEL_WASH_ALPHA`), because that part of the old reasoning was right.
   *
   * WHAT THAT CHANGES, MEASURED. Light 1.10 → 1.16:1, and the column now sits
   * ABOVE the page rather than below it, which is the same direction the
   * control bar's glass and the dark theme's panel both go. Dark 1.17 → 1.20:1,
   * with the glow knocked back to 1.58:1 of itself and the lit part of the
   * panel still 1.20:1 above the unlit part — light through it, dimmer,
   * continuous across the seam.
   *
   * THE CEILING IS THE GLOW, NOT THE CARD. Past about 80% in dark, the panel
   * stops transmitting: the lit and unlit halves converge and it becomes a lid.
   * That is what `stillLit` in tokenContrast.test.ts holds, and it binds before
   * the "stays below a card" rule does.
   */
  const glassColour = dark ? darkScales.cream[50] : mix(brand.white, brand.cream, 0.35);
  out['--c-panel'] = glassColour;
  // The alpha itself is PANEL_WASH_ALPHA below rather than a variable here,
  // because it is an opacity and not a colour: everything in this map is a hex
  // that themeCssVars turns into channels.

  /**
   * The sidebar's right-hand hairline — and it is PER THEME, which the `taupe`
   * step it replaced was not.
   *
   * It is the whole of the separation wherever the glow does not reach, which
   * on a wide window is most of the column, so it has to hold on its own. One
   * step of the taupe scale is worth very different amounts against a cream
   * page and a near-black one: taupe[600] measures 1.88:1 in light and 3.40:1
   * in dark. So light takes another step (taupe[700], 2.58:1) and dark stays
   * where it is — a further step there would be 5.12:1, which is a line of
   * light down the side of the page rather than a hairline.
   */
  out['--c-panel-edge'] = dark ? darkScales.taupe[600] : scales.taupe[700];

  /**
   * ── GLASS ──────────────────────────────────────────────────────────────
   *
   * GLASS, NOT FILL, IS HOW A SURFACE SEPARATES ITSELF FROM THE PAGE HERE.
   *
   * The rule the whole dark theme turns on is that nothing may paint an opaque
   * background over the corner glow — and that rule is what unpinned the
   * results control bar, because a sticky element with no surface has the page
   * scrolling straight through it and the only fix anybody reached for was a
   * solid fill. Glass answers both at once: it is a surface, and the light and
   * the content behind it still come through, diffused.
   *
   * THIS IS THE COLOUR, and it is the CARD surface rather than the page. A
   * glass sheet the colour of the page is invisible against the page; the card
   * tone is the one already established as "a thing sitting above the page",
   * so the bar reads as the same material family as everything else on it.
   *
   * The alpha is GLASS.wash and the blur is GLASS.blur, both emitted by
   * tailwind.config.ts, because an opacity and a length are not colours and
   * everything in this map is a hex.
   *
   * THE SIDEBAR TAKES THIS COLOUR TOO, at its own alpha (changed Aug 2026 —
   * see `--c-panel` above, which is now set from the same expression). It used
   * to take espresso, on the reasoning that its alpha is decided by what is
   * behind it. Its ALPHA is; its colour is not, and giving one translucent
   * surface in the product a colour of its own is what stopped the column
   * reading as the same material as everything else pinned to the page.
   */
  out['--c-glass'] = glassColour;

  /**
   * ── VELLUM: THE SECOND SURFACE REGISTER (Aug 2026) ──────────────────────
   *
   * The product had exactly one move — near-black plus a gold corner glow, or
   * cream plus the same layout — and every screen was therefore the same
   * weight. Nothing changed as a reader moved between pages, so nothing told
   * them they had moved.
   *
   * ONE CLASS OF CONTENT GETS THIS, AND IT IS EXPLANATORY PROSE: the marker
   * explanation card, and the same component wherever else it appears
   * (Understanding results). It is the only content in the portal that is
   * WRITING rather than DATA — everything else on a results page is a number, a
   * range, a status or a date — and the move from "what was measured" to "what
   * it means" is the one boundary in this product worth marking with a change
   * of ground rather than another heading. It also happens to be where somebody
   * settles in to read a few hundred words, and a reading surface is a real
   * thing rather than a decorative one.
   *
   * THE OPERATION IS "TOWARD PAPER", NOT "UP ONE RUNG", and that is why it goes
   * in opposite directions in the two themes. Paper is warm and mid-toned: on a
   * near-black page it is lighter than the card, and on a page whose card is
   * already a near-white it is a shade deeper and distinctly warmer. Measured:
   *
   *     light  #f0ede7 — 1.14:1 off the page, 1.14:1 off the card, text 9.3:1
   *     dark   #3d3933 — 1.66:1 off the page, 1.30:1 off the card, text 9.8:1
   *
   * IT DOES NOT BREAK THE LADDER. page → panel → card is untouched in both
   * themes and tokenContrast.test.ts still holds it; the vellum is a REGISTER
   * beside that ladder rather than a rung on it. And it does not fight the
   * glow, because it is a card-sized surface and not a page background — the
   * rule that nothing may paint over the glow is about the shell, and cards
   * have always been opaque.
   *
   * NO NEW HUE. Light is cream carried toward white; dark is the night base
   * carried toward the same warm mid-brown the surface scale already lifts
   * with. Both are inside bronze / espresso / cream / taupe.
   */
  out['--c-vellum'] = dark ? mix(nightBase, nightLift, 0.36) : mix(brand.cream, brand.white, 0.45);

  /**
   * Text and icons on a FILLED accent — a bronze button, a selected option, an
   * avatar, the current step of a progress bar.
   *
   * This has to flip with the theme, and it is the one pairing that a naive
   * dark mode gets wrong every time. In dark, bronze is LIGHTENED so it clears
   * AA against a near-black page — at which point a light label on it measures
   * about 1.9:1, which is unreadable. So in dark the label goes dark instead.
   *
   * In light it is white rather than cream, and that is not a stylistic
   * preference either: cream on bronze measures 4.18:1, which fails AA for the
   * label on the product's primary button. White clears it. The "never pure
   * white" rule this palette carries is about SURFACES — a hard-white card on
   * cream reads as a cutout — and has never applied to type sitting on a fill.
   *
   * Deliberately NOT the same token as `oncolor` (staticTokens), which is the
   * light text on the atmospheric night panels. Those are dark in both themes
   * and their text must stay light in both; these fills are not.
   */
  out['--c-onaccent'] = dark ? mix(darkPage, '#000000', 0.25) : brand.white;

  /**
   * THE OPAQUE BAND FILLS, solved before the per-role loop because the two
   * HINGES are derived from the three STATES rather than from their own brand
   * hue — see BAND_FILL. Olive is exactly half of the green fill and the gold
   * one; orange is exactly half of the gold and the red. That is the claim a
   * boundary blend makes, made where the blend is actually drawn.
   */
  const bandFill = (hue: 'green' | 'yellow' | 'red' | 'optimal'): string => {
    const { saturation, lightness } = BAND_FILL[mode][hue];
    return reLightness(hue === 'optimal' ? statusHue.green : statusHue[hue], lightness, saturation);
  };
  const FILL: Record<StatusHue, string> = {
    green: bandFill('green'),
    yellow: bandFill('yellow'),
    red: bandFill('red'),
    olive: mix(bandFill('green'), bandFill('yellow'), 0.5),
    orange: mix(bandFill('yellow'), bandFill('red'), 0.5),
  };

  // The five hues, per role. Emitted per HUE and not only per status because
  // the two HINGES are real tokens here — olive at a reference bound, orange at
  // a significantly-out threshold, each the midpoint of the gradient centred on
  // its own boundary — while neither is ever a status of its own.
  for (const hue of Object.keys(statusHue) as StatusHue[]) {
    const h = themedHue(hue);
    // The wash is the card's own background, so it is mixed FROM the card in
    // both themes. Everything below it is a fill and, in dark, is mixed from
    // neutral black instead — see darkFill.
    out[`--c-hue-${hue}-wash`] = mix(tintTowards, h, dark ? TINT_MIX.washDark : TINT_MIX.wash);
    out[`--c-hue-${hue}-band`] = dark ? darkFill(hue, 'band') : mix(tintTowards, h, TINT_MIX.band);
    // THE OPAQUE BAND FILL — the chart's bands and the range bars' track, one
    // colour, drawn at full opacity in both. It used to be `-plot`, a hue meant
    // to be composited at BAND_WEIGHT; see BAND_FILL for why an alpha was the
    // ceiling on how much colour a band could carry.
    out[`--c-hue-${hue}-fill`] = FILL[hue];
    out[`--c-hue-${hue}-track`] = dark ? darkFill(hue, 'track') : mix(tintTowards, h, TINT_MIX.track);
    out[`--c-hue-${hue}-edge`] = dark ? darkFill(hue, 'edge') : mix(tintTowards, h, TINT_MIX.edge);
    // Away from the surface rather than toward it — see TINT_MIX.mark.
    out[`--c-hue-${hue}-mark`] = dark
      ? mix(h, darkText, MARK_SHIFT_DARK[hue])
      : mix(statusHue[hue], brand.espresso, MARK_SHIFT[hue]);
  }

  for (const key of Object.keys(status) as StatusKey[]) {
    out[`--c-status-${kebab(key)}`] = dark ? darkStatusHex(status[key].hue) : status[key].hex;
    // Aliases onto the hue this state resolves to. Kept as their own variables
    // so a component asks for "the significantly-high tint" rather than having
    // to know that significantly-high happens to be red.
    const hue = STATUS_TINT_HUE[key];
    for (const [role, name] of [
      ['wash', ''],
      ['bar', '-bar'],
      ['band', '-band'],
      ['fill', '-fill'],
      ['edge', '-edge'],
      ['mark', '-mark'],
    ] as const) {
      const source = role === 'bar' ? 'track' : role;
      out[`--c-tint-${kebab(key)}${name}`] = out[`--c-hue-${hue}-${source}`];
    }
  }

  // Charts. The bands and the point fills now take the status hues above (see
  // `--c-tint-*-band`); everything structural — axes, gridlines, the trend
  // line itself, the optimal band — stays on the four brand hues, so the only
  // colour in a chart that means anything is the colour that means status.
  /**
   * THE LINE, BRIGHTENED BECAUSE THE BANDS GOT HEAVIER (Aug 2026).
   *
   * The rule the redesign was given is the right way round and worth keeping
   * written down: if brighter bands bury the line, brighten the LINE — never
   * dull the bands back down. The line is the content and the bands are the
   * context, and that ordering is a fact about the chart rather than about how
   * much ink is on it.
   *
   * So it steps AWAY from the surface in each theme rather than staying at the
   * brand bronze. It was `bronze-700` light / `bronze-500` dark, which cleared
   * the composited bands and does NOT clear the painted ones — 2.87:1 and
   * 2.42:1 on the significantly-out red, i.e. under AA-large, a line lost in
   * its own context. It is solved now, at bronze's own hue and saturation and
   * at the lightness that clears 3.3:1 on every band including the optimal
   * narrowing: see LINE_LIFT for why it is solved rather than stepped further
   * along a scale whose dark end has had the bronze mixed out of it.
   * Paired with `chart.lineWidth`.
   */
  // Bronze's OWN saturation, and nothing higher — the bronze hue sits at 19°,
  // between the status red at 8° and the status orange at 30°, so a saturated
  // bronze line would read as a status colour crossing the plot.
  out['--c-chart-line'] = reLightness(brand.bronze, LINE_LIFT[mode], ownSaturation(brand.bronze));
  out['--c-chart-point'] = out['--c-chart-line'];
  /**
   * The ring around a plotted point, and it is THE CARD'S OWN SURFACE in both
   * themes rather than white in light and the card in dark.
   *
   * A point is drawn on top of the line, so the ring is what makes the line
   * appear to pass BEHIND it rather than to stop at it — and that illusion only
   * works if the ring is the colour the plot would be if nothing were drawn
   * there. In dark that was already the card. In light it was pure white, which
   * on a `cream-50` card is a faint cold halo around every point; small, and
   * the sort of small that reads as a rendering artefact rather than as a
   * choice.
   */
  out['--c-chart-point-ring'] = s.cream[50];
  /**
   * The hairline that bounds a band — AND IT WENT DARKER IN LIGHT (Aug 2026).
   *
   * It has one job that nothing else can do: with the bands blending across a
   * boundary rather than meeting at a step, this line is the only thing saying
   * exactly where the reference bound is, and it is the thing that has to
   * survive the colour being taken away. At `taupe-600` over the new
   * significantly-out band it measured **1.11:1** — a line nobody can see,
   * drawn across the one region where being able to see it matters most.
   *
   * `taupe-900` in light and `taupe-800` in dark: 2.05:1 and 2.32:1 on that
   * same band, which is a hairline in both themes rather than a hairline in one
   * and a rumour in the other. It is deliberately not `espresso`, which at
   * 2.57:1 starts to compete with the trend line — the boundary is furniture
   * and the reader's own result is not.
   */
  out['--c-chart-reference-edge'] = dark ? darkScales.taupe[800] : scales.taupe[900];
  /**
   * THE OPTIMAL NARROWING, AS AN OPAQUE FILL of its own (Aug 2026).
   *
   * It was the green band's own colour drawn OVER the green band at a small
   * alpha — 0.09 on the chart, 0.24 of the green edge on a range bar, two
   * numbers for one idea, and both of them alpha in a system where a band no
   * longer has any. So the deepening is a colour now, in the one place colours
   * are decided: the same green as the in-range band, one rung further along
   * the ladder. 1.14:1 off the band it sits inside, in both themes — visible as
   * a shading-in and nothing like the step a boundary makes.
   *
   * The two bronze tokens that used to be here (`--c-chart-optimal-band` /
   * `-edge`) are gone with the hatched band they painted; see the note on
   * `chart` below.
   */
  out['--c-band-optimal'] = bandFill('optimal');
  out['--c-chart-axis-line'] = dark ? darkScales.taupe[600] : brand.taupe;
  out['--c-chart-axis-text'] = dark ? darkScales.espresso[400] : scales.espresso[400];
  out['--c-chart-gridline'] = dark ? darkScales.taupe[300] : scales.taupe[200];
  out['--c-chart-cursor'] = dark ? darkScales.taupe[700] : scales.taupe[600];
  out['--c-chart-surface'] = dark ? darkScales.cream[50] : mix(brand.white, brand.cream, 0.35);
  /**
   * The plot area, one step away from the card it sits on — DOWN in light and
   * DOWN in dark, which is the same direction and not the same operation. In
   * light the card is a warm off-white and a step down is the cream page tone.
   * In dark the card is already near-black, and the trap recorded on
   * `darkWhite` applies: there is no further down that measures. So dark takes
   * a step toward the PAGE (which is darker than the card) rather than toward
   * black, which is a real step of about 1.10:1 rather than the 1.02:1 that
   * mixing toward black produces.
   */
  out['--c-chart-plot-surface'] = dark ? mix(darkPage, darkScales.cream[50], 0.55) : mix(brand.cream, brand.white, 0.35);
  /** The plot's own hairline frame. The same neutral as every other boundary in the chart. */
  out['--c-chart-plot-frame'] = dark ? darkScales.taupe[600] : scales.taupe[400];
  /**
   * A reference bound on the axis. Full text weight against the muted ticks —
   * see chart.boundLabel for why the difference is weight rather than hue.
   */
  out['--c-chart-bound-label'] = dark ? darkScales.espresso[700] : scales.espresso[700];

  /**
   * THE RESULT MARK ON A RANGE BAR — the dot on the full bar and the pointer on
   * the card-sized one — and the ring around it.
   *
   * It used to be filled with its own status hue. On a track made of that same
   * hue that is a mark drawn in the colour it is standing on: the dot on an
   * in-range result was a green dot on a green segment, and the one on a high
   * result was pale yellow on gold. The mark's job is POSITION — "your result is
   * here" — and the status is already said by the segment it lands on, by the
   * chevron, by the word and by the card's own wash. So the mark stops carrying
   * colour and starts being visible.
   *
   * THE FILL IS NOT THE SAME IN BOTH THEMES, and it is measured rather than
   * chosen. Against the four track colours, pure white gives 4.69–5.71:1 in
   * dark and only 1.73–2.72:1 in light — the pale green in-range track is
   * 2.11:1, which is a white dot that vanishes. So dark gets the white that was
   * asked for and light gets espresso, which is 4.00–6.29:1 on the same four.
   * The ring inverts with it, so there is always a dark mark inside a light ring
   * or a light mark inside a dark one, whichever way round the theme is.
   *
   * `#ffffff` and not `cream`: cream in dark mode is #f0ede7, which against a
   * gold track reads as a slightly dirty version of the track. This is the one
   * pure white in the product and it is a 14px dot.
   */
  out['--c-rangemark'] = dark ? '#ffffff' : brand.espresso;
  out['--c-rangemark-ring'] = dark ? mix(brand.espresso, '#000000', 0.72) : brand.white;

  // Shadow colour, derived from espresso in BOTH themes — nothing in this
  // system is ever a neutral grey, shadows least of all.
  //
  // Light is espresso itself, so depth stays warm. Dark is espresso taken 88%
  // of the way to black rather than to black outright: the depth on a warm
  // near-black surface has to come from darkness, and a shadow with much warmth
  // left in it is a smudge — but a shadow with NONE is the one cool thing on an
  // entirely warm page, and at the corner of a card it shows.
  out['--c-shadow'] = dark ? mix(brand.espresso, '#000000', 0.88) : brand.espresso;

  /**
   * The ambient light source (dark mode only — see `.dark body::before` in
   * globals.css).
   *
   * ONE radial gradient, anchored at one corner of the viewport, with a defined
   * bright centre that falls away to nothing well before the opposite corner.
   * It is a light SOURCE and has to read as one: brightest at a point, dimming
   * outward, gone. What it was instead was a pair of radials at 112% and 140%
   * of the viewport, which put the entire page inside the bright part of the
   * curve — every pixel got roughly the same 5–15% of gold, so it was not a
   * glow at all, it was a flat brown wash over a brown page. The falloff was
   * technically present and nowhere visible.
   *
   * Gold-bronze, and pushed further toward gold than it was: the brand accent
   * alone reads as a brown stain, and a neutral white glow turns the whole warm
   * palette grey the moment it lands on anything. The centre is bright enough
   * to be a source on a #110F0D page and the tail reaches zero at the hue
   * itself rather than at `transparent` — see globals.css, where fading to
   * `transparent` would fade through a grey shoulder.
   *
   * It is emitted in light mode too so nothing has to branch on the theme, but
   * the rule that paints it is inside `.dark`. Static, at every motion
   * preference: an ambient light that breathes is a notification, not a room.
   */
  out['--c-glow'] = mix(brand.bronze, '#f0bd6a', 0.72);

  /**
   * ── THE COLOUR OF LIGHT ON A PANE ──────────────────────────────────────
   *
   * What the specular sheen and the two edge highlights on the sidebar are
   * drawn in (see `PANEL_SHEEN` and `.panel-wash` in globals.css). It is not
   * `--c-glow`, which is the light SOURCE and is a saturated gold: a gold
   * streak down a 288px column reads as a stain rather than as a highlight.
   * It is a warm white — white in light, and white carried a little way toward
   * the glow in dark, so a reflection on this page picks up the colour of the
   * one thing lighting it without becoming that colour.
   */
  out['--c-sheen'] = dark ? mix('#ffffff', out['--c-glow'], 0.34) : brand.white;

  return out;
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export const themeTokens = {
  light: buildThemeTokens('light'),
  dark: buildThemeTokens('dark'),
} as const;

/**
 * How much of the glass colour survives on the sidebar, per theme. Emitted as
 * `--panel-wash` by tailwind.config.ts and consumed by `.panel-wash` in
 * globals.css.
 *
 * 0.06 / 0.38 OF ESPRESSO → 0.75 / 0.78 OF THE CARD TONE (Aug 2026). The two
 * are not comparable numbers: the old pair was a faint tint of a colour far
 * from the surfaces around it, and this is most of a colour close to them. It
 * is the same alpha family as the control bar's 0.62 / 0.58, which is the
 * point — one material, one look, a per-surface alpha.
 *
 * SOLVED RATHER THAN CHOSEN, against the four things tokenContrast.test.ts
 * holds, and the binding constraint is not the one anybody expects. It is not
 * "stay below a card": it is that past roughly 0.80 in dark the panel stops
 * TRANSMITTING — its lit and unlit halves converge and the glow reads as
 * having stopped at the seam. So the alpha is set just under that, which is
 * also comfortably under the card.
 */
export const PANEL_WASH_ALPHA = { light: 0.75, dark: 0.78 } as const;

/**
 * THE GLASS MATERIAL, in three numbers, shared by every surface that uses it.
 *
 * One blur radius and one saturation across the product, so the pinned control
 * bar, the sidebar, the chart tooltip and the download button are the same
 * material rather than four things that happen to be blurred. Only the alpha
 * differs per surface, and only because what is behind them differs — see the
 * note on `--c-glass`.
 *
 * `blur` WAS 14px "as a budget rather than a taste", which is a guess with a
 * unit on it. It has now been measured, and the measurement changed the number
 * and — more usefully — the reasoning.
 *
 * MEASURED (e2e/zz-render-timing.spec.ts, "glass scroll cost"): a continuous
 * 3-second scroll of the by-marker view, 166 cards, with the control bar
 * pinned so the filter is actually compositing.
 *
 *     backdrop-filter off   60 fps · median 16.7ms · 0 frames over 20ms
 *     blur 14px             23 fps · median 50.0ms · 66 frames over 20ms
 *     blur 10px             39 fps · median 16.7ms · 50 frames over 20ms
 *     blur  8px             31 fps · median 33.3ms
 *     blur  6px             25 fps · median 33.4ms
 *     blur  2px             25 fps · median 33.4ms
 *
 * THE RADIUS IS NOT THE COST. 2px is as expensive as 14px and both are a third
 * of the frame rate with the filter absent — so what is being paid for is the
 * EXISTENCE of the backdrop pass (a render surface, re-composited every frame
 * the element is on screen), not the work inside it. "Reduce the radius until
 * it stops dropping frames" has no answer above zero.
 *
 * WHAT THAT MEASUREMENT IS AND IS NOT. It is headless Chromium, which rasterises
 * in software (SwiftShader) — the worst case for a backdrop filter and not what
 * anybody's browser does. A GPU-composited backdrop filter is close to free.
 * So this is a floor, not a verdict, and it is NOT grounds for replacing the
 * material with an opaque fill: that would paint over the corner glow, which is
 * the thing glass exists to avoid.
 *
 * WHAT WAS DONE. 10px, because it is the only value that measured better and it
 * costs nothing to take — the diffusion is still unambiguous at 10 (body copy
 * underneath is a wash, not letters). WHAT IS STILL OPEN: measure this on a
 * GPU-backed browser before drawing any conclusion about the design. The number
 * to change is here; the spec that produces the table is committed.
 *
 * `saturate` is barely above 1: glass that desaturates reads as fog, and glass
 * that saturates hard reads as a colour filter. This is enough that the warm
 * page underneath stays warm through it.
 */
export const GLASS = {
  wash: { light: 0.62, dark: 0.58 },
  blur: '10px',
  saturate: '1.08',
} as const;

/**
 * ── GLASS IS NOT THE BLUR. THE BLUR IS DOING NOTHING HERE (Aug 2026) ───────
 *
 * The sidebar's computed style has been right for a while — `blur(10px)
 * saturate(1.08)`, `rgba(42,39,35,0.78)`, measured off the element by
 * e2e/patient-sidebar.spec.ts — and the column still read as a flat panel. It
 * was going to keep reading as one, and the reason is physical rather than a
 * matter of finding the right number.
 *
 * `backdrop-filter: blur()` blurs WHAT IS BEHIND THE ELEMENT. Behind this
 * element there is a flat page colour and one smooth radial gradient, and a
 * Gaussian blur of a smooth gradient is the same smooth gradient. There is
 * nothing with an edge back there to smear, so the filter has nothing to show
 * and no radius makes it appear. A previous session diagnosed exactly this and
 * was overruled; it was right. (The blur STAYS: content does scroll behind the
 * pinned control bar and the chart tooltip, which share this material, and
 * removing it there would cost something real.)
 *
 * So the panel is made to read as glass by the things that actually signal a
 * pane, none of which depend on there being texture behind it:
 *
 *   `peak`   A SPECULAR SHEEN. One soft diagonal band of light across the
 *            column, brightest at its top-right — the corner nearest the
 *            glow — and gone by roughly two thirds of the way down. This is
 *            the largest of the four effects and the one that does most of
 *            the work: a flat surface with a highlight travelling across it
 *            is read as reflective before anything else is considered.
 *   `edge`   AN INNER HIGHLIGHT ALONG THE TOP AND THE RIGHT EDGE. A hairline
 *            of light just inside the border, as though the cut edge of the
 *            pane catches the light. The right edge is stronger than the top:
 *            it is the edge that faces the room, and it sits immediately
 *            inside `--c-panel-edge`, so the two together read as thickness.
 *   `grain`  A VERY FAINT NOISE. What stops a large flat area reading as a
 *            fill; it is below the threshold of being noticed as texture and
 *            above the threshold of being noticed as absent.
 *
 * WHAT WAS ASKED FOR AND NOT DONE, AND WHY. The brief also said to raise the
 * panel's own translucency toward the glow and lower it away, so the wash has
 * a gradient rather than one value. Taken literally that is backwards in dark
 * mode: `--c-panel` is a PALE tone over a near-black page, so more of it away
 * from the light makes the far end LIGHTER than the lit end and the gradient
 * runs the wrong way — and it walks the unlit panel up toward the card, which
 * the ladder in tokenContrast.test.ts (page, then panel, then card) forbids.
 * The same intent from the other side is what is implemented: the pane is
 * brighter where the light reaches it and returns to its flat body value where
 * it does not, so the surface does have a gradient across it, drawn in light
 * rather than in opacity. `PANEL_WASH_ALPHA` is untouched and every number the
 * token tests pin still describes the panel at its darkest point.
 *
 * The peaks are held under what the AA check allows on top of the lit panel —
 * see `keeps every label on it at AA` in tokenContrast.test.ts, which now
 * composites the sheen into the brightest backdrop a nav label ever stands on.
 */
export const PANEL_SHEEN = {
  peak: { light: 0.2, dark: 0.07 },
  edge: { top: { light: 0.45, dark: 0.14 }, right: { light: 0.65, dark: 0.24 } },
  grain: { light: 0.035, dark: 0.055 },
} as const;

/** `#8a5e45` → `138 94 69`, the channel triplet Tailwind's `<alpha-value>` syntax needs. */
export function hexToRgbChannels(hex: string): string {
  return hexToRgb(hex).join(' ');
}

/**
 * The two custom-property blocks, ready for Tailwind's `addBase`. Light is on
 * `:root` so it is the default before any JS runs; dark is on `.dark`, set by
 * the theme provider from the persisted choice or the system preference.
 */
export function themeCssVars(mode: 'light' | 'dark'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, hex] of Object.entries(themeTokens[mode])) {
    out[name] = hexToRgbChannels(hex);
  }
  return out;
}

/**
 * Static tokens — the two families that do NOT flip with the theme.
 *
 * `night` is the atmospheric dark panel (the auth split, tooltips, the fasting
 * notice, the sidebar's hover labels). Those surfaces are dark on purpose in
 * both themes; inverting them in dark mode would turn the one deliberately
 * dark thing on the page into the one deliberately light thing.
 *
 * `oncolor` is the light text that sits on them, and on any filled accent
 * (a bronze button, a selected option). It is `cream` frozen at its light
 * value — using the theme-aware `cream` there would put dark text on a bronze
 * fill the moment someone switched to dark mode.
 */
export const staticTokens = {
  oncolor: brand.cream,
  night: {
    ...inkScale,
    /** The shallowest of the dark tones — espresso itself. The top stop of the auth panel's gradient. */
    soft: brand.espresso,
    /**
     * The brand accent AS IT APPEARS ON A NIGHT PANEL — a lightened bronze.
     * Frozen for the same reason the panel is: `bronze-300` is a pale tint in
     * light mode and a near-black one in dark, so the wordmark's dot on the
     * auth panel would simply disappear the moment someone chose dark.
     */
    accent: scales.bronze[300],
  },
} as const;

/**
 * Status tint utilities, by status key. Values are theme-aware CSS variables,
 * so the same string is right in light and in dark.
 *
 *  surface — the card/row/tile wash
 *  bar     — the category summary bar fill
 *  band    — a chart band behind the data
 *  edge    — that band's boundary line, and the ring on a point
 *  mark    — the fill of a plotted point or a range-bar dot
 */
/**
 * ⚠ Every runtime token below is `rgb(var(--x))`, never a bare `var(--x)`.
 *
 * This is not a style choice, it is the bug that made the whole status colour
 * layer invisible. The custom properties hold BARE CHANNELS ("205 218 193")
 * rather than a colour, because that is the only form Tailwind's
 * `<alpha-value>` syntax can composite an opacity into — see the note in
 * tailwind.config.ts. A bare `var(--c-status-high)` therefore resolves to the
 * string "205 218 193", which is not a valid colour value: the browser drops
 * the declaration and the element falls back to inherited text colour or to
 * black. No error, no warning, nothing in the console. It simply renders in
 * the wrong colour, which is exactly what a status badge, an SVG `fill` and a
 * gradient stop had all been doing.
 *
 * Anything applied through a `style` prop, an SVG paint attribute or a
 * gradient stop must go through these helpers. Anything applied as a Tailwind
 * class (`bg-tint-high`) must NOT — Tailwind adds the `rgb()` itself.
 */
function tintSet(key: StatusKey) {
  const k = kebab(key);
  return {
    surface: `rgb(var(--c-tint-${k}))`,
    bar: `rgb(var(--c-tint-${k}-bar))`,
    band: `rgb(var(--c-tint-${k}-band))`,
    /** The opaque band fill — a chart band and a range-bar segment. See BAND_FILL. */
    fill: `rgb(var(--c-tint-${k}-fill))`,
    edge: `rgb(var(--c-tint-${k}-edge))`,
    mark: `rgb(var(--c-tint-${k}-mark))`,
  } as const;
}

export const statusTint = {
  inRange: tintSet('inRange'),
  high: tintSet('high'),
  low: tintSet('low'),
  significantHigh: tintSet('significantHigh'),
  significantLow: tintSet('significantLow'),
} as const;

/**
 * The same five roles per HUE rather than per status — the only way to reach
 * the two HINGES, which are the midpoint of the gradient drawn at a boundary
 * (olive at a reference bound, orange at a significantly-out threshold) and are
 * never statuses.
 */
function hueSet(hue: StatusHue) {
  return {
    wash: `rgb(var(--c-hue-${hue}-wash))`,
    band: `rgb(var(--c-hue-${hue}-band))`,
    fill: `rgb(var(--c-hue-${hue}-fill))`,
    track: `rgb(var(--c-hue-${hue}-track))`,
    edge: `rgb(var(--c-hue-${hue}-edge))`,
    mark: `rgb(var(--c-hue-${hue}-mark))`,
  } as const;
}

export const hueTint = {
  green: hueSet('green'),
  olive: hueSet('olive'),
  yellow: hueSet('yellow'),
  orange: hueSet('orange'),
  red: hueSet('red'),
} as const;

/**
 * THE OPTIMAL NARROWING'S OWN FILL — opaque, and the same colour on the trend
 * chart and on both range bars.
 *
 * One token because it is one region: the part of the reference range that is
 * also optimal, drawn as the in-range green taken a rung deeper. It replaced
 * two different alphas of two different greens applied in two components, which
 * is how one idea ends up looking like two.
 */
export const OPTIMAL_FILL = 'rgb(var(--c-band-optimal))';

// ---------------------------------------------------------------------------
// Charts — structure from the brand palette, status from the status hues.
//
// A trend chart now shades where the lab's range sits: the reference range
// itself as a soft green band, a yellow band immediately above and below it,
// and red beyond the significantly-out thresholds, with orange as the
// transition into it. Every one of those boundaries is derived from THAT
// result's own reference range and severity threshold — there is no fixed
// scale anywhere, and a marker whose range is 20–42 gets bands 20–42 wide.
//
// What has NOT changed, and is what makes the bands safe:
//  · Status is still carried by the POINT'S SHAPE and by the word in the
//    tooltip and the key. The bands are reinforcement.
//  · Every band carries a boundary line and a written entry in the key, so it
//    is legible in greyscale and to a colourblind reader.
//  · The bands say where the range sits and nothing more. They are never
//    labelled good, healthy, bad, concerning or danger — the vocabulary is
//    in range / above / below / significantly out, and stops there.
//
// Everything structural — axes, gridlines, the trend line, the optimal band,
// the cursor, the surface — still derives from bronze/espresso/cream/taupe and
// `ink`, so the only colour in a chart that carries meaning is status.
// ---------------------------------------------------------------------------

// Every value here is a CSS custom property rather than a literal hex, so a
// chart follows the light/dark theme without any component needing to know
// which one is active — SVG `fill`/`stroke` resolve custom properties the same
// way any other CSS colour does. The concrete hexes per theme live in
// `themeTokens` above; only the opacities are literal, because they are the
// same in both.
export const chart = {
  /** The trend line itself. Bronze — it says "this is your series", not "this is good". */
  line: 'rgb(var(--c-chart-line))',
  /**
   * And its weight. A token rather than a literal on the `<Line>` because it is
   * half of one decision with `BAND_CONTRAST`: the bands were raised to make
   * the regions unmistakable, and the answer to a line competing with them is a
   * heavier line, never a lighter band.
   */
  lineWidth: 3,
  point: 'rgb(var(--c-chart-point))',
  /** Ring around every point so it stays legible against the band it lands on. */
  pointRing: 'rgb(var(--c-chart-point-ring))',
  /**
   * The hairline that bounds a band. Neutral taupe rather than the band's own
   * hue, on purpose: it is the thing that has to stay visible when the colour
   * is taken away, so it cannot be made of colour.
   */
  referenceEdge: 'rgb(var(--c-chart-reference-edge))',
  /**
   * How heavily each boundary is drawn. Both are hairlines now rather than the
   * near-solid rules they were: with the bands softened to a wash, a 0.85-opacity
   * line over them was the strongest thing in the plot, which put the chart's
   * emphasis on the edge of the reference range rather than on the reader's own
   * result. The reference bounds still take twice the weight of the severity
   * thresholds, because that is the band the chart is actually about.
   */
  referenceEdgeOpacity: 0.62,
  severityEdgeOpacity: 0.4,
  /**
   * THE STEP: where a marker's reference range changed between two results.
   *
   * One dashed vertical hairline, the full height of the plot, at the midpoint
   * between the two samples the change happened between. These three values are
   * tokens rather than literals because the requirement on them is that it looks
   * the SAME every time it happens — and the pattern is stated in two places (the
   * rule on the plot and the swatch in the key) which drifted apart the moment
   * either was edited. The colour is `referenceEdge`, the same neutral every
   * other boundary in the chart is drawn in: the step is a boundary, and a
   * boundary that carries a hue is a boundary competing with the status layer.
   *
   * Held as a tuple rather than the "3 3" string SVG wants, so it stays a
   * non-colour token — tokenContrast.test.ts asserts every STRING in here is an
   * `rgb(var(--x))` colour, which is the check that stops a bare `var()` reaching
   * an SVG attribute and rendering black.
   */
  stepDashArray: [3, 3],
  stepOpacity: 0.7,
  stepWidth: 1,
  /**
   * ── OPAQUE BANDS (Aug 2026) ──────────────────────────────────────────
   *
   * `bandEdgeFade`, `areaOpacity` and the band weights are all GONE, and the
   * three removals are one decision. There is NO ALPHA ANYWHERE in a band now:
   * the rect is opaque, every gradient stop is opaque, and nothing behind a
   * band shows through it. A band that fades at its own edges has no edge, so
   * where one region ended and the next began became a matter of opinion on a
   * plot whose whole subject is a boundary; a band drawn at 15% of a colour can
   * carry at most 15% of a colour, which is what "washed out" was; and an area
   * fill under the line was a sixth region over five that already competed.
   *
   * A band is a solid rectangle in `--c-hue-*-fill`, handing over to its
   * neighbour across a blend centred on the boundary between them — a gradient
   * between two OPAQUE colours, never a ramp of opacity. The ladder that the
   * weights used to carry is in the colours: see BAND_CONTRAST in statusBands.
   */
  /**
   * ── THE PLOT AREA AS AN INSET PANEL ──────────────────────────────────
   *
   * A hairline frame and a surface fractionally away from the card, so the plot
   * reads as a recessed panel the drawing sits inside rather than as ink
   * floating on a card. It is the one box this chart is allowed: "no box" was
   * the right rule when the bands were slabs tiling the whole area edge to
   * edge, because a frame around a filled rectangle is a second outline round
   * the first. With flat low-weight bands there is real ground showing, and
   * ground needs an edge.
   *
   * No shadow and no inner border — one hairline, drawn once.
   */
  plotSurface: 'rgb(var(--c-chart-plot-surface))',
  plotFrame: 'rgb(var(--c-chart-plot-frame))',
  plotFrameOpacity: 0.5,
  /**
   * A reference bound printed on the left axis, distinct from a tick value.
   *
   * The tick values are the SCALE and the bounds are a CLINICAL THRESHOLD, and
   * a reader has to be able to tell one from the other at a glance. Same mono
   * face and the same size; the bound is set in the text colour with a short
   * lead rule to its own hairline, and the ticks are muted. That is a weight
   * difference and a mark, never a hue — a coloured axis label would be the
   * status layer leaking into the furniture.
   */
  boundLabel: 'rgb(var(--c-chart-bound-label))',
  /** The soft halo behind the most recent point — the one the reader came for. */
  haloOpacity: 0.16,
  /**
   * THE OPTIMAL BAND HAS NO TOKENS OF ITS OWN ANY MORE (Aug 2026), and their
   * absence is the point.
   *
   * `optimalBand` / `optimalBandOpacity` / `optimalEdge` were a bronze fill, a
   * bronze hatch and a bronze dashed rule — a whole second visual vocabulary
   * for a region that overlaps the reference range, which on screen read as two
   * competing systems making two claims about one result. An optimal range is a
   * NARROWING of in-range, so it is drawn as one: the same green taken a rung
   * deeper (`OPTIMAL_FILL`, opaque like every other band since Aug 2026) over
   * the part of the lab's range that is also optimal, bounded by the same
   * neutral `referenceEdge` every other boundary in this chart uses. Nothing
   * here needs to name it.
   */
  /** Axis rule and ticks. */
  axisLine: 'rgb(var(--c-chart-axis-line))',
  axisText: 'rgb(var(--c-chart-axis-text))',
  gridline: 'rgb(var(--c-chart-gridline))',
  /** Cursor/crosshair on hover. */
  cursor: 'rgb(var(--c-chart-cursor))',
  /** Warm off-white (light) / raised warm near-black (dark) for chart card surfaces — never pure white, never grey. */
  surface: 'rgb(var(--c-chart-surface))',
} as const;

// ---------------------------------------------------------------------------
// WCAG contrast utilities — used by the status colors above (verified at
// authoring time) and available at runtime/in tests to guard future changes.
// ---------------------------------------------------------------------------

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA thresholds: 4.5:1 body text, 3:1 large text / UI components & graphics. */
export const WCAG_AA_TEXT = 4.5;
export const WCAG_AA_LARGE_TEXT = 3;

/**
 * Known contrast facts (computed against brand.cream unless noted), so
 * components don't guess:
 * - espresso on cream: ~8.16:1 — primary body/heading text.
 * - bronze on cream: ~4.18:1 — passes AA for large text/UI (>=3:1) but NOT
 *   small body copy. Use bronze for accents, icons, large headings, focus
 *   rings — pair with espresso for small text.
 * - taupe on cream: ~1.40:1 — borders/dividers/gridlines/disabled only,
 *   never text.
 * - sage/ochre/terracotta on cream: 4.90 / 5.13 / 5.05:1 — all clear AA for
 *   text-sized status labels.
 */

// ---------------------------------------------------------------------------
// Typography — three roles across two superfamilies.
//
// Jost and Inter are retired. What replaced them, and why each:
//
//  · DISPLAY — Fraunces. A warm, high-contrast serif with an optical-size
//    axis, so one family is right at 72px and at 20px. It has weight in the
//    stems, which is the reason it survives dark mode being the default:
//    hairline serifs disappear on a warm near-black.
//  · BODY AND UI — IBM Plex Sans. Chosen over Inter because Inter is the
//    default everything reaches for and Plex has a voice: slightly
//    institutional, unambiguous letterforms, drawn for interfaces where
//    misreading costs something.
//  · NUMERICS — IBM Plex Mono, and ONLY numerics. Same superfamily as the
//    body face, so the two harmonise without being asked to. Lab reference
//    ranges, values in cards and tables, chart axis labels, dates rendered as
//    data, units beside values. It puts a quiet lab-instrument register on the
//    data and lets Fraunces carry all the warmth. It must never leak into
//    prose, buttons or headings.
//
// The one exception to "every number is mono": the single hero value on a
// marker detail page stays Fraunces 600 at opsz 144. It is the emotional
// anchor of that page and should read as a headline, with the mono unit beside
// it at a much smaller size.
//
// Both superfamilies are OFL and self-hosted from this origin, latin subset
// only — see apps/web/public/assets/fonts and the @font-face block in
// apps/web/src/styles/globals.css. There is no Google Fonts request anywhere.
// ---------------------------------------------------------------------------

/**
 * The three families, as complete stacks. The local fallbacks are chosen for
 * metric proximity rather than availability: a serif page falling back to
 * Arial reflows to a different length entirely.
 */
export const fontFamilies = {
  display: `'Fraunces Variable', Fraunces, 'Iowan Old Style', Georgia, 'Times New Roman', serif`,
  body: `'IBM Plex Sans Variable', 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
  mono: `'IBM Plex Mono', ui-monospace, SFMono-Regular, 'Cascadia Mono', Consolas, 'Liberation Mono', monospace`,
} as const;

/**
 * Fraunces' variable axes, fixed as tokens rather than improvised per
 * component.
 *
 *  · `opsz` tracks the RENDERED size, which is the whole reason this face was
 *    picked. 144 for hero and page titles, 72 for section headings and large
 *    values, 24 for anything under 24px.
 *  · `SOFT` at 30 softens the terminals just enough to read warm rather than
 *    surgical.
 *  · `WONK` at 0. Always. The wonky axis is where Fraunces gets whimsical, and
 *    this is a medical results portal. Discipline is the point.
 */
const SOFT = 30;
const WONK = 0;

export const displayAxes = {
  /** Hero and page titles. */
  hero: `'opsz' 144, 'SOFT' ${SOFT}, 'WONK' ${WONK}`,
  /** Section headings and large values. */
  section: `'opsz' 72, 'SOFT' ${SOFT}, 'WONK' ${WONK}`,
  /** Anything set under 24px. */
  small: `'opsz' 24, 'SOFT' ${SOFT}, 'WONK' ${WONK}`,
} as const;

/**
 * ONE type scale. Nine steps, roughly 12 / 14 / 16 / 18 / 21 / 28 / 38 / 52 /
 * 72, with the line height and the tracking defined per STEP rather than per
 * component — which is what stops a heading three screens away from quietly
 * having its own leading.
 *
 * Tracking goes progressively negative as the size climbs (large type set at
 * body tracking reads gappy) and stays at zero or a hair positive at the small
 * end. The one wide-tracked thing in the product is the uppercase eyebrow, and
 * it has a single value of its own below.
 *
 * The names are Tailwind's so the class names read normally; the values are
 * ours. `reading` is the long-form body step — every paragraph a patient
 * actually reads at length is set at it.
 */
export const typeScale = {
  xs: { size: '0.75rem', leading: '1.5', tracking: '0.004em' },
  sm: { size: '0.875rem', leading: '1.55', tracking: '0.002em' },
  base: { size: '1rem', leading: '1.6', tracking: '0em' },
  reading: { size: '1.125rem', leading: '1.65', tracking: '0em' },
  lg: { size: '1.3125rem', leading: '1.45', tracking: '-0.004em' },
  xl: { size: '1.75rem', leading: '1.25', tracking: '-0.01em' },
  '2xl': { size: '2.375rem', leading: '1.14', tracking: '-0.016em' },
  '3xl': { size: '3.25rem', leading: '1.06', tracking: '-0.022em' },
  '4xl': { size: '4.5rem', leading: '1.0', tracking: '-0.028em' },
} as const;

export type TypeStep = keyof typeof typeScale;

/** One value, everywhere. The eyebrows used to carry three different ones. */
export const EYEBROW_TRACKING = '0.14em';

/**
 * The measure. Body copy is capped between 65 and 75 characters a line; 68ch
 * is the middle of that at the reading step.
 */
export const MEASURE = '68ch';

export const typography = {
  display: {
    fontFamily: fontFamilies.display,
    axes: displayAxes,
    role: 'Page titles, section headings, card titles, the at-a-glance numbers, the one hero value',
  },
  eyebrow: {
    fontFamily: fontFamilies.body,
    textTransform: 'uppercase',
    letterSpacing: EYEBROW_TRACKING,
    role: 'Section labels, uppercase headings, the label half of every label/value pair',
  },
  body: {
    fontFamily: fontFamilies.body,
    role: 'Body copy, UI chrome, navigation, buttons, form fields',
  },
  numeric: {
    fontFamily: fontFamilies.mono,
    fontVariantNumeric: 'tabular-nums slashed-zero',
    role: 'Reference ranges, values, chart axis labels, dates as data, units. Numbers only, never prose',
  },
  scale: typeScale,
  measure: MEASURE,
} as const;

/**
 * The families and the axis settings as custom properties, so a component
 * references a token and never a font name. Emitted once on `:root` by
 * tailwind.config.ts, alongside the colour tokens.
 */
export function typographyCssVars(): Record<string, string> {
  return {
    '--font-display': fontFamilies.display,
    '--font-body': fontFamilies.body,
    '--font-mono': fontFamilies.mono,
    '--fvs-display-hero': displayAxes.hero,
    '--fvs-display-section': displayAxes.section,
    '--fvs-display-small': displayAxes.small,
    '--tracking-eyebrow': EYEBROW_TRACKING,
    '--measure': MEASURE,
  };
}
