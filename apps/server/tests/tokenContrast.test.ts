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

  it('emits every role of every hue, orange included', () => {
    // Orange is never a status, so it has no `--c-tint-*` alias and would be
    // silently missing if the emitter only walked the five states. It is the
    // transition stop in the range bar's gradient and in the shoulder of a
    // chart band; without it those gradients fall back to a hard yellow-to-red
    // step with nothing between them.
    for (const hue of ['green', 'yellow', 'orange', 'red']) {
      for (const role of ['wash', 'band', 'track', 'edge', 'mark']) {
        expect(themeTokens[mode][`--c-hue-${hue}-${role}`], `--c-hue-${hue}-${role}`).toBeTruthy();
      }
    }
  });

  it('gives every status a wash, bar, band, edge and mark', () => {
    for (const key of Object.keys(status) as StatusKey[]) {
      for (const suffix of ['', '-bar', '-band', '-edge', '-mark']) {
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
    for (const role of ['wash', 'band', 'track'] as const) {
      const seen = new Map<string, string>();
      for (const hue of ['green', 'yellow', 'red']) {
        const v = tone(mode, `--c-hue-${hue}-${role}`);
        expect(seen.has(v), `${hue} ${role} duplicates ${seen.get(v)}`).toBe(false);
        seen.set(v, hue);
      }
    }
  });

  it('keeps a plotted point readable against the band it lands on', () => {
    // A point takes its own state's colour and sits on a band of that same
    // colour. If the two matched, the mark would vanish into the band and the
    // chart would lose the shape layer that carries the status.
    for (const hue of ['green', 'yellow', 'orange', 'red']) {
      const ratio = contrastRatio(tone(mode, `--c-hue-${hue}-mark`), tone(mode, `--c-hue-${hue}-band`));
      expect(ratio, `${hue} mark on its own band is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        WCAG_AA_LARGE_TEXT,
      );
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
