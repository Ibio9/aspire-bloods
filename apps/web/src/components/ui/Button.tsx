import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import { Tooltip } from './Tooltip';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  loading?: boolean;
  /** Shown in a tooltip (and read by screen readers) when disabled — a greyed-out button with no
   * explanation is a dead end, not a state. */
  disabledReason?: string;
}

/**
 * Depth recipe, applied consistently across the filled variants:
 *  - a gradient overlay on the fill, lighter at the top, so it reads as lit
 *    from above rather than as a flat swatch (bg-btn-* background images
 *    sit over the solid colour);
 *  - a soft inner highlight along the top edge and a barely-there darker
 *    line at the bottom, both inset shadows, both derived from the palette;
 *  - a layered drop shadow — one tight, one wide (shadow-btn).
 *
 * Hover lifts 1px, the shadow spreads and the fill lightens. Active presses
 * down: scale 0.98, the shadow collapses inward (shadow-btn-active), the
 * top highlight dims. Every shadow value is espresso-derived, never grey.
 */
const VARIANTS = {
  // The ::before layer carries the top highlight / bottom edge line, so it can be
  // faded out independently on press without disturbing the drop shadow.
  primary: [
    'bg-bronze bg-btn-primary text-white shadow-btn',
    'before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:content-[""]',
    'before:shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.22),inset_0_-1px_0_0_rgb(66_60_54_/_0.18)]',
    'hover:bg-bronze-400 hover:shadow-btn-hover motion-safe:hover:-translate-y-px',
    'active:bg-bronze-600 active:shadow-btn-active active:translate-y-0 active:before:opacity-0',
  ].join(' '),
  secondary: [
    'bg-white bg-btn-secondary text-espresso border border-taupe shadow-btn',
    'before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:content-[""]',
    'before:shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.7)]',
    'hover:border-bronze hover:shadow-btn-hover motion-safe:hover:-translate-y-px',
    'active:bg-cream-200 active:shadow-btn-active active:translate-y-0 active:before:opacity-0',
  ].join(' '),
  ghost: 'bg-transparent text-espresso hover:bg-cream-200 active:bg-cream-300 active:shadow-btn-active',
  destructive: [
    'bg-white text-status-significantHigh border border-status-significantHigh shadow-btn',
    'hover:bg-status-significantHigh hover:text-white hover:shadow-btn-hover motion-safe:hover:-translate-y-px',
    'active:shadow-btn-active active:translate-y-0',
  ].join(' '),
};

function Spinner() {
  return (
    <svg className="h-4 w-4 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Pill-shaped, matching the brand benchmark's soft geometry — the rounding is deliberate, not a default.
 *
 * Press feedback is instant going down and eased coming back up: `active:duration-0` overrides the base
 * transition the moment `:active` applies, so the scale/shadow lands with zero delay; releasing removes
 * that variant and falls back to the base `duration-150`, easing back out. That asymmetry is what makes
 * it read as a physical press rather than a laggy toggle.
 *
 * Loading state keeps the button's footprint fixed: the label stays mounted (just `invisible`, so it
 * still occupies layout) and the spinner overlays it absolutely — nothing measures or swaps text, so
 * there's nothing to cause a width jump.
 */
export function Button({
  variant = 'primary',
  loading,
  disabled,
  disabledReason,
  className = '',
  children,
  onClick,
  type = 'button',
  ...props
}: ButtonProps) {
  const explainDisabled = !!disabled && !loading && !!disabledReason;

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (explainDisabled) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  }

  const button = (
    <button
      type={type}
      className={`relative inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition duration-150 ease-out active:scale-[0.98] active:duration-0 disabled:cursor-not-allowed disabled:opacity-50 ${
        explainDisabled ? 'cursor-not-allowed opacity-50' : ''
      } ${VARIANTS[variant]} ${className}`}
      disabled={explainDisabled ? undefined : disabled || loading}
      aria-disabled={explainDisabled ? true : undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...props}
    >
      {/* opacity-0, not invisible — visibility:hidden strips the accessible name from the button
          while loading, so a screen reader announces nothing at the moment it matters most.
          opacity-0 keeps the label in the accessibility tree while still hiding it visually. */}
      <span className={loading ? 'opacity-0' : 'contents'}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Spinner />
        </span>
      )}
    </button>
  );

  if (explainDisabled) {
    return <Tooltip label={disabledReason}>{button}</Tooltip>;
  }

  return button;
}
