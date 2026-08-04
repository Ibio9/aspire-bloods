import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * A short cross-fade between routes, keyed on pathname so React remounts (and thus re-animates)
 * the outlet content on every navigation. Every page already returns real content (or a
 * shaped skeleton) synchronously on first render, so there's no blank frame underneath the
 * fade — this only ever softens a swap that was already non-blank.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="motion-safe:animate-fadeIn">
      {children}
    </div>
  );
}
