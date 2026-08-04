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
import { ReportView } from './features/patient/ReportView';
import { MarkerDetailPage } from './features/patient/MarkerDetailPage';
import { AccountPage } from './features/patient/AccountPage';
import { Footer } from './components/Footer';
import { ComponentsShowcase } from './features/dev/ComponentsShowcase';

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
                  path="/reports/:id"
                  element={
                    <RoleProtectedRoute roles={['PATIENT']}>
                      <ReportView />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/markers/:markerId"
                  element={
                    <RoleProtectedRoute roles={['PATIENT']}>
                      <MarkerDetailPage />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/account"
                  element={
                    <RoleProtectedRoute roles={['PATIENT']}>
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
