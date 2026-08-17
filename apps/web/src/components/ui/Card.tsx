import type { HTMLAttributes } from 'react';
import type { MarkerStatusInput } from '@aspire-bloods/shared';
import { statusTintClass } from '../../lib/markerCopy';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * The card is itself the click target (it's wrapped in a Link, or carries
   * its own handler): pointer cursor, hover lift, warm layered shadow that
   * spreads on hover and collapses on press.
   */
  interactive?: boolean;
  /**
   * The card represents something that genuinely isn't actionable yet — an
   * unreleased report, an unconfigured item. Muted, flat, no hover lift, no
   * pointer cursor. A card that looks clickable and does nothing is worse
   * than one that plainly says it isn't ready.
   */
  inert?: boolean;
  /** Roomier internal padding for the primary content surface on a page. */
  padding?: 'default' | 'roomy' | 'tight' | 'none';
  /**
   * A result's status, applied as a soft background wash instead of the
   * default card surface. Surface only — the border, the text and the shadow
   * are untouched, and the status label and its icon shape inside the card
   * still carry the meaning on their own.
   *
   * Only ever set from a MEASURED marker's status. Genetic risk categories,
   * food sensitivity and microbiome composition have no reference range, so
   * there is no status to tint by and no tint is applied to them.
   *
   * ⚠ AND THE MARKER RESULT CARD NO LONGER PASSES ONE (Aug 2026), which is
   * worth knowing before reading the rest of this file: it was the overwhelming
   * majority of the tinted cards in the product. A wash is the hue mixed INTO
   * the card, so on a near-black surface it is a MUDDIER version of that hue by
   * construction rather than a quieter one, and the above-range cards read as
   * dark olive-brown. The status is carried by the gauge arc, the chevron and
   * the word, which is where the rules always said it lived.
   *
   * The prop stays, the refusal below stays, and every word of the reasoning
   * stays — the counts strip still paints these washes through
   * `statusTintClass`, and a tinted card must still never be a pane. What
   * changed is that almost nothing now asks for one, so `surface` has to be
   * stated explicitly where an opaque card is wanted: the tint was incidentally
   * forcing the marker grid opaque, and glass is the default.
   */
  tint?: MarkerStatusInput;
  /**
   * The card's SURFACE, as opposed to its shape.
   *
   * ── GLASS IS THE DEFAULT NOW (Aug 2026) ──────────────────────────────────
   *
   * It was opt-in, on a list of "page-level structural surfaces" that had to be
   * kept in step by hand — and the result was that most of the product stayed
   * flat while a handful of screens had a material. A list of exceptions
   * maintained across forty call sites is not a rule, it is forty chances to
   * forget. So the surface family IS glass and the exceptions are named:
   *
   *   `card`          opaque. Reached for deliberately, or forced by `tint`.
   *   `glass`         the pane — translucent over a backdrop blur, with a
   *                   specular streak, a lit edge and grain (`.glass-panel`).
   *   `vellum-glass`  the same pane on the warm reading ground, for explanatory
   *                   prose and nothing else.
   *
   * ⚠ AND A TINTED CARD IS NEVER A PANE. A status wash is a clinical statement
   * about the result on that card, and a translucent sheet with a moving
   * highlight over it makes the one surface in the product whose colour means
   * something the least legible of the lot. That is refused below rather than
   * left to a call site to remember — which is also what makes flipping the
   * default safe: on a real report almost every measured card carries a status,
   * so almost every one of them stays opaque without anybody deciding it.
   */
  surface?: 'card' | 'glass' | 'vellum-glass';
}

const PADDING = {
  none: 'p-0',
  tight: 'p-5 sm:p-6',
  default: 'p-7 sm:p-9',
  roomy: 'p-8 sm:p-12',
};

/**
 * A tinted card is never a pane — see the note on `surface`. Written here rather
 * than left to the call sites, because "remember not to combine these two" is
 * not a rule, it is a thing somebody eventually forgets on one screen.
 */
const SURFACE: Record<NonNullable<CardProps['surface']>, string> = {
  card: '',
  glass: 'glass-panel card-glass',
  'vellum-glass': 'glass-panel glass-vellum card-glass',
};

export function Card({ interactive, inert, padding = 'default', tint, surface = 'glass', className = '', ...props }: CardProps) {
  const material = tint ? SURFACE.card : SURFACE[surface];
  return (
    <div
      className={`card ${PADDING[padding]} ${material} ${interactive && !inert ? 'card-interactive' : ''} ${
        inert ? 'card-inert' : ''
      } ${statusTintClass(tint)} ${className}`}
      {...props}
    />
  );
}
