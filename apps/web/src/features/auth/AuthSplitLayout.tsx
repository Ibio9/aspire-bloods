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
 * Viewport-fit at md+: the shell is exactly one viewport tall and the page
 * never scrolls. Both panels fill that height and centre their own content,
 * and the vertical scale (--auth-step, see .auth-screen in globals.css)
 * shrinks with the viewport so a 720px-tall laptop gets a smaller version of
 * the same composition rather than a cropped one.
 *
 * THE CARD NEVER SCROLLS INTERNALLY. Not the page, and not the card — the
 * form column used to carry `overflow-y-auto`, which meant the registration
 * form on a 720px laptop grew a scrollbar inside the most-looked-at surface
 * in the product. A scrollbar there is not a small blemish: it is the moment
 * someone stops trusting that they have seen the whole form they are about to
 * agree to. So the column and the card are both `overflow-hidden` at md+, and
 * any step whose content cannot fit is restructured until it does (see
 * RegistrationForm, which is a sequence of steps for exactly this reason)
 * rather than being allowed to overflow.
 *
 * Below md the split collapses to a single naturally-scrolling column — the
 * PAGE scrolls there, the card still does not. Pinning a phone to 100vh breaks
 * the moment the on-screen keyboard opens and steals half the viewport, so
 * overflow is only ever locked at md+.
 */
export function AuthSplitLayout({ children, eyebrow, headline, supporting, wide }: AuthSplitLayoutProps) {
  return (
    <main className="auth-screen min-h-screen md:flex md:h-screen md:min-h-0 md:overflow-hidden">
      <div className="relative flex min-h-[300px] flex-col overflow-hidden bg-gradient-to-br from-night-soft via-night-soft to-night px-7 py-[calc(var(--auth-step)*2)] text-oncolor sm:px-10 md:h-full md:min-h-0 md:w-[44%] md:px-14 lg:px-16">
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
          <p className="mt-[calc(var(--auth-step)*1.5)] font-eyebrow text-xs uppercase tracking-eyebrow text-oncolor/70">
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

          Neither the column nor the card scrolls at md+. `max-h-full` bounds the card to the
          column, `overflow-hidden` makes an overflow visible in development rather than
          silently absorbed by a scrollbar, and each screen is composed to fit inside that
          bound. my-auto centres it in whatever height is left. */}
      <div className="flex flex-1 justify-center bg-cream px-5 py-[calc(var(--auth-step)*2)] sm:px-8 md:h-full md:min-h-0 md:overflow-hidden md:px-10 lg:px-16">
        <div
          className={`my-auto flex w-full flex-col rounded-card border border-taupe bg-cream-50 p-[calc(var(--auth-step)*2)] shadow-float motion-safe:animate-riseIn md:max-h-full md:overflow-hidden ${
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
 * Stacked, the introduction (eyebrow, heading, the paragraph explaining what
 * registering does) plus the first form step plus the cross-link came to
 * roughly 1050px, which overflows a 720px laptop by a third even with the form
 * split into steps. There was nothing left to cut: every line of that copy is
 * doing work, and the brief is explicit that the answer to "it doesn't fit" is
 * to restructure rather than to scroll.
 *
 * So at md+ it becomes two columns inside the wide card — the introduction on
 * the left, the form on the right — which is the same content at half the
 * height. Below md it stacks exactly as it did, where the page scrolls anyway.
 * Not one word of copy changed to make this fit.
 */
export function AuthWideBody({ intro, children }: { intro: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-0 grid-cols-1 gap-x-[calc(var(--auth-step)*2.2)] gap-y-[calc(var(--auth-step)*1.4)] md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      {/* The cross-link sits at the foot of this column (it uses mt-auto via
          its own top border), so the two columns end level. */}
      <div className="flex min-h-0 flex-col">{intro}</div>
      <div className="flex min-h-0 flex-col">{children}</div>
    </div>
  );
}
