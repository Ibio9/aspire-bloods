import { useAuth } from '../../lib/AuthContext';
import { PatientHome } from '../patient/PatientHome';
import { AdminDashboard } from '../admin/AdminDashboard';
import { AdminShell } from '../../components/nav/AdminShell';
import { PatientShell } from '../../components/nav/PatientShell';

/** Same "/" route, different dashboard (and different shell) depending on who's signed in. */
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
      <PatientHome />
    </PatientShell>
  );
}
