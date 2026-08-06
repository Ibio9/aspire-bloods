import { useAuth } from '../../lib/AuthContext';
import { PatientOverview } from '../patient/PatientOverview';
import { AdminDashboard } from '../admin/AdminDashboard';
import { AdminShell } from '../../components/nav/AdminShell';
import { PatientShell } from '../../components/nav/PatientShell';

/**
 * Same "/" route, different dashboard (and different shell) depending on who's
 * signed in. A patient lands on Overview rather than the panel list — the
 * point of that screen is that a bare list of reports is a file cabinet, not
 * an answer to "what does this say about me".
 */
export function HomeRouter() {
  const { user } = useAuth();
  if (user?.role === 'ADMIN' || user?.role === 'CLINICIAN') {
    return (
      <AdminShell>
        <AdminDashboard />
      </AdminShell>
    );
  }
  return (
    <PatientShell>
      <PatientOverview />
    </PatientShell>
  );
}
