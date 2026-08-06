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
 * Viewport-fit at md+: the shell is exactly h-screen and the page never
 * scrolls. Both panels fill that height and centre their own content, and
 * the vertical scale (--auth-step, see .auth-screen in globals.css) shrinks
 * with the viewport so a 720px-tall laptop gets a smaller version of the
 * same composition rather than a cropped one.
 *
 * Below md the split collapses to a single naturally-scrolling column —
 * pinning a phone to 100vh breaks the moment the on-screen keyboard opens
 * and steals half the viewport, so overflow is only ever locked at md+.
 */
export function AuthSplitLayout({ children, eyebrow, headline, supporting, wide }: AuthSplitLayoutProps) {
  return (
    <main className="auth-screen min-h-screen md:flex md:h-screen md:min-h-0 md:overflow-hidden">
      <div className="relative flex min-h-[300px] flex-col overflow-hidden bg-gradient-to-br from-espresso via-espresso to-ink px-7 py-[calc(var(--auth-step)*2)] text-cream sm:px-10 md:h-full md:min-h-0 md:w-[44%] md:px-14 lg:px-16">
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
          <p className="mt-[calc(var(--auth-step)*1.5)] font-eyebrow text-xs uppercase tracking-eyebrow text-taupe">
            {eyebrow ?? 'Blood test results, done properly'}
          </p>
          {/* Widens with the type so the headline holds two lines rather than
              three once the clamp reaches its ceiling on tall displays. */}
          <h1 className="auth-display mt-[calc(var(--auth-step)*1.25)] max-w-md lg:max-w-lg">
            {headline ?? 'Your results, explained.'}
          </h1>
          <p className="mt-[var(--auth-step)] max-w-xs text-sm leading-relaxed text-cream/70">
            {supporting ?? 'Sign in to see your panels, track markers over time, and understand what they mean for you.'}
          </p>
        </div>

        {/* cream/70 not /50: at this small size, anything under ~/65 drops below 4.5:1 body-text AA against espresso, verified */}
        <p className="relative hidden shrink-0 pt-[var(--auth-step)] text-xs leading-relaxed text-cream/70 md:block">
          Aspire Clinic, part of the Aspire Group of Companies
          <br />
          27 Mortimer Street, London
        </p>
      </div>

      {/* The form sits in a card, not loose on the cream: warm off-white, hairline taupe border,
          soft corners, and the heaviest shadow in the system (shadow-float) so it genuinely
          floats rather than sitting flush. Padding stays generous — this is the most-looked-at
          surface in the product — but it now scales with the viewport instead of being fixed.

          The column, not the page, is what scrolls if content ever outgrows the screen (the
          registration form does at laptop heights). my-auto rather than items-center is
          deliberate: auto margins collapse to zero once free space goes negative, so an
          overflowing card stays scrollable from its top edge — centring with items-center
          would push the top of it out of reach. */}
      <div className="scroll-thin flex flex-1 justify-center bg-cream px-5 py-[calc(var(--auth-step)*2)] sm:px-8 md:h-full md:min-h-0 md:overflow-y-auto md:px-10 lg:px-16">
        <div
          className={`my-auto w-full rounded-card border border-taupe bg-cream-50 p-[calc(var(--auth-step)*2)] shadow-float motion-safe:animate-riseIn ${
            wide ? 'max-w-3xl' : 'max-w-md'
          }`}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
