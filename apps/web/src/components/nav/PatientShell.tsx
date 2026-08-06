import type { ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { AccountMenu } from '../AccountMenu';
import { PageTransition } from '../PageTransition';
import { Wordmark } from '../Wordmark';

const NAV_ITEMS = [
  { to: '/my-results', label: 'My results' },
  { to: '/account', label: 'Account & privacy' },
];

/**
 * Light sticky top bar for the patient-facing side — deliberately not the
 * admin sidebar. A patient has two destinations, not four, and shouldn't
 * be handed an admin-shaped console (brief: "patients shouldn't get an
 * admin-shaped interface").
 *
 * Nav pattern mirrors the Aspire Clinic site's header: plain text links
 * separated by hairline pipes rather than boxed pills, generous gaps
 * either side (visual-polish brief).
 */
export function PatientShell({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-30 border-b border-taupe bg-cream/90 backdrop-blur">
        <div className="flex items-center justify-between px-5 py-4 sm:px-8 md:px-20">
          <Link to="/my-results" aria-label="Aspire Bloods, my results">
            <Wordmark variant="light" size="sm" />
          </Link>
          <nav aria-label="Primary" className="hidden items-center sm:flex">
            {NAV_ITEMS.map((item, i) => (
              <span key={item.to} className="flex items-center">
                {i > 0 && (
                  <span aria-hidden="true" className="mx-5 text-taupe">
                    |
                  </span>
                )}
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `text-sm transition-colors duration-150 ease-out ${
                      isActive ? 'font-semibold text-bronze-700' : 'font-medium text-espresso/80 hover:text-espresso'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </span>
            ))}
          </nav>
          <AccountMenu links={NAV_ITEMS} />
        </div>
      </header>
      <main className="px-5 py-14 sm:px-8 md:px-20 md:py-24">
        <div className="mx-auto max-w-6xl">
          <PageTransition>{children ?? <Outlet />}</PageTransition>
        </div>
      </main>
    </div>
  );
}
