import type { HTMLAttributes } from 'react';
import type { MarkerStatusInput } from '@aspire-bloods/shared';
import { statusOutlineClass } from '../../lib/markerCopy';

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
   * A result's status, applied as a coloured OUTLINE. The card's surface is
   * untouched by it, and so are the text and the shadow; the status label and
   * its icon shape inside the card still carry the meaning on their own.
   *
   * Only ever set from a MEASURED marker's status. Genetic risk categories,
   * food sensitivity and microbiome composition have no reference range, so
   * there is no status to outline by and none is applied to them.
   *
   * ⚠ IT IS AN OUTLINE RATHER THAN A GROUND SINCE Aug 2026, AND THAT ENDED A
   * SEQUENCE RATHER THAN CONTINUING IT. This was a translucent wash, then an
   * opaque plate, then the plate deepened three times. Every round improved the
   * colour and none of them touched what was wrong: a grid of 165 cards, each a
   * large field of green or gold or red, is a page shouting a summary at
   * somebody who came to read one result. The body is neutral glass now,
   * identical whatever the status, and the border carries it.
   *
   * `statusOutlineClass` emits the WIDTH and the COLOUR, and neither is useful
   * alone. The width is one number for every surface that takes an outline, so
   * the cards and the at-a-glance strip read as one system rather than as two
   * things that happen to be outlined.
   *
   * ⚠ AND THE SURFACE REFUSAL IS GONE WITH THE GROUND IT PROTECTED. "A tinted
   * card is never a pane" was about a translucent sheet with a moving highlight
   * over a coloured FIELD, where the material and the meaning fight for the same
   * pixels. An outlined card has no field, so `tint` no longer forces the opaque
   * surface and a marker card is glass like everything else.
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
   * ⚠ A TINTED CARD USED TO BE REFUSED THE PANE MATERIAL, AND IS NOT ANY MORE.
   * The refusal was about a status WASH: a translucent sheet with a moving
   * highlight over a coloured field makes the one surface whose colour means
   * something the least legible of the lot. Status is an outline now, so there
   * is no field to fight the material and the two are orthogonal. The two CHART
   * cards are still opaque and still for the measured reason on `GLASS.panel`.
   */
  surface?: 'card' | 'glass' | 'vellum-glass';
}

/**
 * ── MORE GENEROUS (Aug 2026) ────────────────────────────────────────────
 *
 * One step up across the board. The direction is a spacious light theme with
 * large soft forms, and THE RADIUS AND THE PADDING ARE ONE DECISION: a 1.5rem
 * corner on a card padded at 1.75rem reads as a rounded box, because the corner
 * eats most of the gap between the edge and the first line of type. Widening the
 * corner without widening the padding is what makes a card look inflated rather
 * than considered.
 */
const PADDING = {
  none: 'p-0',
  tight: 'p-6 sm:p-7',
  default: 'p-8 sm:p-10',
  roomy: 'p-9 sm:p-14',
};

/** The three materials. A status outline composes with any of them. */
const SURFACE: Record<NonNullable<CardProps['surface']>, string> = {
  card: '',
  glass: 'glass-panel card-glass',
  'vellum-glass': 'glass-panel glass-vellum card-glass',
};

export function Card({ interactive, inert, padding = 'default', tint, surface = 'glass', className = '', ...props }: CardProps) {
  return (
    <div
      className={`card ${PADDING[padding]} ${SURFACE[surface]} ${interactive && !inert ? 'card-interactive' : ''} ${
        inert ? 'card-inert' : ''
      } ${statusOutlineClass(tint)} ${className}`}
      {...props}
    />
  );
}
