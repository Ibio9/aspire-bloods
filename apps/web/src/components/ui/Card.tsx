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
   */
  tint?: MarkerStatusInput;
  /**
   * The card's SURFACE, as opposed to its shape.
   *
   * `card` is the opaque cream one every result card takes. `glass` is the
   * page-level pane — translucent over a backdrop blur, with a specular streak,
   * a lit edge and grain (see `.glass-panel` in globals.css). `vellum-glass` is
   * the same pane on the warm reading ground, and is for explanatory prose and
   * nothing else.
   *
   * ⚠ NOT ON A TINTED CARD. A status wash is a clinical statement about the
   * result on that card, and a translucent sheet with a moving highlight over it
   * makes the one surface in the product whose colour means something the least
   * legible of the lot. The two are refused together below rather than left to a
   * call site to remember.
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

export function Card({ interactive, inert, padding = 'default', tint, surface = 'card', className = '', ...props }: CardProps) {
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
