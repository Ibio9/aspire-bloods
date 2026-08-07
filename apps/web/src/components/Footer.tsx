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
export function Footer({ className = '', inset = 'max-w-5xl' }: { className?: string; inset?: string }) {
  const [text, setText] = useState('');

  useEffect(() => {
    apiFetch<{ body: string }>('/content/footer-disclaimer')
      .then((r) => setText(r.body))
      .catch(() => {});
  }, []);

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
