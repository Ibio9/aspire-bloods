import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AccountMenu } from '../AccountMenu';
import { Footer } from '../Footer';
import { CommandPalette } from './CommandPalette';
import { PageTransition } from '../PageTransition';
import { useAuth } from '../../lib/AuthContext';
import { Wordmark } from '../Wordmark';
import { useDialogFocus } from '../../lib/useDialogFocus';
import {
  AdminConsoleIcon,
  ReportsIcon,
  PatientsIcon,
  PanelsIcon,
  MarkerLibraryIcon,
  LinkingIcon,
  AuditIcon,
  IngestionIcon,
  QueueIcon,
  SearchIcon,
  MenuIcon,
  CollapseIcon,
  CloseIcon,
} from './icons';

const COLLAPSE_KEY = 'aspire_admin_sidebar_collapsed';

interface NavItem {
  to: string;
  label: string;
  /** One line under the label, where the label alone is genuinely ambiguous.
   * "Ingestion log" and "Audit log" are not self-explanatory names, and the
   * sublabel is what tells them apart. "Patients" needs no such help. */
  hint?: string;
  icon: (props: React.SVGProps<SVGSVGElement>) => JSX.Element;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  // The console is where an admin lands after signing in, and it is the only
  // screen that answers "what is waiting for me" — but it had no entry here at
  // all. Getting back to it meant clicking the wordmark, which is a
  // convention rather than a signposted destination, carries no active state,
  // and whose accessible name doesn't mention the console. The patient
  // sidebar's first item is Overview for exactly the same reason.
  { to: '/', label: 'Console', hint: 'What is waiting for you', icon: AdminConsoleIcon },
  // Sits second, directly under the console, because it is the screen this
  // console is FOR now that there is one gate: what is waiting, what is stuck,
  // and the exception queue at the top of it.
  { to: '/admin/queue', label: 'Work queue', hint: 'Oldest first, with the exceptions', icon: QueueIcon },
  // "Verify" is gone from this label. It named a pipeline stage that no longer
  // exists, and a label claiming a check nobody performs is the removed stage
  // surviving as a word.
  { to: '/admin', label: 'Reports & entry', hint: 'Upload, review, release', icon: ReportsIcon },
  { to: '/admin/patients', label: 'Patients', icon: PatientsIcon },
  // Sits directly under Patients: it's the same subject (who is who) at the
  // moment it matters most, not a reporting screen.
  { to: '/admin/linking', label: 'Result linking', hint: 'Match a result to a patient', icon: LinkingIcon, adminOnly: true },
  { to: '/admin/panels', label: 'Panels', hint: 'Test levels and their contents', icon: PanelsIcon },
  { to: '/admin/markers', label: 'Marker library', hint: 'Analytes and explanation copy', icon: MarkerLibraryIcon },
  { to: '/admin/audit-log', label: 'Audit log', hint: 'Every action and view, by whom', icon: AuditIcon, adminOnly: true },
  { to: '/admin/ingestion-log', label: 'Ingestion log', hint: 'Results arriving from Randox', icon: IngestionIcon, adminOnly: true },
];

function SidebarLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      // "/" and "/admin" are both prefixes of every other admin route, so
      // without `end` they would both read as active everywhere.
      end={item.to === '/admin' || item.to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-start gap-3 rounded-input px-3 py-1.5 transition-colors duration-150 ease-out ${
          collapsed ? 'justify-center' : ''
        } ${isActive ? 'bg-bronze-50 text-bronze-700' : 'text-espresso/85 hover:bg-cream-200 hover:text-espresso'}`
      }
    >
      {({ isActive }) => (
        <>
          {/* Active state is marked by this bar AND the weight/background/colour shift above —
              never colour alone (brief). */}
          <span
            aria-hidden="true"
            className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-bronze transition-opacity duration-150 ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <Icon className="mt-0.5 shrink-0" />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
              {item.hint && <span className="mt-px block truncate text-xs leading-snug text-espresso/80">{item.hint}</span>}
            </span>
          )}
          {collapsed && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-input bg-night px-2.5 py-1.5 text-xs text-oncolor opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100"
            >
              {item.label}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

/**
 * The panel's three bands — mark, navigation, footer — as one flex column that
 * is exactly as tall as the panel.
 *
 * The footer used to be an absolutely-positioned collapse button pinned to
 * `bottom-4` of the aside, which is not part of the layout at all: it floated
 * over whatever the nav's last row happened to be, and with the "My results"
 * link at the end of the list that was text over text. It is an ordinary
 * flex child now, so it cannot overlap anything by construction.
 *
 * `shrink-0` on the footer is the other half of that: a footer allowed to
 * shrink below its own content height doesn't get shorter, it spills its
 * children out of the bottom of its box and over the row beneath.
 */
function SidebarContents({
  collapsed,
  onNavigate,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
}) {
  const { user } = useAuth();
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === 'ADMIN');

  return (
    // Only this column ever scrolls, and only on a window genuinely shorter
    // than the panel's own content. The nav inside it never does.
    <div className="scroll-thin flex h-full min-h-0 flex-col overflow-y-auto">
      <div className={`shrink-0 ${collapsed ? 'px-2 pt-4' : 'px-4 pt-5'}`}>
        <Link
          to="/"
          onClick={onNavigate}
          className={`flex items-center rounded-input ${collapsed ? 'justify-center' : ''}`}
          aria-label="Aspire Bloods, admin"
        >
          {collapsed ? (
            <span className="font-display text-lg lowercase text-bronze">a</span>
          ) : (
            <Wordmark variant="light" size="sm" />
          )}
        </Link>
        {!collapsed && <p className="eyebrow mt-2">Clinician console</p>}
      </div>

      <nav
        aria-label="Clinician console navigation"
        className={`mt-4 flex flex-1 flex-col gap-0.5 pb-1 ${collapsed ? 'px-2' : 'px-3'}`}
      >
        {items.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className={`flex shrink-0 flex-col gap-1 border-t border-taupe ${collapsed ? 'px-2 py-2.5' : 'px-3 py-2.5'}`}>
        {user?.hasPatientProfile && (
          // Crosses into the patient shell — lands on its Overview, same as any
          // patient's home. The patient shell carries the matching way back.
          <SidebarLink
            item={{ to: '/overview', label: 'My results', hint: 'Your own patient portal', icon: ReportsIcon }}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`group relative flex items-center gap-3 rounded-input px-3 py-2 text-sm font-medium text-espresso/85 transition-colors duration-150 ease-out hover:bg-cream-200 hover:text-espresso ${
              collapsed ? 'justify-center' : ''
            }`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <CollapseIcon className="shrink-0" />
            {!collapsed && <span className="truncate">Collapse</span>}
            {collapsed && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-input bg-night px-2.5 py-1.5 text-xs text-oncolor opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100"
              >
                Expand sidebar
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function AdminTopBar({ onOpenSearch, onOpenDrawer }: { onOpenSearch: () => void; onOpenDrawer: () => void }) {
  return (
    // THE GLASS MATERIAL, not a fourth one-off translucent fill. This was
    // `bg-cream/90 backdrop-blur` — the page colour at 90% with an unspecified
    // blur — which is the same idea as `.glass` written a different way, with
    // its own alpha and its own radius, on the one surface in the console that
    // the console's own content scrolls under. Glass the colour of the PAGE is
    // invisible against the page; `.glass` is the card tone, which is why it
    // reads as a surface. One material, three numbers, one class.
    <div className="glass sticky top-0 z-30 flex items-center justify-between border-b border-panel-edge px-4 py-3 md:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="rounded-input p-2 text-espresso transition duration-150 ease-out hover:bg-cream-200 md:hidden"
          aria-label="Open navigation menu"
        >
          <MenuIcon />
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden items-center gap-2 rounded-input border border-taupe bg-white px-3 py-1.5 text-sm text-espresso/80 transition duration-150 ease-out hover:border-bronze/60 md:flex"
        >
          <SearchIcon />
          <span>Search patients…</span>
          <span className="ml-6 rounded-input border border-taupe px-1.5 py-0.5 text-xs text-espresso/80">⌘K</span>
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className="rounded-input p-2 text-espresso transition duration-150 ease-out hover:bg-cream-200 md:hidden"
          aria-label="Search"
        >
          <SearchIcon />
        </button>
      </div>
      <AccountMenu />
    </div>
  );
}

/**
 * Persistent left sidebar for the admin console (brief: "your own App.tsx
 * comment says 'there's no persistent nav' — every page is an island").
 * Collapsible to icons with the choice remembered (localStorage), a
 * slide-over drawer below the md breakpoint, and the single AccountMenu
 * instance for the whole admin experience — it used to be duplicated
 * per-page.
 */
export function AdminShell({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const drawerRef = useDialogFocus<HTMLDivElement>(drawerOpen, () => setDrawerOpen(false));

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Route changes close the drawer — a browser back gesture used to leave it
  // sitting open over the previous page.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    // Same construction as PatientShell, and for the same reason: this box is
    // the sidebar's containing block, so the disclaimer footer belongs inside
    // it. h-viewport rather than h-screen so the panel is measured against the
    // same 100dvh the shell is.
    // No background here: `html` carries the page colour, and an opaque one on
    // this div covers `body::before`, which is the ambient glow. See the same
    // note in PatientShell.
    <div className="min-h-viewport flex">
      {/* Desktop persistent sidebar. `md:flex` rather than `md:block`: the
          panel is the flex column itself, so its bands measure against the
          panel's own height and the footer sits on its bottom edge. */}
      {/* The same translucent wash as the patient panel, and for the same
          reason the two shells matched when both had none: they are one
          system, and one of them being its own surface while the other
          dissolves into the page would be worse than either. See PatientShell
          and the note on --c-panel in tokens.ts. */}
      <aside
        className={`panel-wash h-viewport sticky top-0 hidden shrink-0 flex-col border-r border-panel-edge transition-[width] duration-200 ease-out md:flex ${
          collapsed ? 'w-[76px]' : 'w-[272px]'
        }`}
      >
        <SidebarContents collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      </aside>

      {/* Mobile slide-over drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-night/60 motion-safe:animate-fadeIn" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Clinician console navigation"
            className="absolute left-0 top-0 flex h-full w-72 flex-col bg-cream-50 shadow-card outline-none motion-safe:animate-riseIn"
          >
            {/* Tapping the scrim closes it, but a scrim is not a discoverable
                control — and on a phone the drawer covers most of the screen. */}
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation menu"
              className="absolute right-2 top-3 z-10 rounded-input p-2 text-espresso transition duration-150 ease-out hover:bg-cream-200"
            >
              <CloseIcon />
            </button>
            <SidebarContents collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* min-w-0: a flex item defaults to min-width:auto, which lets this column be
          pushed wider than the viewport by its own content — and every overflow-x-auto
          inside (the reports/patients/audit tables) then never engages. Matches
          PatientShell. */}
      <div className="min-h-viewport flex min-w-0 flex-1 flex-col">
        <AdminTopBar onOpenSearch={() => setSearchOpen(true)} onOpenDrawer={() => setDrawerOpen(true)} />
        <main className="flex-1 px-5 py-14 sm:px-8 md:px-14 md:py-24">
          <div className="mx-auto max-w-6xl">
            <PageTransition>{children ?? <Outlet />}</PageTransition>
          </div>
        </main>

        {/* NOT the patient disclaimer. See the note on Footer's `text` prop:
            the seeded block tells the reader to contact their GP about their
            own results, which on a screen full of other people's reports is
            addressed to the wrong person. What is true of every screen in here
            — and worth a clinician having permanently in view — is that all of
            it is patient data and all of it is recorded. */}
        <Footer
          className="px-5 sm:px-8 md:px-14"
          inset="max-w-6xl"
          text="Everything in this console is patient data. Every view and every action is recorded in the audit log against your name."
        />
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
