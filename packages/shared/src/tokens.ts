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
// Status triad — cannot be mathematically derived from a palette with no
// green/amber/red hues, so these are hand-picked to sit at the same tonal
// weight (desaturated, mid-dark) as bronze/espresso. Verified AA below.
// Bronze is the brand accent and is never reused as a status color.
//
// These are the TEXT/ICON colors and they are unchanged. The surface wash that
// now sits behind a result (see `statusTint`) is a separate token family —
// the tint is allowed to read as green/orange/red; the label beside it is not.
// ---------------------------------------------------------------------------

export const status = {
  inRange: {
    label: 'In range',
    hex: '#5B604A', // muted sage — calm, recessive
    icon: 'dash', // level/dash mark
    /** Runtime color, theme-aware. Use this anywhere the value is applied to a live element. */
    cssVar: 'var(--c-status-in-range)',
  },
  high: {
    label: 'Above range',
    hex: '#765429', // ochre / amber-clay
    icon: 'chevron-up',
    cssVar: 'var(--c-status-high)',
  },
  low: {
    label: 'Below range',
    hex: '#765429', // same tone as `high`; direction is carried by icon, not color
    icon: 'chevron-down',
    cssVar: 'var(--c-status-low)',
  },
  significantHigh: {
    label: 'Significantly above range',
    hex: '#8A4A3A', // deep terracotta-red
    icon: 'chevron-double-up',
    cssVar: 'var(--c-status-significant-high)',
  },
  significantLow: {
    label: 'Significantly below range',
    hex: '#8A4A3A',
    icon: 'chevron-double-down',
    cssVar: 'var(--c-status-significant-low)',
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
// So: five tints, applied as a soft background on a result card or row.
//
//   significantLow  → red      significantHigh → red
//   low             → orange   high            → orange
//   inRange         → green
//
// Four rules hold, and the tint is worthless without them:
//
//  1. The tint is the LAST thing that carries status, never the first. The
//     level mark / chevron / doubled chevron and the word ("Above range")
//     are unchanged and still carry the whole meaning in greyscale and to a
//     colourblind reader. Delete every colour on the page and nothing is lost.
//  2. Tint only. Text, borders, headings and icons keep the existing palette;
//     a tinted card does not get red text or a red border.
//  3. Low-saturation and warm-leaning. These hues are picked to sit on cream
//     and on the dark warm-brown surfaces without either one turning into a
//     web-red alert box. The page still has to read as the same premium warm
//     product it was before.
//  4. Nothing escalates beyond the tint. No pulse, no warning triangle, no
//     red body copy. Someone reading a bad number is not to be frightened by
//     the interface; the out-of-range prompt points calmly at their GP.
//
// The tint bases are deliberately NOT the status text hues above. Those are
// chosen to be recessive next to their own label, and washed out to 12% they
// stop reading as green/orange/red at all — which would give us the cost of
// colour-coding with none of the benefit. These carry a little more chroma so
// that a 12% wash is still identifiably the colour it is meant to be.
// ---------------------------------------------------------------------------

const tintBase = {
  /** Warm sage-green. Olive-leaning, never a saturated web green. */
  green: '#6E7F4A',
  /** Warm clay-orange, the same family as the ochre `high` text tone. */
  orange: '#B5763A',
  /** Warm terracotta-red, the same family as the `significant*` text tone. */
  red: '#A8503C',
} as const;

const STATUS_TINT_HUE: Record<StatusKey, keyof typeof tintBase> = {
  significantLow: 'red',
  low: 'orange',
  inRange: 'green',
  high: 'orange',
  significantHigh: 'red',
};

/**
 * How much of the hue survives the wash.
 *
 * `surface` is the card/row background — deliberately faint, because it sits
 * under body text that has to stay comfortably readable on top of it.
 * `bar` is the category summary bar, which is a field of colour with no text
 * on it and would simply disappear at surface strength.
 */
const TINT_MIX = { surface: 0.12, surfaceDark: 0.2, bar: 0.55, barDark: 0.62 } as const;

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

/** The darkest warm tone in the system: espresso taken most of the way to black, never past it. */
const nightBase = mix(brand.espresso, '#000000', 0.6);
/** The lift direction for dark surfaces — toward a warm mid-brown, never toward grey. */
const nightLift = mix(brand.espresso, brand.taupe, 0.55);

/** Surface family in dark: lower step = more raised. */
function buildDarkSurfaceScale(base: string): Record<number, string> {
  const steps: Record<number, number> = {
    50: 0.07, 100: 0.1, 200: 0.16, 300: 0.24, 400: 0.34,
    500: 0, 600: -0.18, 700: -0.34, 800: -0.5, 900: -0.66,
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
 */
const darkWhite = mix(darkPage, '#000000', 0.35);

function darkStatusHex(hex: string): string {
  // Toward the dark theme's text tone, so a status label sits at roughly the
  // same weight as body copy rather than shouting or vanishing.
  return mix(hex, darkText, 0.52);
}

/** Every colour token, per theme, as a flat map of CSS custom property → hex. */
function buildThemeTokens(mode: 'light' | 'dark'): Record<string, string> {
  const dark = mode === 'dark';
  const s = dark ? darkScales : scales;
  const surface = dark ? darkScales.cream[500] : brand.cream;
  const tintSurfaceMix = dark ? TINT_MIX.surfaceDark : TINT_MIX.surface;
  const tintBarMix = dark ? TINT_MIX.barDark : TINT_MIX.bar;
  // A tint washes toward the surface it sits on: the card in light mode, the
  // card in dark mode too — both are `cream-50`, which is what a tinted card
  // actually replaces.
  const tintTowards = dark ? darkScales.cream[50] : scales.cream[50];

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

  for (const key of Object.keys(status) as StatusKey[]) {
    const base = status[key].hex;
    out[`--c-status-${kebab(key)}`] = dark ? darkStatusHex(base) : base;
    const hue = tintBase[STATUS_TINT_HUE[key]];
    out[`--c-tint-${kebab(key)}`] = mix(tintTowards, hue, tintSurfaceMix);
    out[`--c-tint-${kebab(key)}-bar`] = mix(tintTowards, hue, tintBarMix);
  }

  // Charts. Same rule as the light-mode note below: status is carried by shape
  // and by the text label, never by hue, so none of these is a status colour.
  out['--c-chart-line'] = dark ? darkScales.bronze[600] : brand.bronze;
  out['--c-chart-point'] = dark ? darkScales.bronze[600] : brand.bronze;
  out['--c-chart-point-ring'] = dark ? darkScales.cream[50] : brand.white;
  out['--c-chart-point-out'] = dark ? darkScales.bronze[800] : scales.bronze[800];
  out['--c-chart-point-far-out'] = dark ? brand.cream : ink;
  out['--c-chart-reference-band'] = dark ? darkScales.taupe[600] : brand.taupe;
  out['--c-chart-reference-edge'] = dark ? darkScales.taupe[800] : scales.taupe[600];
  out['--c-chart-optimal-band'] = dark ? darkScales.bronze[400] : scales.bronze[300];
  out['--c-chart-optimal-edge'] = dark ? darkScales.bronze[700] : scales.bronze[600];
  out['--c-chart-axis-line'] = dark ? darkScales.taupe[600] : brand.taupe;
  out['--c-chart-axis-text'] = dark ? darkScales.espresso[400] : scales.espresso[400];
  out['--c-chart-gridline'] = dark ? darkScales.taupe[300] : scales.taupe[200];
  out['--c-chart-cursor'] = dark ? darkScales.taupe[700] : scales.taupe[600];
  out['--c-chart-surface'] = dark ? darkScales.cream[50] : mix(brand.white, brand.cream, 0.35);

  // Shadow colour. Light: espresso, so depth stays warm rather than grey.
  // Dark: true black, because a warm shadow on a warm dark surface is not a
  // shadow, it is a smudge — the depth has to come from darkness alone.
  out['--c-shadow'] = dark ? '#000000' : brand.espresso;

  return out;
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export const themeTokens = {
  light: buildThemeTokens('light'),
  dark: buildThemeTokens('dark'),
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

/** Status tint utilities, by status key. Values are theme-aware CSS variables. */
export const statusTint = {
  inRange: { surface: 'var(--c-tint-in-range)', bar: 'var(--c-tint-in-range-bar)' },
  high: { surface: 'var(--c-tint-high)', bar: 'var(--c-tint-high-bar)' },
  low: { surface: 'var(--c-tint-low)', bar: 'var(--c-tint-low-bar)' },
  significantHigh: { surface: 'var(--c-tint-significant-high)', bar: 'var(--c-tint-significant-high-bar)' },
  significantLow: { surface: 'var(--c-tint-significant-low)', bar: 'var(--c-tint-significant-low-bar)' },
} as const;

// ---------------------------------------------------------------------------
// Charts — palette only, no exceptions.
//
// The status triad above is deliberately NOT used in charts. Its sage/ochre/
// terracotta hues are hand-picked outside the four brand hues, which is
// defensible for a small inline badge sitting next to its own text label but
// reads as an off-palette green/amber/red the moment it's a field of colour in
// a plot. So everything a chart draws — reference band, optimal band, axes,
// gridlines, point fills, hover — derives from bronze/espresso/cream/taupe,
// their tints and shades, plus `ink` for the deepest warm near-black.
//
// Status in a chart is therefore carried by SHAPE and by the text label in the
// tooltip and legend, never by hue. That is the same rule the rest of the
// product follows (status badges lead with an icon shape and a word); charts
// were the one place still leaning on colour to say it.
// ---------------------------------------------------------------------------

// Every value here is a CSS custom property rather than a literal hex, so a
// chart follows the light/dark theme without any component needing to know
// which one is active — SVG `fill`/`stroke` resolve custom properties the same
// way any other CSS colour does. The concrete hexes per theme live in
// `themeTokens` above; only the opacities are literal, because they are the
// same in both.
export const chart = {
  /** The trend line itself, and the fill of an in-range point. */
  line: 'var(--c-chart-line)',
  point: 'var(--c-chart-point)',
  /** Ring around every point so it stays legible against a band. */
  pointRing: 'var(--c-chart-point-ring)',
  /** An out-of-range point. Higher contrast, so the emphasis survives greyscale — the shape still carries which direction. */
  pointOut: 'var(--c-chart-point-out)',
  /** A significantly out-of-range point: the most extreme warm tone available in the active theme. */
  pointFarOut: 'var(--c-chart-point-far-out)',
  /** The lab reference range: a calm background region, not a block. */
  referenceBand: 'var(--c-chart-reference-band)',
  referenceBandOpacity: 0.22,
  /** Hairline top/bottom edge on the reference band, so it reads as bounded without weight. */
  referenceEdge: 'var(--c-chart-reference-edge)',
  /** The optimal band, drawn inside/overlapping the reference band. Distinguished by a hatch, not by hue alone. */
  optimalBand: 'var(--c-chart-optimal-band)',
  optimalBandOpacity: 0.34,
  optimalEdge: 'var(--c-chart-optimal-edge)',
  /** Axis rule and ticks. */
  axisLine: 'var(--c-chart-axis-line)',
  axisText: 'var(--c-chart-axis-text)',
  gridline: 'var(--c-chart-gridline)',
  /** Cursor/crosshair on hover. */
  cursor: 'var(--c-chart-cursor)',
  /** Warm off-white (light) / raised warm near-black (dark) for chart card surfaces — never pure white, never grey. */
  surface: 'var(--c-chart-surface)',
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
// Typography — a geometric humanist sans for display (matching the Aspire
// Clinic site's heading register — Poppins/Jost-like, not a serif) paired
// with Inter for body and numerics (see visual-polish brief).
// ---------------------------------------------------------------------------

export const typography = {
  display: {
    fontFamily: '"Jost", sans-serif',
    role: 'H1-H2, wordmark, hero numerals, two-tier headline (paired with eyebrow)',
  },
  eyebrow: {
    fontFamily: '"Inter", sans-serif', // stands in for Coolvetica Book
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    role: 'Section labels, uppercase headings, second tier of headline pattern',
  },
  body: {
    fontFamily: '"Inter", sans-serif', // stands in for Gill Sans Nova Book
    role: 'Body copy, UI chrome, all numerics',
  },
  numeric: {
    fontFamily: '"Inter", sans-serif',
    fontVariantNumeric: 'tabular-nums',
    role: 'Marker values, reference ranges, axis labels — always tabular for column alignment',
  },
} as const;
