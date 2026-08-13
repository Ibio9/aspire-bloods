import type { ReactNode } from 'react';
import { Wordmark } from '../../components/Wordmark';

interface AuthSplitLayoutProps {
  children: ReactNode;
  eyebrow?: string;
  headline?: string;
  supporting?: string;
  /** Widens the form column for content that genuinely needs it (the multi-section registration
   * form) — the left panel stays identical either way, which is what makes this "the same layout". */
  wide?: boolean;
}

/**
 * The split composition from the Aspire Rota sign-in benchmark: a dark
 * espresso-to-ink gradient panel carrying the wordmark and positioning,
 * form on cream to the right. Warmer and more spacious than the rota's
 * staff-tool version — this is patient-facing, not internal.
 *
 * Login and signup share this exact left panel; only the copy on it and the
 * width of the right-hand form column differ per caller.
 *
 * THE CARD NEVER SCROLLS INTERNALLY, AND THE PAGE NOW MAY (changed Aug 2026).
 *
 * These were one rule and they are two. A scrollbar inside the card is still
 * forbidden — it is the moment someone stops trusting that they have seen the
 * whole form they are about to agree to — but that was being enforced by
 * pinning the whole shell to exactly one viewport at md+, which made every
 * screen's height a hard budget. The registration form paid for it in the only
 * currency it had: field widths and the gaps between them. A first name box
 * that clips "Ibrahi" is a worse failure than a page that scrolls, and it is
 * the same failure the no-scrollbar rule exists to prevent — someone unable to
 * see what they have entered.
 *
 * So the page scrolls when a screen needs more than a viewport, the card grows
 * to its content and never scrolls, and the dark panel STICKS at md+ so it
 * remains the fixed half of the composition rather than sliding away. A screen
 * that fits — every one but registration — is unchanged: `min-h-screen` plus
 * `my-auto` still centres the card in exactly one viewport.
 *
 * --auth-step (see .auth-screen in globals.css) still scales the vertical
 * rhythm with the viewport, so a 720px laptop gets a smaller version of the
 * same composition rather than a cropped one.
 */
export function AuthSplitLayout({ children, eyebrow, headline, supporting, wide }: AuthSplitLayoutProps) {
  return (
    <main className="auth-screen min-h-screen md:flex md:items-start">
      {/* Sticky rather than `h-full`: the composition on this side is fixed and
          should stay put while a long form scrolls past it. */}
      <div className="relative flex min-h-[300px] flex-col overflow-hidden bg-gradient-to-br from-night-soft via-night-soft to-night px-7 py-[calc(var(--auth-step)*2)] text-oncolor sm:px-10 md:sticky md:top-0 md:h-screen md:w-[44%] md:px-14 lg:px-16">
        {/* Barely-there texture, per "the subtle background texture is barely there and better for it" */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
          aria-hidden="true"
        />
        {/* Deep vignette pooling toward the bottom corner — the "atmospheric, low-key, expensive"
            interior feel from the reference, not just a flat dark fill. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(ellipse at 85% 110%, rgba(0,0,0,0.35), transparent 60%)' }}
          aria-hidden="true"
        />

        {/* flex-1 + justify-center: the panel fills the column and the copy
            block sits centred in whatever height is left above the address. */}
        <div className="relative flex flex-1 flex-col justify-center motion-safe:animate-riseIn">
          <Wordmark variant="dark" size="lg" />
          <p className="mt-[calc(var(--auth-step)*1.5)] font-eyebrow text-lg uppercase tracking-eyebrow text-oncolor/70">
            {eyebrow ?? 'Blood test results, done properly'}
          </p>
          {/* Widens with the type so the headline holds two lines rather than
              three once the clamp reaches its ceiling on tall displays. */}
          <h1 className="auth-display mt-[calc(var(--auth-step)*1.25)] max-w-md lg:max-w-lg">
            {headline ?? 'Your results, explained.'}
          </h1>
          <p className="mt-[var(--auth-step)] max-w-xs text-sm leading-relaxed text-oncolor/70">
            {supporting ?? 'Sign in to see your panels, track markers over time, and understand what they mean for you.'}
          </p>
        </div>

        {/* cream/70 not /50: at this small size, anything under ~/65 drops below 4.5:1 body-text AA against espresso, verified */}
        <p className="relative hidden shrink-0 pt-[var(--auth-step)] text-xs leading-relaxed text-oncolor/70 md:block">
          Aspire Clinic
          <br />
          27 Mortimer Street, London
        </p>
      </div>

      {/* The form sits in a card, not loose on the cream: warm off-white, hairline taupe border,
          soft corners, and the heaviest shadow in the system (shadow-float) so it genuinely
          floats rather than sitting flush. Padding stays generous — this is the most-looked-at
          surface in the product — but it scales with the viewport instead of being fixed.

          THE CARD STILL NEVER SCROLLS: no `max-h`, no `overflow`, so it takes the height its
          content needs and the PAGE is what moves when that is more than a viewport.
          `min-h-screen` plus `my-auto` keeps a short screen centred in exactly one viewport,
          which is every screen but registration. */}
      <div className="flex flex-1 justify-center bg-cream px-5 py-[calc(var(--auth-step)*2)] sm:px-8 md:min-h-screen md:px-10 lg:px-16">
        <div
          className={`my-auto flex w-full flex-col rounded-card border border-taupe bg-cream-50 p-[calc(var(--auth-step)*2)] shadow-float motion-safe:animate-riseIn ${
            wide ? 'max-w-4xl' : 'max-w-md'
          }`}
        >
          {children}
        </div>
      </div>
    </main>
  );
}

/**
 * The body of the two long auth screens — registration and invite activation.
 *
 * Two columns at md+ — the introduction on the left, the form on the right —
 * which is the same content at half the height as the stacked version. Below
 * md it stacks. Not one word of copy changed to make this fit.
 *
 * THE FORM COLUMN TAKES THE LARGER SHARE, AND IT GOT LARGER (Aug 2026).
 * 0.8fr / 1.2fr split a max-w-4xl card so that a three-across name row landed
 * at about 150px a field, which clips an ordinary first name. The introduction
 * is four short lines and a link and reads perfectly well narrower; the form
 * is the thing being filled in. 0.68fr / 1.32fr, and the name row is two
 * across rather than three (see RegistrationForm).
 */
export function AuthWideBody({ intro, children }: { intro: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-[calc(var(--auth-step)*2.2)] gap-y-[calc(var(--auth-step)*1.4)] md:grid-cols-[minmax(0,0.68fr)_minmax(0,1.32fr)]">
      {/* The cross-link sits at the foot of this column (it uses mt-auto via
          its own top border), so the two columns end level. */}
      <div className="flex flex-col">{intro}</div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}
