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
      ? 'bg-bronze bg-btn-primary text-white shadow-btn hover:bg-bronze-400 hover:shadow-btn-hover motion-safe:hover:-translate-y-px'
      : 'bg-white bg-btn-secondary text-espresso border border-taupe shadow-btn hover:border-bronze hover:shadow-btn-hover motion-safe:hover:-translate-y-px';

  return (
    <Link
      to={to}
      className={`relative inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition duration-150 ease-out active:scale-[0.98] active:duration-0 ${skin} ${className}`}
    >
      {children}
    </Link>
  );
}
