import type { ReactNode } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { AdminShell } from '../../components/nav/AdminShell';
import { PatientShell } from '../../components/nav/PatientShell';
import { AuthSplitLayout } from '../auth/AuthSplitLayout';

/**
 * Wraps a standalone page (404, 403) in whichever navigation the current
 * viewer actually has.
 *
 * The point of these screens is that you're never stranded, so rendering them
 * bare — the way the old `*` route's silent redirect effectively did — would
 * defeat them: you'd get an explanation with no sidebar, no account menu and
 * no way to anywhere. Signed-in admins keep the console sidebar, patients keep
 * the top bar, and signed-out visitors get the auth layout so the page still
 * looks like part of the product rather than a browser error.
 */
export function RouteShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (user?.role === 'ADMIN' || user?.role === 'CLINICIAN') {
    return <AdminShell>{children}</AdminShell>;
  }
  if (user) {
    return <PatientShell>{children}</PatientShell>;
  }
  return <AuthSplitLayout>{children}</AuthSplitLayout>;
}
