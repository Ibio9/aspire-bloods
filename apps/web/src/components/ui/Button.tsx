import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import { Tooltip } from './Tooltip';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'glass' | 'ghost' | 'destructive' | 'primaryOnDark' | 'secondaryOnDark';
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
    'bg-bronze bg-btn-primary text-onaccent shadow-btn',
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
  // ── A SECONDARY BUTTON IS A GLASS CHIP (Aug 2026) ──────────────────────
  //
  // It was `bg-white bg-btn-secondary` — an opaque near-white pill with a
  // painted gradient on it. That read as a surface on the old cream page
  // because the ground sat several steps below it; on the white page it is a
  // white rectangle on a white field, and the only thing left saying it is an
  // object is its hairline.
  //
  // `.glass-control` is the panes' own material at a control's alpha, with the
  // specular that used to be painted on now made of light. It keeps the
  // hairline and the depth recipe: a button is an object you press, and the
  // shadow is what says so.
  secondary: [
    'glass-control text-espresso border border-taupe shadow-btn',
    'hover:border-bronze hover:shadow-btn-hover motion-safe:hover:-translate-y-px',
    'active:shadow-btn-active active:translate-y-0',
  ].join(' '),
  // ⚠ `glass` AND `secondary` ARE ONE MATERIAL NOW, and the difference that
  // justified two is gone. `glass` existed because `secondary` was a near-white
  // gradient that painted straight over the ambient light, which was fine on a
  // card and wrong on the page itself; both are translucent today, so the split
  // would be two names for one thing waiting to drift. Kept as a name because
  // several call sites say it and it says what they mean.
  glass: [
    'glass-control text-espresso border border-taupe shadow-btn',
    'hover:border-bronze hover:shadow-btn-hover motion-safe:hover:-translate-y-px',
    'active:shadow-btn-active active:translate-y-0',
  ].join(' '),
  // The quiet chip: half the fill, no hairline, no drop shadow. It is the
  // variant for one row's action — the Withdraw button beside each consent, a
  // dismiss beside a heading — where a bordered chip on every row would make
  // the loudest thing in the card the way to undo it. It is still a chip
  // rather than a bare word, which is the change: `bg-transparent` gave a
  // control nothing at all to sit on.
  ghost: [
    'glass-control-quiet text-espresso',
    'hover:border-bronze hover:shadow-btn motion-safe:hover:-translate-y-px',
    'border border-transparent active:shadow-btn-active active:translate-y-0',
  ].join(' '),
  // The same chip, with the status hue on the label and the hairline. It is a
  // CONTROL rather than a card, which is the named exception to "no coloured
  // outlines" — that border is the whole of its non-text state at rest.
  destructive: [
    'glass-control text-status-significantHigh border border-status-significantHigh shadow-btn',
    'hover:bg-status-significantHigh hover:text-onaccent hover:shadow-btn-hover motion-safe:hover:-translate-y-px',
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
    'border border-oncolor/20 bg-oncolor/15 text-oncolor backdrop-blur-md hover:bg-oncolor/25 motion-safe:hover:-translate-y-px active:translate-y-0 active:bg-oncolor/10',
  secondaryOnDark:
    'border border-oncolor/40 bg-transparent text-oncolor hover:bg-oncolor/10 motion-safe:hover:-translate-y-px active:translate-y-0 active:bg-oncolor/5',
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
 * The label is IBM Plex Sans, not the display face. Buttons are UI chrome —
 * see the typography note in tokens.ts: Fraunces is for page titles, section
 * headings, card titles and the big numbers, and a serif on a pill-shaped
 * control at 14px reads as a link that has been made to look like a button.
 * Medium weight rather than regular, because a pill needs its label to hold
 * the middle of it.
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
      className={`relative inline-flex min-h-tap items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium tracking-wide transition duration-150 ease-out active:scale-[0.98] active:duration-0 disabled:cursor-not-allowed disabled:opacity-50 ${
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
