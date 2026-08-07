import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { PageTransition } from './components/PageTransition';
import { LoginPage } from './features/auth/LoginPage';
import { ActivatePage } from './features/auth/ActivatePage';
import { SignupPage } from './features/auth/SignupPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { NotFoundPage } from './features/nav/NotFoundPage';
import { RoleProtectedRoute } from './features/auth/RoleProtectedRoute';
import { HomeRouter } from './features/auth/HomeRouter';
import { AdminReportsPage } from './features/admin/AdminReportsPage';
import { ReportDetailPage } from './features/admin/ReportDetailPage';
import { PatientsListPage } from './features/admin/PatientsListPage';
import { LinkingPage } from './features/admin/LinkingPage';
import { PatientDetailPage } from './features/admin/PatientDetailPage';
import { AuditLogPage } from './features/admin/AuditLogPage';
import { IngestionLogPage } from './features/admin/IngestionLogPage';
import { RandoxCataloguePage } from './features/admin/RandoxCataloguePage';
import { ContentConfigPage } from './features/admin/ContentConfigPage';
import { PatientOverview } from './features/patient/PatientOverview';
import { PatientHome } from './features/patient/PatientHome';
import { AllMarkersPage } from './features/patient/AllMarkersPage';
import { TrendsPage } from './features/patient/TrendsPage';
import { MarkerLibraryPage } from './features/patient/MarkerLibraryPage';
import { DocumentsPage } from './features/patient/DocumentsPage';
import { ReportView } from './features/patient/ReportView';
import { MarkerDetailPage } from './features/patient/MarkerDetailPage';
import { AccountPage } from './features/patient/AccountPage';
import { BookingPage } from './features/booking/BookingPage';
import { AppointmentsPage } from './features/booking/AppointmentsPage';
import { AppointmentDetailPage } from './features/booking/AppointmentDetailPage';
import { ReschedulePage } from './features/booking/ReschedulePage';
import { AdminShell } from './components/nav/AdminShell';
import { PatientShell } from './components/nav/PatientShell';
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
          {/* The disclaimer footer is *inside* each shell (see PatientShell /
              AdminShell), not a sibling of this div. As a sibling it sat below
              the shell's own box, which is the sticky sidebar's containing
              block — so the panel stopped short of the window bottom by
              exactly the footer's height, and every page had that much scroll
              in it with nothing to scroll to. The only routes not covered by a
              shell are the auth screens, which are viewport-fit and were never
              meant to carry it anyway. */}
          <div id="main-content">
            <Routes>
              <Route path="/login" element={<PageTransition><LoginPage /></PageTransition>} />
              <Route path="/activate" element={<PageTransition><ActivatePage /></PageTransition>} />
              <Route path="/signup" element={<PageTransition><SignupPage /></PageTransition>} />
              <Route path="/verify-email" element={<PageTransition><VerifyEmailPage /></PageTransition>} />
              {/* Forgotten password. Two screens, both unauthenticated: ask
                  for a link, then spend it. Neither issues a session — the
                  patient signs back in through /login and therefore 2FA. */}
              <Route path="/forgot-password" element={<PageTransition><ForgotPasswordPage /></PageTransition>} />
              <Route path="/reset-password" element={<PageTransition><ResetPasswordPage /></PageTransition>} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <HomeRouter />
                  </ProtectedRoute>
                }
              />

              {/* Patient shell — its own persistent sidebar, warmer and less dense than the
                  admin one. Widened to PATIENT_DATA_ROLES so an admin-who-is-also-a-patient
                  sees their own results through the same pages. */}
              <Route
                element={
                  <RoleProtectedRoute roles={[...PATIENT_DATA_ROLES]}>
                    <PatientShell />
                  </RoleProtectedRoute>
                }
              >
                <Route path="/overview" element={<PatientOverview />} />
                {/* Booking — the flow itself, the diary, and one appointment.
                    `/appointments/:id` doubles as the confirmation screen
                    (with ?booked=1) so the summary a patient checks before
                    confirming is the same one they come back to. */}
                <Route path="/book" element={<BookingPage />} />
                <Route path="/appointments" element={<AppointmentsPage />} />
                <Route path="/appointments/:id" element={<AppointmentDetailPage />} />
                <Route path="/appointments/:id/reschedule" element={<ReschedulePage />} />
                <Route path="/my-results" element={<PatientHome />} />
                <Route path="/markers" element={<AllMarkersPage />} />
                <Route path="/trends" element={<TrendsPage />} />
                <Route path="/library" element={<MarkerLibraryPage />} />
                <Route path="/documents" element={<DocumentsPage />} />
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
                <Route path="/admin/randox-catalogue" element={<RandoxCataloguePage />} />
                {/* Deciding whose results these are is a records action, and
                    the one the practice most wants a single accountable
                    identity attached to — ADMIN only, like the audit log. */}
                <Route path="/admin/linking" element={<LinkingPage />} />
              </Route>

              {/* Dev-only design system review — tree-shaken out of production builds entirely, not just hidden. */}
              {import.meta.env.DEV && <Route path="/dev/components" element={<PageTransition><ComponentsShowcase /></PageTransition>} />}
              {import.meta.env.DEV && <Route path="/dev/interactions" element={<PageTransition><ComponentsShowcase /></PageTransition>} />}
              {/* A bad URL gets an explanation and a named way on, inside the
                  viewer's own navigation — never a silent bounce to the home page. */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </div>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
