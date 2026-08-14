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
  AnalyticsIcon,
  ReportsIcon,
  PatientsIcon,
  PanelsIcon,
  // MarkerLibraryIcon, LinkingIcon, AuditIcon and IngestionIcon are still
  // exported from ./icons and are no longer imported here: their four sidebar
  // entries became sections of Reports and Settings (Aug 2026). They are not
  // deleted from the icon set — a section may want one — but nothing in the
  // navigation draws them.
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
  icon: (props: React.SVGProps<SVGSVGElement>) => JSX.Element;
  adminOnly?: boolean;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FIVE ITEMS. NO BANDS, NO HINTS (Aug 2026).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It was nine items in two bands with a one-line hint under each label. Every
 * part of that was a workaround for there being nine of them:
 *
 *   · THE BANDS. "Every day" and "Records & setup" existed to say which three
 *     of the nine a clinician actually opens. Five items do not need to be told
 *     apart from each other by a heading — the list is short enough to read.
 *   · THE HINTS. A label that needs a sublabel to be understood is a label that
 *     needs rewriting, and the sublabels carried `truncate`, so four of them
 *     were cut off mid-word — a line whose whole job is removing ambiguity,
 *     removed halfway through. They also said what the screen says: the work
 *     queue's hint read "What is waiting, oldest first", above a screen headed
 *     "What needs doing", above a purpose line saying the same thing a third
 *     time. Say a thing once.
 *
 * ── WHERE THE OTHER FOUR WENT ─────────────────────────────────────────────
 *
 *   Work queue      → Overview, which is `/` and leads with what needs doing.
 *   Result linking  → a section at the foot of REPORTS. An unmatched result is
 *                     a report, and a separate screen for one class of report
 *                     meant two places to look for the same thing.
 *   Panels          → Settings, as "Edit packages" (the clinic sells packages;
 *                     "panel" is the laboratory's word and the schema's).
 *   Marker library  → Settings.
 *   Ingestion log   → Settings.
 *   Audit log       → Settings.
 *
 * PATIENTS STAYS ITS OWN ITEM and is deliberately not in Settings: it is daily
 * clinical work rather than configuration, and it is what somebody reaches for
 * when a patient rings.
 */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: QueueIcon },
  { to: '/admin', label: 'Reports', icon: ReportsIcon },
  { to: '/admin/patients', label: 'Patients', icon: PatientsIcon },
  { to: '/admin/analytics', label: 'Analytics', icon: AnalyticsIcon },
  { to: '/admin/settings', label: 'Settings', icon: PanelsIcon },
];

/**
 * ── A DETAIL PAGE KEEPS ITS SECTION LIT (Aug 2026) ─────────────────────────
 *
 * `/admin/reports/:id` and `/admin/patients/:id` are the two screens a
 * clinician spends the most time on, and on both of them NOTHING in the
 * sidebar was active: `/admin` carries `end` (it has to — it is a prefix of
 * every other console route) and `/admin/patients` does not match an id below
 * it. So the one moment somebody most needs to know where they are was the one
 * moment the navigation stopped answering.
 *
 * A prefix list per item rather than loosening `end`, which would light
 * "Reports" on every console screen there is.
 */
const ALSO_ACTIVE_ON: Record<string, string[]> = {
  '/admin': ['/admin/reports/'],
  '/admin/patients': ['/admin/patients/'],
};

/**
 * The five items, filtered by role. Settings shows for a clinician even though
 * three of its five sections are ADMIN-only: the other two — packages and the
 * marker library — are not, and hiding the whole entry would hide them.
 */
function visibleItems(role: string | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.adminOnly || role === 'ADMIN');
}

function SidebarLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  const { pathname } = useLocation();
  const withinSection = (ALSO_ACTIVE_ON[item.to] ?? []).some((prefix) => pathname.startsWith(prefix));
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
        } ${
          isActive || withinSection
            ? 'bg-bronze-50 text-bronze-700'
            : 'text-espresso/85 hover:bg-cream-200 hover:text-espresso'
        }`
      }
    >
      {({ isActive: exact }) => {
        const isActive = exact || withinSection;
        return (
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
        );
      }}
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
  const items = visibleItems(user?.role);

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
        {/* FIVE ITEMS, ONE LIST. The two band headings went with the four
            entries they existed to separate — a list of five needs no headings
            to be read at a glance, and a heading over two items is scaffolding
            standing in for a structure that is not there. */}
        {items.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className={`flex shrink-0 flex-col gap-1 border-t border-taupe ${collapsed ? 'px-2 py-2.5' : 'px-3 py-2.5'}`}>
        {user?.hasPatientProfile && (
          // Crosses into the patient shell — lands on its Overview, same as any
          // patient's home. The patient shell carries the matching way back.
          <SidebarLink
            item={{ to: '/overview', label: 'My results', icon: ReportsIcon }}
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
