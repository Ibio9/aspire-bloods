import { useAuth } from '../../lib/AuthContext';
import { PatientHome } from '../patient/PatientHome';
import { AdminDashboard } from '../admin/AdminDashboard';

/** Same "/" route, different dashboard depending on who's signed in. */
export function HomeRouter() {
  const { user } = useAuth();
  if (user?.role === 'ADMIN' || user?.role === 'CLINICIAN') return <AdminDashboard />;
  return <PatientHome />;
}
