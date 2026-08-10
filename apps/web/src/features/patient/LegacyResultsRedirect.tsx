import { Navigate, useLocation } from 'react-router-dom';
import type { ResultsView } from './resultsView';

/**
 * The three old destinations, kept as redirects rather than removed.
 *
 * /my-results, /markers and /trends are in browser histories, in bookmarks, in
 * at least one emailed link and in the breadcrumbs of pages nobody has visited
 * yet this session. A 404 on any of them would be the consolidation making the
 * product worse for exactly the people who used it most, so each lands on the
 * new page with the view it used to be.
 *
 * The query string comes with it, which matters for /trends?markers=a,b — a
 * comparison someone saved or sent to their GP is still that comparison after
 * the move, not an empty picker.
 */
export function LegacyResultsRedirect({ view }: { view: ResultsView }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (view === 'by-report') params.delete('view');
  else params.set('view', view);
  const qs = params.toString();
  return <Navigate to={`/results${qs ? `?${qs}` : ''}`} replace />;
}
