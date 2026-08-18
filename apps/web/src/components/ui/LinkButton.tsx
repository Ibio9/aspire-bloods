import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * A router Link wearing the Button's secondary skin.
 *
 * Navigation and action look identical in this product, but they must not
 * *be* identical: anything that changes the URL stays an anchor so
 * middle-click, cmd-click, "open in new tab" and the status-bar URL preview
 * all keep working. Recovery screens lean on this — every one of them offers
 * a real link out, not a button that calls navigate().
 */
export function LinkButton({
  to,
  children,
  variant = 'secondary',
  className = '',
}: {
  to: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  const skin =
    variant === 'primary'
      ? // Hover darkens rather than lightens, matching Button: bronze-400 under
        // white label text is 4.06:1, below the 4.5:1 minimum, so the old
        // lighter hover dropped this out of AA for as long as the pointer was
        // on it. bronze-600 is 6.37:1 and the lift carries the state anyway.
        'bg-bronze bg-btn-primary text-onaccent shadow-btn hover:bg-bronze-600 hover:shadow-btn-hover motion-safe:hover:-translate-y-px'
      : // ⚠ THE SAME CHIP AS `Button.secondary`, and it has to be. This wears
        // that button's skin by design, so the two sit side by side on every
        // recovery screen — one opaque and one frosted would read as two kinds
        // of control for what a reader cannot tell apart. See `.glass-control`.
        'glass-control text-espresso border border-taupe shadow-btn hover:border-bronze hover:shadow-btn-hover motion-safe:hover:-translate-y-px';

  return (
    <Link
      to={to}
      className={`relative inline-flex min-h-tap items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition duration-150 ease-out active:scale-[0.98] active:duration-0 ${skin} ${className}`}
    >
      {children}
    </Link>
  );
}
