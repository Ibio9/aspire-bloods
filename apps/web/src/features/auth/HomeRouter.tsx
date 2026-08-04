import { useAuth } from '../../lib/AuthContext';
import { PatientHome } from '../patient/PatientHome';
import { HomePlaceholder } from './HomePlaceholder';

/** Same "/" route, different dashboard depending on who's signed in. */
export function HomeRouter() {
  const { user } = useAuth();
  if (user?.role === 'PATIENT') return <PatientHome />;
  return <HomePlaceholder />;
}
