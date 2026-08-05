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
import { ContentConfigPage } from './features/admin/ContentConfigPage';
import { PatientHome } from './features/patient/PatientHome';
import { ReportView } from './features/patient/ReportView';
import { MarkerDetailPage } from './features/patient/MarkerDetailPage';
import { AccountPage } from './features/patient/AccountPage';
import { Footer } from './components/Footer';
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
          {/* Off-screen until focused, then the very first tabbable thing on any page — lets
              keyboard users jump past nothing-yet (there's no persistent nav) straight into the
              page's own content region below. */}
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <div id="main-content">
            <PageTransition>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/activate" element={<ActivatePage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <HomeRouter />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/my-results"
                  element={
                    <RoleProtectedRoute roles={[...PATIENT_DATA_ROLES]}>
                      <PatientHome />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/reports/:id"
                  element={
                    <RoleProtectedRoute roles={[...PATIENT_DATA_ROLES]}>
                      <ReportView />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/markers/:markerId"
                  element={
                    <RoleProtectedRoute roles={[...PATIENT_DATA_ROLES]}>
                      <MarkerDetailPage />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/account"
                  element={
                    <RoleProtectedRoute roles={[...PATIENT_DATA_ROLES]}>
                      <AccountPage />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <RoleProtectedRoute roles={['ADMIN', 'CLINICIAN']}>
                      <AdminReportsPage />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/admin/reports/:id"
                  element={
                    <RoleProtectedRoute roles={['ADMIN', 'CLINICIAN']}>
                      <ReportDetailPage />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/admin/patients"
                  element={
                    <RoleProtectedRoute roles={['ADMIN', 'CLINICIAN']}>
                      <PatientsListPage />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/admin/patients/:id"
                  element={
                    <RoleProtectedRoute roles={['ADMIN', 'CLINICIAN']}>
                      <PatientDetailPage />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/admin/audit-log"
                  element={
                    <RoleProtectedRoute roles={['ADMIN']}>
                      <AuditLogPage />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/admin/content"
                  element={
                    <RoleProtectedRoute roles={['ADMIN', 'CLINICIAN']}>
                      <ContentConfigPage />
                    </RoleProtectedRoute>
                  }
                />
                {/* Dev-only design system review — tree-shaken out of production builds entirely, not just hidden. */}
                {import.meta.env.DEV && <Route path="/dev/components" element={<ComponentsShowcase />} />}
                {import.meta.env.DEV && <Route path="/dev/interactions" element={<ComponentsShowcase />} />}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </PageTransition>
          </div>
          <Footer />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
