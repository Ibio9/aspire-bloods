import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { PageTransition } from './components/PageTransition';
import { LoginPage } from './features/auth/LoginPage';
import { ActivatePage } from './features/auth/ActivatePage';
import { SignupPage } from './features/auth/SignupPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { RoleProtectedRoute } from './features/auth/RoleProtectedRoute';
import { HomeRouter } from './features/auth/HomeRouter';
import { AdminReportsPage } from './features/admin/AdminReportsPage';
import { ReportDetailPage } from './features/admin/ReportDetailPage';
import { PatientsListPage } from './features/admin/PatientsListPage';
import { PatientDetailPage } from './features/admin/PatientDetailPage';
import { AuditLogPage } from './features/admin/AuditLogPage';
import { IngestionLogPage } from './features/admin/IngestionLogPage';
import { ContentConfigPage } from './features/admin/ContentConfigPage';
import { PatientHome } from './features/patient/PatientHome';
import { ReportView } from './features/patient/ReportView';
import { MarkerDetailPage } from './features/patient/MarkerDetailPage';
import { AccountPage } from './features/patient/AccountPage';
import { AdminShell } from './components/nav/AdminShell';
import { PatientShell } from './components/nav/PatientShell';
import { Footer } from './components/Footer';
import { SessionGuard } from './components/SessionGuard';
import { ComponentsShowcase } from './features/dev/ComponentsShowcase';

// Routes a patient's own data is reachable on — widened beyond PATIENT so
// an admin who is also a patient of the practice sees their own results
// through these exact same pages. Every underlying API call is already
// scoped to the caller's own id, so this is never a cross-patient risk.
const PATIENT_DATA_ROLES = ['PATIENT', 'ADMIN', 'CLINICIAN'] as const;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <SessionGuard />
          {/* Off-screen until focused, then the very first tabbable thing on any page. */}
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <div id="main-content">
            <Routes>
              <Route path="/login" element={<PageTransition><LoginPage /></PageTransition>} />
              <Route path="/activate" element={<PageTransition><ActivatePage /></PageTransition>} />
              <Route path="/signup" element={<PageTransition><SignupPage /></PageTransition>} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <HomeRouter />
                  </ProtectedRoute>
                }
              />

              {/* Patient shell — light sticky top bar, not the admin sidebar. Widened to
                  PATIENT_DATA_ROLES so an admin-who-is-also-a-patient sees their own results
                  through the same pages. */}
              <Route
                element={
                  <RoleProtectedRoute roles={[...PATIENT_DATA_ROLES]}>
                    <PatientShell />
                  </RoleProtectedRoute>
                }
              >
                <Route path="/my-results" element={<PatientHome />} />
                <Route path="/reports/:id" element={<ReportView />} />
                <Route path="/markers/:markerId" element={<MarkerDetailPage />} />
                <Route path="/account" element={<AccountPage />} />
              </Route>

              {/* Admin shell — persistent sidebar, shared across every admin/clinician screen. */}
              <Route
                element={
                  <RoleProtectedRoute roles={['ADMIN', 'CLINICIAN']}>
                    <AdminShell />
                  </RoleProtectedRoute>
                }
              >
                <Route path="/admin" element={<AdminReportsPage />} />
                <Route path="/admin/reports/:id" element={<ReportDetailPage />} />
                <Route path="/admin/patients" element={<PatientsListPage />} />
                <Route path="/admin/patients/:id" element={<PatientDetailPage />} />
                <Route path="/admin/content" element={<ContentConfigPage />} />
              </Route>
              {/* Audit log is ADMIN-only (not CLINICIAN) — kept as its own guarded route rather
                  than loosening the shell group above. */}
              <Route
                element={
                  <RoleProtectedRoute roles={['ADMIN']}>
                    <AdminShell />
                  </RoleProtectedRoute>
                }
              >
                <Route path="/admin/audit-log" element={<AuditLogPage />} />
                <Route path="/admin/ingestion-log" element={<IngestionLogPage />} />
              </Route>

              {/* Dev-only design system review — tree-shaken out of production builds entirely, not just hidden. */}
              {import.meta.env.DEV && <Route path="/dev/components" element={<PageTransition><ComponentsShowcase /></PageTransition>} />}
              {import.meta.env.DEV && <Route path="/dev/interactions" element={<PageTransition><ComponentsShowcase /></PageTransition>} />}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <Footer />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
