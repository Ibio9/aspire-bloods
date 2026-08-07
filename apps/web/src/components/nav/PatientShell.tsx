import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Footer } from '../Footer';
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
              <span className={`block truncate text-reading ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
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
    // The panel is exactly one viewport tall and its four bands — mark,
    // search, navigation, footer — are laid out to fit inside that, so at any
    // ordinary window height nothing here scrolls at all. Two escapes exist,
    // in this order, and the order is the point: the contact card gives first
    // and scrolls inside its own border (see ClinicContactPanel), and only a
    // window genuinely shorter than the panel's own minimum falls through to
    // this column scrolling as one piece. Neither of them is ever the nav.
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
          room. flex-1 and nothing else, which is doing two things at once.
          It grows to take everything left between the search field and the
          footer, so the footer block sits on the bottom edge of the panel
          rather than partway up it. And, because there is no min-h-0 here and
          no overflow of its own, its automatic minimum size is its own content
          height: it can hand back the space it *grew* into when the contact
          card opens, but it can never be squeezed below the eight whole rows.
          That floor is what stops it becoming a scrolling strip with a row
          cut through the middle — and shrink-0 would have been the wrong way
          to spell it, since it would also refuse to give back space it isn't
          using, leaving the open card with nowhere to go. */}
      <nav
        aria-label="Patient portal"
        className={`mt-4 flex flex-1 flex-col gap-1 pb-1 ${collapsed ? 'px-2' : 'px-4'}`}
      >
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* Pinned to the bottom of the panel, and — deliberately — the only band
          here that can give. No shrink-0, so an open contact card yields
          before anything else does; min-h-0, because without it this band's
          min-content height includes the open card in full and it refuses to
          shrink at all, which is what put the account row 145px below the
          bottom of the panel at 1280x720. What gives inside it is the card,
          which scrolls in its own border (see ClinicContactPanel); the account
          row under it is shrink-0 and stays exactly where it is. */}
      <div className={`flex min-h-0 flex-col border-t border-taupe ${collapsed ? 'px-2 py-2.5' : 'px-3 py-2'}`}>
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
          <div className="mt-2 flex shrink-0 items-center gap-2.5 px-0.5">
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
    // This box is the sidebar's containing block, so everything on the page —
    // including the disclaimer footer, which used to sit outside it — has to
    // be inside it. A sticky element cannot outlast its containing block: with
    // the footer outside, scrolling to the bottom of any page left the panel's
    // background ending a footer's height above the window edge, with page
    // cream below it.
    <div className="min-h-viewport flex bg-cream">
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

      {/* One viewport tall as a floor, then as tall as its content. main is
          the only part that grows, so a page whose content fits ends exactly
          at the window edge with the disclaimer on it — no scroll, and no
          band of page cream underneath the last card pretending there is
          more to come. */}
      <div className="min-h-viewport flex min-w-0 flex-1 flex-col">
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

        <Footer className="px-5 sm:px-8 md:px-14 lg:px-20" />
      </div>
    </div>
  );
}
