import { Wordmark } from '../../components/Wordmark';

/**
 * What an unauthenticated visitor actually sees at "/" for the moment it
 * takes /auth/me to answer.
 *
 * It was a bare "Loading…" on cream — no brand, no context, and on a cold
 * connection the first and sometimes only thing a first-time visitor saw
 * before being bounced to the login screen. That reads as a broken page,
 * not as a portal deciding where to send you. Wordmark plus one line costs
 * nothing and means the redirect that follows makes sense when it lands.
 *
 * role="status" rather than a spinner alone: a screen reader gets told the
 * page is working, which a decorative animation never says.
 */
export function AuthLoading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-cream px-6 text-center">
      <Wordmark variant="light" size="lg" />
      <p role="status" className="text-sm leading-relaxed text-espresso/80">
        Opening your patient portal…
      </p>
    </main>
  );
}
