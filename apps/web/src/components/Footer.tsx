import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

/**
 * The reading-your-results disclaimer, rendered as the last row of a shell's
 * content column — not as a sibling of the shell.
 *
 * That distinction is the whole point of where it sits. As a page-level
 * sibling it fell outside the flex box the sidebar is sticky within, so the
 * panel's background stopped short of the window bottom by the footer's own
 * height and every screen carried that much dead scroll. Inside the column it
 * is simply the thing after <main>, which is flex-1 — so on a page whose
 * content fits, the footer lands on the bottom edge of the viewport and the
 * page does not scroll at all.
 *
 * The auth screens deliberately don't get one: they're viewport-fit (see
 * AuthSplitLayout), a footer underneath is exactly what made them scroll, and
 * the disclaimer is about how to read results, which is not what those screens
 * are for. They carry the clinic's identity block on the left panel instead.
 */
export function Footer({
  className = '',
  inset = 'max-w-5xl',
  text: fixedText,
}: {
  className?: string;
  inset?: string;
  /**
   * WHOSE FOOTER THIS IS (Aug 2026).
   *
   * The seeded block is addressed to a PATIENT — "if you have concerns about
   * your results, contact your GP … in a medical emergency, call 999" — and
   * the clinician console was rendering it on every screen, under a queue of
   * other people's reports. It is not merely redundant there, it is addressed
   * to the wrong person: a clinician reading it is being told to ring NHS 111
   * about results that are not theirs.
   *
   * Passed in rather than seeded as a second block, deliberately. The stored
   * copy blocks are clinician-EDITABLE and carry a `supersedes` history that
   * has to be maintained by hand (see seed.ts); adding one for a sentence no
   * clinician would ever edit buys a migration and a maintenance obligation
   * for nothing. Where this is absent the patient block is fetched exactly as
   * before.
   */
  text?: string;
}) {
  const [fetched, setFetched] = useState('');

  useEffect(() => {
    if (fixedText) return;
    apiFetch<{ body: string }>('/content/footer-disclaimer')
      .then((r) => setFetched(r.body))
      .catch(() => {});
  }, [fixedText]);

  const text = fixedText ?? fetched;
  if (!text) return null;

  return (
    // The horizontal padding and inner width are passed in by the shell so the
    // disclaimer sits on the same left edge as the content above it rather
    // than on its own.
    <footer className={`shrink-0 border-t border-taupe py-8 ${className}`}>
      <p className={`mx-auto text-xs text-espresso ${inset}`}>{text}</p>
    </footer>
  );
}
