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
   * THEN THE RESULTS-READY MOMENT, ONCE PER REPORT.
   *
   * After the introduction rather than before it: a patient who has never seen
   * the portal is told how to read it first, and then told their results are
   * ready. The other order announces an answer to somebody who has not been
   * shown the question.
   *
   * Here rather than on /overview for the same reason the walkthrough redirect
   * is: "/" is where a sign-in lands, and a redirect on the overview route
   * would also fire when somebody navigated to it from the sidebar.
   *
   * `=== true` and not truthiness, mirroring `walkthroughSeen === false`: an
   * older payload omits the field, and `undefined` must mean "nothing waiting".
   * The two defaults point in opposite directions because the two failures do —
   * showing an introduction to a returning patient, and showing a moment about
   * results that may not exist, are both the screen appearing when it should
   * not.
   *
   * The flag itself is per REPORT and lives on the report
   * (`Report.resultsReadySeenAt`). Nothing here is keyed on the session, which
   * is what made an earlier version of this fire on every single sign-in.
   */
  if (user?.resultsReadyPending === true) {
    return <Navigate to="/results-ready" replace />;
  }

  return page(
    <PatientShell>
      <PatientOverview />
    </PatientShell>,
  );
}
