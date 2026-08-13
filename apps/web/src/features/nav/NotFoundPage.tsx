import { useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { LinkButton } from '../../components/ui/LinkButton';
import { RouteShell } from './RouteShell';

/**
 * The catch-all used to be `<Navigate to="/" replace />` — a silent bounce to
 * the home page. That is the worst possible answer to a bad URL: nothing tells
 * you the link was wrong, so a mistyped or expired link looks identical to a
 * working one, and anyone who followed a stale link from an email just ends up
 * somewhere unexplained.
 *
 * This says what happened and offers a real way on, inside whatever navigation
 * the viewer actually has (see RouteShell) so they are never stranded on a bare
 * page with no sidebar and no account menu.
 */
export function NotFoundPage() {
  const { user } = useAuth();
  const location = useLocation();
  const isStaff = user?.role === 'ADMIN' || user?.role === 'CLINICIAN';
  /**
   * `/admin/reports` UNTIL Aug 2026, WHICH IS NOT A ROUTE. Only
   * `/admin/reports/:id` is; the reports list is `/admin`. So the one control
   * on the page that exists to get a clinician out of a bad URL sent them to
   * another bad URL — a 404 whose way out is a 404. Found by walking the
   * console's own routes and asserting none of them reached this page.
   */
  const home = isStaff ? '/admin' : user ? '/overview' : '/login';
  const homeLabel = isStaff ? 'Back to reports' : user ? 'Back to your overview' : 'Go to sign in';

  return (
    <RouteShell>
      {/* NO CARD OF ITS OWN WHEN SIGNED OUT. RouteShell puts this inside
          whatever navigation the viewer has — and for a signed-out visitor that
          is AuthSplitLayout, which is itself a bordered, shadowed card. So this
          drew a hairline card inside a hairline card, two shadows deep, with
          the message in the smaller of the two boxes and the heading wrapping
          across two lines because of it. The auth layout is already the
          surface; inside it this is just the content. */}
      <div
        className={`motion-safe:animate-riseIn text-center ${
          user ? 'mx-auto max-w-xl rounded-card border border-taupe bg-cream-50 p-10 shadow-card sm:p-14' : ''
        }`}
      >
        {/* Shape, not colour alone — the state has to survive greyscale. */}
        <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" className="mx-auto text-bronze">
          <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 7.25v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="12" cy="16.25" r="1" fill="currentColor" />
        </svg>
        <p className="mt-5 font-display text-2xl leading-tight text-espresso">This page doesn’t exist</p>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-espresso/80">
          There’s nothing at <span className="break-all font-medium">{location.pathname}</span>. The link may be out
          of date, or typed slightly wrong.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <LinkButton to={home}>{homeLabel}</LinkButton>
        </div>
      </div>
    </RouteShell>
  );
}
