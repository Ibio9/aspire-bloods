import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PageTransition } from '../PageTransition';
import { Wordmark } from '../Wordmark';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../lib/AuthContext';
import { useDialogFocus } from '../../lib/useDialogFocus';
import { ClinicContactPanel } from '../patient/ClinicContact';
import { MarkerSearch } from './MarkerSearch';
import { CloseIcon, CollapseIcon, MenuIcon, SearchIcon } from './icons';
import {
  AccountIcon,
  BookTestIcon,
  DocumentsIcon,
  LibraryIcon,
  MarkersIcon,
  OverviewIcon,
  PanelsIcon,
  PhoneIcon,
  TrendsIcon,
} from './patientIcons';

const COLLAPSE_KEY = 'aspire_patient_sidebar_collapsed';

interface NavItem {
  to: string;
  label: string;
  /** One line under the label when expanded — the patient side has room for it and benefits from it. */
  hint: string;
  icon: (props: React.SVGProps<SVGSVGElement>) => JSX.Element;
  /**
   * Extra path prefixes this item owns. Booking and appointments are one
   * destination as far as a patient is concerned, so the sidebar must not go
   * blank the moment they open the appointment they just made.
   */
  alsoActiveOn?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/overview', label: 'Overview', hint: 'Your latest results at a glance', icon: OverviewIcon },
  {
    to: '/book',
    label: 'Book a test',
    hint: 'Panels, clinics and appointment times',
    icon: BookTestIcon,
    alsoActiveOn: ['/appointments'],
  },
  { to: '/my-results', label: 'My results', hint: 'Every panel you’ve had', icon: PanelsIcon },
  { to: '/markers', label: 'All markers', hint: 'Everything ever tested, in one list', icon: MarkersIcon },
  { to: '/trends', label: 'Trends', hint: 'Compare markers over time', icon: TrendsIcon },
  { to: '/library', label: 'Understanding your results', hint: 'What each marker means', icon: LibraryIcon },
  { to: '/documents', label: 'Documents', hint: 'Download your PDFs', icon: DocumentsIcon },
  { to: '/account', label: 'Account & privacy', hint: 'Profile, consents, your data', icon: AccountIcon },
];

function SidebarLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  const { pathname } = useLocation();
  const ownsPath = item.alsoActiveOn?.some((prefix) => pathname.startsWith(prefix)) ?? false;

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive: routeActive }) => {
        const isActive = routeActive || ownsPath;
        // py-1 rather than py-2: four pixels a row is what buys the eighth
        // item its place at ~700px without touching the two-line pattern.
        return `group relative flex items-start gap-3 rounded-input px-3 py-1 transition-colors duration-150 ease-out ${
          collapsed ? 'justify-center' : ''
        } ${isActive ? 'bg-bronze-50 text-bronze-700' : 'text-espresso/85 hover:bg-cream-200 hover:text-espresso'}`;
      }}
    >
      {({ isActive: routeActive }) => {
        const isActive = routeActive || ownsPath;
        return (
        <>
          {/* Active is carried by this bronze bar, the weight shift and the tinted
              background together — never by colour alone (brief). */}
          <span
            aria-hidden="true"
            className={`absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-full bg-bronze transition-opacity duration-150 ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <Icon className="mt-0.5 shrink-0" />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[15px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-espresso/60">{item.hint}</span>
            </span>
          )}
          {collapsed && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-input bg-espresso px-2.5 py-1.5 text-xs text-cream opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100"
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

function SidebarContents({
  collapsed,
  onNavigate,
  onExpand,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  onExpand?: () => void;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    onNavigate?.();
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    // The column is the only scroll container in the sidebar, and at any
    // ordinary desktop height it never scrolls: the nav below is sized to fit
    // whole. It exists for the window that genuinely is shorter than the
    // sidebar's content, where the alternative is items nobody can reach. It
    // sits here rather than on the <aside> so the collapse toggle, which
    // hangs outside the panel's right edge, is not clipped by it.
    <div className="scroll-thin flex h-full flex-col overflow-y-auto">
      <div className={`shrink-0 ${collapsed ? 'px-2 pt-4' : 'px-4 pt-5'}`}>
        {/* Same mark, same collapsed 'a', same accessible name shape as
            AdminShell — the two sidebars are one system, so they must not
            wear two different wordmarks. */}
        <Link
          to="/overview"
          onClick={onNavigate}
          aria-label="Aspire Bloods, my results"
          className={`flex items-center rounded-sm ${collapsed ? 'justify-center' : ''}`}
        >
          {collapsed ? (
            <span className="font-display text-xl lowercase text-bronze">a</span>
          ) : (
            <Wordmark variant="light" size="sm" />
          )}
        </Link>
        {!collapsed && <p className="eyebrow mt-2">Patient portal</p>}
      </div>

      <div className={`shrink-0 ${collapsed ? 'px-2 pt-3' : 'px-4 pt-3'}`}>
        {collapsed ? (
          <button
            type="button"
            onClick={onExpand}
            aria-label="Search your markers"
            className="group relative mx-auto flex h-10 w-10 items-center justify-center rounded-input text-espresso/85 transition duration-150 ease-out hover:bg-cream-200 hover:text-espresso"
          >
            <SearchIcon />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-input bg-espresso px-2.5 py-1.5 text-xs text-cream opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100"
            >
              Search your markers
            </span>
          </button>
        ) : (
          <MarkerSearch onNavigate={onNavigate} />
        )}
      </div>

      {/* Navigation is the sidebar's job, so it gets the room — the whole
          room. flex-1 with no min-h-0 and no overflow of its own: it takes the
          space left over and grows past it rather than shrinking into a
          scrolling strip, so every item is always whole and always visible. If
          the window is short enough that the space runs out, the column above
          scrolls as one piece instead. */}
      <nav
        aria-label="Patient portal"
        className={`mt-4 flex flex-1 flex-col gap-1 pb-1 ${collapsed ? 'px-2' : 'px-4'}`}
      >
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className={`shrink-0 border-t border-taupe ${collapsed ? 'px-2 py-2.5' : 'px-3 py-2'}`}>
        {collapsed ? (
          <button
            type="button"
            onClick={onExpand}
            aria-label="Contact the clinic"
            className="group relative mx-auto flex h-10 w-10 items-center justify-center rounded-input text-bronze-700 transition duration-150 ease-out hover:bg-cream-200"
          >
            <PhoneIcon />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-input bg-espresso px-2.5 py-1.5 text-xs text-cream opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100"
            >
              Contact the clinic
            </span>
          </button>
        ) : (
          <ClinicContactPanel />
        )}

        {user && !collapsed && (
          <div className="mt-2 flex items-center gap-2.5 px-0.5">
            <Avatar name={user.displayName} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-espresso">{user.displayName}</span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-input px-2.5 py-1.5 text-xs font-medium text-espresso/80 transition duration-150 ease-out hover:bg-cream-200 hover:text-espresso"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Persistent left sidebar for the patient portal — same construction as
 * AdminShell (bronze active bar, collapse-to-icons remembered in
 * localStorage, slide-over drawer under md) deliberately tuned softer:
 * wider, roomier rows with a line of description under each label, larger
 * type, and a contact-the-clinic row pinned to the bottom that opens in place
 * (see ClinicContactPanel). Staff are working a queue; a patient is reading
 * their own health data, and the density should say so.
 *
 * It replaces a two-item top bar. Two items in a sidebar would have looked
 * emptier than the bar did — the eight destinations here (Overview, booking,
 * results, every marker, trends, the explanation library, documents, account)
 * are what make the shape earn itself.
 */
export function PatientShell({ children }: { children?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  // Focus moves into the drawer, Tab stays inside it, Escape closes it, and
  // focus returns to the menu button. Tab used to walk straight out of the
  // open drawer onto the page behind, which is invisible to a sighted
  // keyboard user.
  const drawerRef = useDialogFocus<HTMLDivElement>(drawerOpen, () => setDrawerOpen(false));

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch {
      /* a locked-down browser losing the preference is not worth a broken render */
    }
  }, [collapsed]);

  // A route change from inside the drawer (marker search, nav link) closes it;
  // so does one from anywhere else, e.g. a browser back gesture.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-cream">
      {/* Sticky and exactly one viewport tall, so the panel's background runs
          edge to edge however long the page behind it is (see .h-viewport —
          100dvh with a 100vh fallback). */}
      <aside
        className={`h-viewport sticky top-0 hidden shrink-0 border-r border-taupe bg-cream-50 transition-[width] duration-200 ease-out md:block ${
          collapsed ? 'w-[84px]' : 'w-[288px]'
        }`}
      >
        <SidebarContents collapsed={collapsed} onExpand={() => setCollapsed(false)} />
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-24 z-10 rounded-full border border-taupe bg-white p-1.5 text-espresso/70 shadow-card transition duration-150 ease-out hover:text-bronze"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <CollapseIcon />
        </button>
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-espresso/50 motion-safe:animate-fadeIn" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Patient portal navigation"
            className="absolute left-0 top-0 flex h-full w-[86vw] max-w-[320px] flex-col bg-cream-50 shadow-card outline-none motion-safe:animate-riseIn"
          >
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation menu"
              className="absolute right-3 top-4 z-10 rounded-input p-2 text-espresso transition duration-150 ease-out hover:bg-cream-200"
            >
              <CloseIcon />
            </button>
            <SidebarContents collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Mobile only — the desktop layout is sidebar-and-content, no header. */}
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-taupe bg-cream/90 px-4 py-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 rounded-input p-2 text-espresso transition duration-150 ease-out hover:bg-cream-200"
            aria-label="Open navigation menu"
          >
            <MenuIcon />
          </button>
          <Link to="/overview" aria-label="Aspire Bloods, my results" className="rounded-sm">
            <Wordmark variant="light" size="sm" />
          </Link>
        </div>

        <main className="flex-1 px-5 py-10 sm:px-8 md:px-14 md:py-16 lg:px-20">
          <div className="mx-auto max-w-5xl">
            <PageTransition>{children ?? <Outlet />}</PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}
