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
 */
export function AuthSplitLayout({ children, eyebrow, headline, supporting, wide }: AuthSplitLayoutProps) {
  return (
    <main className="min-h-screen md:flex">
      <div className="relative flex min-h-[320px] flex-col justify-between overflow-hidden bg-gradient-to-br from-espresso via-espresso to-ink px-7 py-12 text-cream sm:px-10 md:min-h-screen md:w-[44%] md:px-16 md:py-20">
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

        <div className="relative motion-safe:animate-riseIn">
          <Wordmark variant="dark" size="lg" />
          <p className="mt-8 font-eyebrow text-xs uppercase tracking-eyebrow text-taupe">
            {eyebrow ?? 'Blood test results, done properly'}
          </p>
          {/* Set generously — display type here is a statement, not a slightly larger paragraph. */}
          <h1 className="mt-10 max-w-md font-display text-4xl leading-[1.08] text-cream md:text-5xl lg:text-6xl">
            {headline ?? 'Your results, explained — not just handed to you.'}
          </h1>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-cream/70">
            {supporting ?? 'Sign in to see your panels, track markers over time, and understand what they mean for you.'}
          </p>
        </div>

        {/* cream/70 not /50: at this small size, anything under ~/65 drops below 4.5:1 body-text AA against espresso, verified */}
        <p className="relative hidden text-xs text-cream/70 md:block">
          Aspire Clinic — Aspire Group of Companies
          <br />
          27 Mortimer Street, London
        </p>
      </div>

      {/* The form sits in a card, not loose on the cream: warm off-white, hairline taupe border,
          soft corners, and the heaviest shadow in the system (shadow-float) so it genuinely
          floats rather than sitting flush. Padding is deliberately past the point of feeling
          necessary — this is the most-looked-at surface in the product and it should feel
          unhurried. Vertically centred with real room above and below. */}
      <div className="flex flex-1 items-center justify-center bg-cream px-5 py-14 sm:px-8 md:px-16 md:py-24">
        <div
          className={`w-full rounded-card border border-taupe bg-cream-50 p-7 shadow-float motion-safe:animate-riseIn sm:p-10 md:p-14 ${
            wide ? 'max-w-3xl' : 'max-w-md'
          }`}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
