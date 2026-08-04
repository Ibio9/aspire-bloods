import type { ReactNode } from 'react';

/**
 * The split composition from the Aspire Rota sign-in benchmark: a dark
 * espresso-to-ink gradient panel carrying the wordmark and positioning,
 * form on cream to the right. Warmer and more spacious than the rota's
 * staff-tool version — this is patient-facing, not internal.
 */
export function AuthSplitLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      <div className="relative flex min-h-[280px] flex-col justify-between overflow-hidden bg-gradient-to-br from-espresso to-ink px-8 py-10 text-cream md:min-h-screen md:w-[42%] md:px-14 md:py-16">
        {/* Barely-there texture, per "the subtle background texture is barely there and better for it" */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
          aria-hidden="true"
        />

        <div className="relative motion-safe:animate-riseIn">
          <p className="font-eyebrow text-xs uppercase tracking-eyebrow text-taupe">
            Blood test results, done properly
          </p>
          {/* bronze-300 not bronze: the brand accent fails contrast against its own dark family (1.95:1) — this tint clears 3:1 for large text, verified */}
          <p className="mt-8 font-display italic text-3xl text-bronze-300 md:text-4xl">Aspire</p>
          <h1 className="mt-4 max-w-sm font-display text-3xl leading-tight text-cream md:text-4xl">
            Your results, explained — not just handed to you.
          </h1>
          <p className="mt-4 max-w-xs text-sm text-cream/70">
            Sign in to see your panels, track markers over time, and understand what they mean for you.
          </p>
        </div>

        {/* cream/70 not /50: at this small size, anything under ~/65 drops below 4.5:1 body-text AA against espresso, verified */}
        <p className="relative hidden text-xs text-cream/70 md:block">
          Aspire Clinic — Aspire Group of Companies
          <br />
          27 Mortimer Street, London
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-cream px-6 py-16 md:px-16">
        <div className="w-full max-w-md motion-safe:animate-riseIn">{children}</div>
      </div>
    </div>
  );
}
