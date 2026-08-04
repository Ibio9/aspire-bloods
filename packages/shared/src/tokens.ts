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

// ---------------------------------------------------------------------------
// Status triad — cannot be mathematically derived from a palette with no
// green/amber/red hues, so these are hand-picked to sit at the same tonal
// weight (desaturated, mid-dark) as bronze/espresso. Verified AA below.
// Bronze is the brand accent and is never reused as a status color.
// ---------------------------------------------------------------------------

export const status = {
  inRange: {
    label: 'In range',
    hex: '#5B604A', // muted sage — calm, recessive
    icon: 'dash', // level/dash mark
  },
  high: {
    label: 'Above range',
    hex: '#765429', // ochre / amber-clay
    icon: 'chevron-up',
  },
  low: {
    label: 'Below range',
    hex: '#765429', // same tone as `high`; direction is carried by icon, not color
    icon: 'chevron-down',
  },
  significantHigh: {
    label: 'Significantly above range',
    hex: '#8A4A3A', // deep terracotta-red
    icon: 'chevron-double-up',
  },
  significantLow: {
    label: 'Significantly below range',
    hex: '#8A4A3A',
    icon: 'chevron-double-down',
  },
} as const;

export type StatusKey = keyof typeof status;

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
// Typography — brand faces are not web fonts; these are the documented
// substitutes (see brief §1).
// ---------------------------------------------------------------------------

export const typography = {
  display: {
    fontFamily: '"Cormorant Garamond", serif', // stands in for Opus Normal
    role: 'H1-H2, hero numerals, two-tier headline (paired with eyebrow)',
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
