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
}

const PADDING = {
  none: 'p-0',
  tight: 'p-5 sm:p-6',
  default: 'p-7 sm:p-9',
  roomy: 'p-8 sm:p-12',
};

export function Card({ interactive, inert, padding = 'default', tint, className = '', ...props }: CardProps) {
  return (
    <div
      className={`card ${PADDING[padding]} ${interactive && !inert ? 'card-interactive' : ''} ${
        inert ? 'card-inert' : ''
      } ${statusTintClass(tint)} ${className}`}
      {...props}
    />
  );
}
