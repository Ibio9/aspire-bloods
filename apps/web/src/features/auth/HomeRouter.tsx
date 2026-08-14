import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { PatientShell } from '../../components/nav/PatientShell';
import { lazyPage, page } from '../../lib/lazyPage';

/**
 * Same "/" route, different dashboard (and different shell) depending on who's
 * signed in. A patient lands on Overview rather than the panel list — the
 * point of that screen is that a bare list of reports is a file cabinet, not
 * an answer to "what does this say about me".
 *
 * BOTH BRANCHES ARE LAZY, and the admin one is the point. This component runs
 * on "/" for everybody, so a static import of AdminDashboard here pulls the
 * console — and, through it, most of the admin feature folder — into the chunk
 * every patient downloads before they have even been routed. Splitting the
 * console at App.tsx and then importing it here would have been a boundary with
 * a hole straight through it.
 */
const AdminShell = lazyPage(() => import('../../components/nav/AdminShell'), 'AdminShell');
const AdminDashboard = lazyPage(() => import('../admin/AdminDashboard'), 'AdminDashboard');
const PatientOverview = lazyPage(() => import('../patient/PatientOverview'), 'PatientOverview');

export function HomeRouter() {
  const { user } = useAuth();
  if (user?.role === 'ADMIN' || user?.role === 'CLINICIAN') {
    return page(
      <AdminShell>
        <AdminDashboard />
      </AdminShell>,
    );
  }
  /**
   * FIRST SIGN-IN GOES TO THE INTRODUCTION, ONCE.
   *
   * Here rather than on /overview, deliberately: "/" is where a sign-in lands,
   * and putting the redirect on the overview route would also fire when
   * somebody navigated to it from the sidebar on their second visit — before
   * `walkthroughSeen` had come back from the server, on a slow connection, that
   * is the introduction reappearing over a page they asked for.
   *
   * `walkthroughSeen === false` and not `!walkthroughSeen`: an older payload
   * omits the field entirely, and `undefined` must read as SEEN. A returning
   * patient shown an introduction because a deploy was mid-flight is the one
   * failure mode this screen cannot have.
   */
  if (user?.walkthroughSeen === false) {
    return <Navigate to="/welcome" replace />;
  }

  /**
   * AND THEN STRAIGHT TO THE OVERVIEW. There is no second interstitial.
   *
   * A results-ready moment used to sit here — a full-screen arch announcing
   * that a released report was waiting, once per report. It is gone (Aug 2026),
   * and the reason is the one thing it could never answer for: a patient who
   * signs in because they have been told their results are ready does not need
   * to be told again on the way to them. The announcement was correct and the
   * placement was not; the Overview says the same thing with the results in it.
   */
  return page(
    <PatientShell>
      <PatientOverview />
    </PatientShell>,
  );
}
