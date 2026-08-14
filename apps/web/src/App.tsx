import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { ThemeProvider } from './lib/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import { PageTransition } from './components/PageTransition';
import { LoginPage } from './features/auth/LoginPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { RoleProtectedRoute } from './features/auth/RoleProtectedRoute';
import { HomeRouter } from './features/auth/HomeRouter';
import { BOOKING_ENABLED } from './lib/features';
import { PatientShell } from './components/nav/PatientShell';
import { SessionGuard } from './components/SessionGuard';
import { lazyPage, page } from './lib/lazyPage';

/**
 * ---------------------------------------------------------------------------
 * WHAT LOADS EAGERLY, AND WHY IT IS ONLY THIS.
 * ---------------------------------------------------------------------------
 *
 * Everything below `lazyPage` is a chunk of its own, fetched when somebody
 * actually navigates to it. Four things are NOT, and each has a reason:
 *
 *  - LoginPage. It is what an unauthenticated visitor sees first, and putting a
 *    network round trip in front of the sign-in form to save bytes on a screen
 *    they are already on is the trade backwards.
 *  - HomeRouter and the two route guards. They run on "/" before anything is
 *    known about the visitor and decide where they are sent; splitting them
 *    adds a hop to every cold entry into the product.
 *  - PatientShell. It is the frame around every patient screen, so it is
 *    fetched on the first navigation regardless and would only ever be a chunk
 *    that always loads with another one.
 *
 * AdminShell is NOT in that list, deliberately. Most people signing in here are
 * patients and will never render it, so the clinician console — shell, pages
 * and the whole admin feature folder — stays out of their download entirely.
 */
const ActivatePage = lazyPage(() => import('./features/auth/ActivatePage'), 'ActivatePage');
const SignupPage = lazyPage(() => import('./features/auth/SignupPage'), 'SignupPage');
const VerifyEmailPage = lazyPage(() => import('./features/auth/VerifyEmailPage'), 'VerifyEmailPage');
const ForgotPasswordPage = lazyPage(() => import('./features/auth/ForgotPasswordPage'), 'ForgotPasswordPage');
const ResetPasswordPage = lazyPage(() => import('./features/auth/ResetPasswordPage'), 'ResetPasswordPage');
const NotFoundPage = lazyPage(() => import('./features/nav/NotFoundPage'), 'NotFoundPage');

const AdminShell = lazyPage(() => import('./components/nav/AdminShell'), 'AdminShell');
const AdminReportsPage = lazyPage(() => import('./features/admin/AdminReportsPage'), 'AdminReportsPage');
const AdminReportDetailPage = lazyPage(() => import('./features/admin/ReportDetailPage'), 'ReportDetailPage');
const PatientsListPage = lazyPage(() => import('./features/admin/PatientsListPage'), 'PatientsListPage');
const PatientDetailPage = lazyPage(() => import('./features/admin/PatientDetailPage'), 'PatientDetailPage');
const AdminAnalyticsPage = lazyPage(() => import('./features/admin/AnalyticsPage'), 'AnalyticsPage');
/**
 * Settings is one route holding five sections, and each section's component is
 * lazily imported INSIDE it — see SettingsPage. So the audit log, the ingestion
 * log, the package editor and the marker library are still four chunks of their
 * own, fetched when a disclosure opens; they simply no longer have routes.
 */
const SettingsPage = lazyPage(() => import('./features/admin/SettingsPage'), 'SettingsPage');

const PatientOverview = lazyPage(() => import('./features/patient/PatientOverview'), 'PatientOverview');
const ResultsPage = lazyPage(() => import('./features/patient/ResultsPage'), 'ResultsPage');
const LegacyResultsRedirect = lazyPage(() => import('./features/patient/LegacyResultsRedirect'), 'LegacyResultsRedirect');
const MarkerLibraryPage = lazyPage(() => import('./features/patient/MarkerLibraryPage'), 'MarkerLibraryPage');
const DocumentsPage = lazyPage(() => import('./features/patient/DocumentsPage'), 'DocumentsPage');
const MarkerDetailPage = lazyPage(() => import('./features/patient/MarkerDetailPage'), 'MarkerDetailPage');
const AccountPage = lazyPage(() => import('./features/patient/AccountPage'), 'AccountPage');
const WelcomePage = lazyPage(() => import('./features/patient/WelcomePage'), 'WelcomePage');

/**
 * BOOKING IS DECLARED INSIDE THE FLAG, NOT BESIDE IT.
 *
 * With booking off, the four routes below redirect — but a `lazyPage(() =>
 * import(...))` at module scope is reachable from the module graph whether or
 * not the route ever renders it, so Rollup emits the chunk and the flow is
 * sitting at a URL on the CDN. That is a REGRESSION on what the flag promises
 * (DEPLOYMENT.md: none of features/booking reaches the production bundle) and
 * it is invisible in the size of the entry chunk, which is why it is worth
 * stating: splitting a feature and switching it off are different things, and
 * doing the first can quietly undo the second.
 *
 * `BOOKING_ENABLED` is a build-time constant, so with it false this ternary
 * folds and the arrow function holding the dynamic import goes with it. Turning
 * the flag on makes each one a lazily-loaded route in the ordinary way.
 */
const Redirected = () => <Navigate to="/overview" replace />;
const BookingPage = BOOKING_ENABLED ? lazyPage(() => import('./features/booking/BookingPage'), 'BookingPage') : Redirected;
const AppointmentsPage = BOOKING_ENABLED
  ? lazyPage(() => import('./features/booking/AppointmentsPage'), 'AppointmentsPage')
  : Redirected;
const AppointmentDetailPage = BOOKING_ENABLED
  ? lazyPage(() => import('./features/booking/AppointmentDetailPage'), 'AppointmentDetailPage')
  : Redirected;
const ReschedulePage = BOOKING_ENABLED
  ? lazyPage(() => import('./features/booking/ReschedulePage'), 'ReschedulePage')
  : Redirected;

const ComponentsShowcase = lazyPage(() => import('./features/dev/ComponentsShowcase'), 'ComponentsShowcase');

// Routes a patient's own data is reachable on — widened beyond PATIENT so
// an admin who is also a patient of the practice sees their own results
// through these exact same pages. Every underlying API call is already
// scoped to the caller's own id, so this is never a cross-patient risk.
const PATIENT_DATA_ROLES = ['PATIENT', 'ADMIN', 'CLINICIAN'] as const;

export default function App() {
  return (
    <BrowserRouter>
      {/* Outside AuthProvider on purpose: the theme applies to the sign-in
          screen too, and someone who prefers dark mode should not have to
          authenticate before the app stops being bright at them. */}
      <ThemeProvider>
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
              <Route path="/activate" element={page(<PageTransition><ActivatePage /></PageTransition>)} />
              <Route path="/signup" element={page(<PageTransition><SignupPage /></PageTransition>)} />
              <Route path="/verify-email" element={page(<PageTransition><VerifyEmailPage /></PageTransition>)} />
              {/* Forgotten password. Two screens, both unauthenticated: ask
                  for a link, then spend it. Neither issues a session — the
                  patient signs back in through /login and therefore 2FA. */}
              <Route path="/forgot-password" element={page(<PageTransition><ForgotPasswordPage /></PageTransition>)} />
              <Route path="/reset-password" element={page(<PageTransition><ResetPasswordPage /></PageTransition>)} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <HomeRouter />
                  </ProtectedRoute>
                }
              />

              {/* /results-ready is GONE (Aug 2026) and is deliberately not
                  redirected. It was a full-screen moment between a patient and
                  the results they had signed in to read, it was only ever
                  reached by an internal redirect, and it was never linked to or
                  emailed — so unlike /book and /appointments there are no
                  bookmarks of it to honour, and a redirect would be scaffolding
                  standing in for a screen nobody has a route to. */}

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
                <Route path="/overview" element={page(<PatientOverview />)} />
                {/* Booking — the flow itself, the diary, and one appointment.
                    `/appointments/:id` doubles as the confirmation screen
                    (with ?booked=1) so the summary a patient checks before
                    confirming is the same one they come back to.

                    Off unless VITE_BOOKING_ENABLED=true (see lib/features.ts):
                    appointments are booked on the clinic's main website now.
                    The paths stay declared and redirect, because they are in
                    bookmarks and in at least one browser history — a redirect
                    to somewhere real beats a 404 on a URL that used to work.

                    The flag is a build-time constant, so with booking off
                    Rollup folds every branch below to the redirect and the four
                    dynamic imports become unreachable — none of features/booking
                    reaches the production bundle, exactly as before splitting. */}
                <Route path="/book" element={page(<BookingPage />)} />
                <Route path="/appointments" element={page(<AppointmentsPage />)} />
                <Route path="/appointments/:id" element={page(<AppointmentDetailPage />)} />
                <Route path="/appointments/:id/reschedule" element={page(<ReschedulePage />)} />
                {/* Results — one destination, three views chosen by the
                    segmented control at the top of it. An opened report keeps
                    /reports/:id so every link already sent out still lands on
                    the report it names. */}
                <Route path="/results" element={page(<ResultsPage />)} />
                <Route path="/reports/:id" element={page(<ResultsPage />)} />
                {/* The three destinations this replaced. Redirects rather than
                    removals: they are in bookmarks and in browser histories,
                    and /trends carries its ?markers= selection across. */}
                <Route path="/my-results" element={page(<LegacyResultsRedirect view="by-test" />)} />
                <Route path="/markers" element={page(<LegacyResultsRedirect view="by-marker" />)} />
                <Route path="/trends" element={page(<LegacyResultsRedirect view="compare" />)} />
                <Route path="/library" element={page(<MarkerLibraryPage />)} />
                <Route path="/documents" element={page(<DocumentsPage />)} />
                {/* A marker's own page is not folded into any of the three —
                    it is what somebody reads carefully when a result is out of
                    range, and it stays its own route. */}
                <Route path="/markers/:markerId" element={page(<MarkerDetailPage />)} />
                <Route path="/account" element={page(<AccountPage />)} />
                {/* The first sign-in introduction. A ROUTE rather than a modal
                    over somebody's results, and a permanent one: it is where
                    HomeRouter sends a patient who has not seen it, and it is
                    where Understanding results links back to for anyone who
                    skipped it. */}
                <Route path="/welcome" element={page(<WelcomePage />)} />
              </Route>

              {/* Clinician console — persistent sidebar, shared across every screen in it.
                  The /admin URLs are unchanged: they are in bookmarks and in at least one
                  server-side error message, and renaming them buys nothing a patient or a
                  clinician can see. What a clinician READS says clinician throughout. */}
              <Route
                element={
                  <RoleProtectedRoute roles={['ADMIN', 'CLINICIAN']}>
                    {page(<AdminShell />)}
                  </RoleProtectedRoute>
                }
              >
                <Route path="/admin" element={page(<AdminReportsPage />)} />
                <Route path="/admin/analytics" element={page(<AdminAnalyticsPage />)} />
                <Route path="/admin/reports/:id" element={page(<AdminReportDetailPage />)} />
                <Route path="/admin/patients" element={page(<PatientsListPage />)} />
                <Route path="/admin/patients/:id" element={page(<PatientDetailPage />)} />
                {/* ═══ FIVE SCREENS (Aug 2026) ═══════════════════════════════
                    Overview · Reports · Patients · Analytics · Settings. Six
                    routes closed and every one of them redirects rather than
                    404ing: all six are in bookmarks, several are in browser
                    histories and at least one is in a server-side error
                    message. A redirect into Settings carries a HASH, and the
                    matching disclosure opens itself — landing somebody on a
                    page of shut sections answers "where is the audit log" with
                    "somewhere under one of these".

                    `/admin/linking` goes to the Reports section that absorbed
                    it; `/admin/queue` to the Overview that replaced it. */}
                <Route path="/admin/settings" element={page(<SettingsPage />)} />
                <Route path="/admin/queue" element={<Navigate to="/" replace />} />
                <Route path="/admin/linking" element={<Navigate to="/admin#unmatched" replace />} />
                <Route path="/admin/panels" element={<Navigate to="/admin/settings#packages" replace />} />
                <Route path="/admin/content" element={<Navigate to="/admin/settings#packages" replace />} />
                <Route path="/admin/markers" element={<Navigate to="/admin/settings#markers" replace />} />
                <Route path="/admin/ingestion-log" element={<Navigate to="/admin/settings#ingestion-log" replace />} />
                <Route path="/admin/audit-log" element={<Navigate to="/admin/settings#audit-log" replace />} />
              </Route>

              {/* Dev-only design system review — tree-shaken out of production builds entirely, not just hidden. */}
              {import.meta.env.DEV && <Route path="/dev/components" element={page(<PageTransition><ComponentsShowcase /></PageTransition>)} />}
              {import.meta.env.DEV && <Route path="/dev/interactions" element={page(<PageTransition><ComponentsShowcase /></PageTransition>)} />}
              {/* A bad URL gets an explanation and a named way on, inside the
                  viewer's own navigation — never a silent bounce to the home page. */}
              <Route path="*" element={page(<NotFoundPage />)} />
            </Routes>
          </div>
        </ToastProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
