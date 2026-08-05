import type { ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { AccountMenu } from '../AccountMenu';
import { PageTransition } from '../PageTransition';

const NAV_ITEMS = [
  { to: '/my-results', label: 'My results' },
  { to: '/account', label: 'Account & privacy' },
];

/**
 * Light sticky top bar for the patient-facing side — deliberately not the
 * admin sidebar. A patient has two destinations, not four, and shouldn't
 * be handed an admin-shaped console (brief: "patients shouldn't get an
 * admin-shaped interface").
 */
export function PatientShell({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-30 border-b border-taupe bg-cream/90 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-4 md:px-16">
          <Link to="/my-results" className="font-display italic text-2xl text-bronze">
            Aspire
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-1 sm:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-input px-3.5 py-2 text-sm transition-colors duration-150 ease-out ${
                    isActive ? 'font-semibold text-bronze-700 underline decoration-2 underline-offset-8' : 'font-medium text-espresso/80 hover:text-espresso'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <AccountMenu links={NAV_ITEMS} />
        </div>
      </header>
      <main className="px-6 py-12 md:px-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <PageTransition>{children ?? <Outlet />}</PageTransition>
        </div>
      </main>
    </div>
  );
}
