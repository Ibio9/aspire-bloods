import type { HTMLAttributes } from 'react';

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
  padding?: 'default' | 'roomy' | 'tight';
}

const PADDING = {
  tight: 'p-5 sm:p-6',
  default: 'p-7 sm:p-9',
  roomy: 'p-8 sm:p-12',
};

export function Card({ interactive, inert, padding = 'default', className = '', ...props }: CardProps) {
  return (
    <div
      className={`card ${PADDING[padding]} ${interactive && !inert ? 'card-interactive' : ''} ${
        inert ? 'card-inert' : ''
      } ${className}`}
      {...props}
    />
  );
}
