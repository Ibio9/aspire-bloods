import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import { Tooltip } from './Tooltip';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'primaryOnDark' | 'secondaryOnDark';
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
 * Hover lifts 1px, the shadow spreads and the fill darkens (darkens, not
 * lightens — a lighter fill under white text drops below AA, see primary).
 * Active presses down: scale 0.98, the shadow collapses inward
 * (shadow-btn-active), the top highlight dims. Every shadow value is
 * espresso-derived, never grey.
 *
 * The two *OnDark variants sit outside this recipe on purpose — see below.
 */
const VARIANTS = {
  // The ::before layer carries the top highlight / bottom edge line, so it can be
  // faded out independently on press without disturbing the drop shadow.
  primary: [
    'bg-bronze bg-btn-primary text-white shadow-btn',
    'before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:content-[""]',
    'before:shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.22),inset_0_-1px_0_0_rgb(66_60_54_/_0.18)]',
    // Hover goes DARKER, not lighter. bronze-400 under white label text is
    // 4.06:1 — below the 4.5:1 minimum — so the old lighter hover quietly
    // dropped the primary button out of AA for as long as the pointer was on
    // it. bronze-600 is 6.37:1 (bronze-700, used on press, is 7.32:1) and
    // still reads as a distinct hover because the lift and the shadow spread
    // carry the state change, not the fill alone.
    'hover:bg-bronze-600 hover:shadow-btn-hover motion-safe:hover:-translate-y-px',
    'active:bg-bronze-700 active:shadow-btn-active active:translate-y-0 active:before:opacity-0',
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
  // Frosted pill for dark/hero surfaces (the auth split panel, dark cards) — translucent white
  // over whatever dark tone sits behind it rather than a flat colour, per visual-polish brief.
  // cream text stays >4.5:1 here since the overlay only lightens the dark surface a little.
  //
  // These two deliberately do NOT use the shadow-btn depth recipe above: a
  // warm espresso-derived drop shadow is invisible against an espresso-to-ink
  // panel, and the frosted translucency is what does the lifting instead.
  primaryOnDark:
    'border border-white/20 bg-white/15 text-cream backdrop-blur-md hover:bg-white/25 motion-safe:hover:-translate-y-px active:translate-y-0 active:bg-white/10',
  secondaryOnDark:
    'border border-cream/40 bg-transparent text-cream hover:bg-cream/10 motion-safe:hover:-translate-y-px active:translate-y-0 active:bg-cream/5',
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
      className={`relative inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-6 py-2.5 font-display text-sm tracking-wide transition duration-150 ease-out active:scale-[0.98] active:duration-0 disabled:cursor-not-allowed disabled:opacity-50 ${
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
