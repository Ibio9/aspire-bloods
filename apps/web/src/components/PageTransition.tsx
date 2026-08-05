import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * A short cross-fade between routes, keyed on pathname so React remounts (and thus re-animates)
 * the outlet content on every navigation. Every page already returns real content (or a
 * shaped skeleton) synchronously on first render, so there's no blank frame underneath the
 * fade — this only ever softens a swap that was already non-blank.
 *
 * Also resets scroll position on every navigation — React Router doesn't do this itself, so
 * without it a scroll position carried over from the previous page (e.g. having scrolled down
 * a long report before clicking through to a patient) leaves the new page rendering partway
 * down, with a sticky header sitting on top of content it was never meant to cover.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div key={location.pathname} className="motion-safe:animate-fadeIn">
      {children}
    </div>
  );
}
