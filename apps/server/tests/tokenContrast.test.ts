import { describe, it, expect } from 'vitest';
import {
  themeTokens,
  contrastRatio,
  WCAG_AA_TEXT,
  WCAG_AA_LARGE_TEXT,
  status,
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

function tone(mode: (typeof MODES)[number], name: string): string {
  const hex = themeTokens[mode][name];
  if (!hex) throw new Error(`no such token: ${name} (${mode})`);
  return hex;
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
    const orange = tone(mode, '--c-tint-high-bar');
    const red = tone(mode, '--c-tint-significant-high-bar');
    for (const [a, b, names] of [
      [green, orange, 'in range vs high'],
      [orange, red, 'high vs significantly out'],
      [green, red, 'in range vs significantly out'],
    ] as const) {
      expect(a, names).not.toBe(b);
    }
  });
});

/** Composite `hex` at `alpha` over `bg` — what an opacity modifier actually renders as. */
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
