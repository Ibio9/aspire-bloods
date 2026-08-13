import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Footer } from '../Footer';
import { PageTransition } from '../PageTransition';
import { Wordmark } from '../Wordmark';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../lib/AuthContext';
import { BOOKING_ENABLED } from '../../lib/features';
import { useDialogFocus } from '../../lib/useDialogFocus';
import { ClinicContactPanel } from '../patient/ClinicContact';
import { PrintFooter } from '../patient/PrintDocument';
import { MarkerSearch } from './MarkerSearch';
import { AdminConsoleIcon, CloseIcon, CollapseIcon, MenuIcon, SearchIcon } from './icons';
import { AccountIcon, BookTestIcon, DocumentsIcon, LibraryIcon, OverviewIcon, PanelsIcon, PhoneIcon } from './patientIcons';

const COLLAPSE_KEY = 'aspire_patient_sidebar_collapsed';

interface NavItem {
  to: string;
  label: string;
  /**
   * One line under the label, only where the label alone is genuinely
   * ambiguous. None of the six currently needs one — each says what it is.
   */
  hint?: string;
  icon: (props: React.SVGProps<SVGSVGElement>) => JSX.Element;
  /**
   * Extra path prefixes this item owns. Booking and appointments are one
   * destination as far as a patient is concerned, so the sidebar must not go
   * blank the moment they open the appointment they just made.
   */
  alsoActiveOn?: string[];
}

/**
 * Five destinations, six with booking on. My results, All markers and Trends
 * were three of them and are now one: they were three overlapping answers
 * about the same data, and choosing between them in a sidebar meant guessing
 * which one held the thing you were after. Results holds all three, chosen by
 * a control at the top of the page where the difference between them is
 * visible.
 *
 * `alsoActiveOn` carries the routes each item owns but isn't the URL for. An
 * opened report and a marker's own page both belong to Results as far as a
 * patient is concerned, so the sidebar must not go blank the moment they open
 * one — the same reason booking owns /appointments.
 *
 * Book a test is behind VITE_BOOKING_ENABLED and off by default: appointments
 * are made on the clinic's main website, so a sidebar item pointing at a
 * booking flow here would be a promise this portal no longer keeps.
 */
const NAV_ITEMS: NavItem[] = [
  { to: '/overview', label: 'Overview', icon: OverviewIcon },
  ...(BOOKING_ENABLED
    ? [{ to: '/book', label: 'Book a test', icon: BookTestIcon, alsoActiveOn: ['/appointments'] }]
    : []),
  { to: '/results', label: 'Results', icon: PanelsIcon, alsoActiveOn: ['/reports/', '/markers/'] },
  // "Understanding your results" ran past the column and was truncated to
  // "Understanding your r…". An ellipsis in navigation is a destination whose
  // name you cannot read, so the label is shorter and the row wraps rather
  // than clipping — see the label span below.
  { to: '/library', label: 'Understanding results', icon: LibraryIcon },
  { to: '/documents', label: 'Documents', icon: DocumentsIcon },
  { to: '/account', label: 'Account & privacy', icon: AccountIcon },
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
        // ACTIVE IS A BRONZE RULE AND A WHISPER OF WARM FILL, not a filled
        // block. The filled bronze-50 pill was the heaviest thing in the
        // sidebar and, now that the panel itself is transparent, it read as a
        // solid tile pasted over the glow. The rule is the mark; the fill is
        // there so the row still has a body behind the words.
        return `group relative flex items-start gap-3 rounded-input px-3 py-1.5 transition-colors duration-150 ease-out ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-bronze/[0.08] text-espresso'
            : 'text-taupe-900 hover:bg-cream-200/60 hover:text-espresso'
        }`;
      }}
    >
      {({ isActive: routeActive }) => {
        const isActive = routeActive || ownsPath;
        return (
        <>
          {/* Active is carried by this bronze bar, the weight shift and the
              faint warm fill together — never by colour alone (brief). */}
          <span
            aria-hidden="true"
            className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-bronze transition-opacity duration-150 ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
          />
          {/* One size at the call site, so a glyph whose intrinsic box drifts
              cannot make one row's icon larger than the rest. */}
          <Icon className="mt-px h-[18px] w-[18px] shrink-0" />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              {/* NOT `truncate`. A navigation label that has been cut off is a
                  destination whose name you cannot read; if it does not fit on
                  one line it takes two. */}
              <span className={`nav-label block leading-snug ${isActive ? 'font-semibold' : ''}`}>{item.label}</span>
              {item.hint && <span className="mt-0.5 block text-xs leading-snug text-taupe-900">{item.hint}</span>}
            </span>
          )}
          {collapsed && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-input bg-night px-2.5 py-1.5 text-xs text-oncolor opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100"
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
 * The way back to the admin console, for a member of staff who has crossed
 * into the patient portal.
 *
 * The crossing was one-way: AdminShell offers "My results" to an admin who is
 * also a patient of the practice, and once through it there was no route back
 * short of typing /admin. This is that route, pinned above the account row so
 * it is on every patient screen rather than only the one they landed on.
 *
 * It is a link and nothing more. `user.role` is whatever /auth/me said on the
 * last request, and /auth/me derives it from ADMIN_EMAILS server-side, per
 * request — this neither caches nor confers anything. Someone who is no longer
 * an admin gets a link that renders and then bounces off RoleProtectedRoute
 * and off every API call behind it, exactly as an unauthorised /admin URL
 * typed by hand already does. CLINICIAN is included because the admin shell
 * admits clinicians too, so the same dead end existed for them.
 */
function StaffReturnLink({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN' && user?.role !== 'CLINICIAN') return null;

  const label = 'Back to the admin console';
  return (
    <Link
      to="/admin"
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      className={`group relative mb-1 flex items-center gap-2.5 rounded-input py-2 text-sm font-medium text-bronze-700 transition-colors duration-150 ease-out hover:bg-cream-200/60 ${
        collapsed ? 'mx-auto h-10 w-10 justify-center px-0' : 'px-2.5'
      }`}
    >
      <AdminConsoleIcon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-input bg-night px-2.5 py-1.5 text-xs text-oncolor opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100"
        >
          {label}
        </span>
      )}
    </Link>
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
    // THE COLUMN ITSELF NEVER SCROLLS, and that is the change.
    //
    // It used to be one `overflow-y-auto` box: when the contact card opened on
    // a short window the whole column grew a scrollbar, and the account row —
    // the patient's own name and the way out of the product — went below the
    // fold. A thing you have to scroll a navigation panel to reach is not
    // pinned to the bottom of it.
    //
    // Now the giving is done in a fixed order, by the band that should give:
    //   · mark and search  — shrink-0, always exactly their content
    //   · nav              — flex-auto, min-h-0, scrolls when squeezed
    //   · footer band      — flex-none so it is never squeezed, and capped at
    //                        60% of the panel so it can never crowd the nav
    //                        out; inside it the contact details are the one
    //                        thing that scrolls, and the account row is
    //                        shrink-0 and therefore always on screen.
    // Verified at 900, 800 and 700px with the contact panel open and shut —
    // see e2e/patient-sidebar.spec.ts.
    <div className="flex h-full min-h-0 flex-col">
      <div className={`shrink-0 ${collapsed ? 'px-2 pt-4' : 'px-4 pt-4'}`}>
        {/* Same mark, same collapsed 'a', same accessible name shape as
            AdminShell — the two sidebars are one system, so they must not
            wear two different wordmarks. */}
        <Link
          to="/overview"
          onClick={onNavigate}
          aria-label="Aspire Bloods, my results"
          className={`flex items-center rounded-input ${collapsed ? 'justify-center' : ''}`}
        >
          {collapsed ? (
            <span className="font-display text-lg lowercase text-bronze">a</span>
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
            className="group relative mx-auto flex h-10 w-10 items-center justify-center rounded-input text-taupe-900 transition duration-150 ease-out hover:bg-cream-200/60 hover:text-espresso"
          >
            <SearchIcon />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-input bg-night px-2.5 py-1.5 text-xs text-oncolor opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100"
            >
              Search your markers
            </span>
          </button>
        ) : (
          <MarkerSearch onNavigate={onNavigate} />
        )}
      </div>

      {/* Navigation is the sidebar's job, so it gets the room — the whole
          room. `flex-auto` (grow AND shrink, from its own content height) so
          it takes everything left between the search field and the footer, and
          gives it back when the contact card opens. `min-h-0` plus its own
          overflow is what lets it be squeezed on a genuinely short window
          without spilling: it scrolls, which is the correct thing for a list
          of destinations to do, and nothing below it moves. */}
      <nav
        aria-label="Patient portal"
        className={`scroll-thin mt-3 flex min-h-0 flex-auto flex-col gap-0.5 overflow-y-auto pb-1 ${collapsed ? 'px-2' : 'px-4'}`}
      >
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* Pinned to the bottom of the panel, and never squeezed as a whole.
          `flex-none` so flexbox cannot shrink it below its content and spill
          it (which is what once painted "Contact the clinic" over the account
          row). The 60% cap is what keeps that promise affordable: without it a
          tall open contact card would simply be taller than the window and
          take the account row off the bottom with it. Capped, the band's own
          children sort it out — the details scroll, the name stays. The
          percentage resolves against the panel, which is a definite height
          (h-viewport on the aside, h-full on the drawer). */}
      <div
        // 45% RATHER THAN HALF, and the number is measured rather than chosen:
        // the mark, the search field and the six nav rows come to ~331px, so
        // 45% is the largest cap that still leaves every row standing at 700px
        // with the contact card open. Above that the nav starts scrolling
        // before the card does, which is the wrong one to give — a card of
        // reference detail scrolls inside its own border without anybody
        // minding, whereas a list of destinations with the last one cut
        // through the middle looks like the bug it isn't.
        className={`flex max-h-[45%] min-h-0 flex-none flex-col border-t border-taupe ${
          collapsed ? 'px-2 py-2.5' : 'px-3 py-2'
        }`}
      >
        <StaffReturnLink collapsed={collapsed} onNavigate={onNavigate} />
        {collapsed ? (
          <button
            type="button"
            onClick={onExpand}
            aria-label="Contact the clinic"
            className="group relative mx-auto flex h-10 w-10 items-center justify-center rounded-input text-bronze-700 transition duration-150 ease-out hover:bg-cream-200/60"
          >
            <PhoneIcon />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-input bg-night px-2.5 py-1.5 text-xs text-oncolor opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100"
            >
              Contact the clinic
            </span>
          </button>
        ) : (
          <ClinicContactPanel />
        )}

        {/* The account row. `shrink-0`, and the last thing in a band that is
            never squeezed, so it is on screen whatever the contact card is
            doing.

            The name and avatar are a SECOND ROUTE into Account & privacy,
            beside the nav item — a patient looking for their own details
            reaches for their own name, and the row previously looked
            interactive and did nothing. Sign out is a SIBLING of that link,
            not a child of it: a button inside an anchor is invalid markup and
            gives one control two behaviours, so a stray click signs someone
            out when they meant to open their account. */}
        {user && !collapsed && (
          <div className="mt-2 flex shrink-0 items-center gap-1">
            <Link
              to="/account"
              onClick={onNavigate}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-input px-1 py-1.5 transition-colors duration-150 ease-out hover:bg-cream-200/60"
            >
              <Avatar name={user.displayName} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-espresso">{user.displayName}</span>
              <span className="sr-only">Account and privacy</span>
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="shrink-0 rounded-input px-2.5 py-1.5 text-xs font-medium text-taupe-900 transition duration-150 ease-out hover:bg-cream-200/60 hover:text-espresso"
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
 * emptier than the bar did — the destinations here (Overview, results, the
 * explanation library, documents, account) are what make the shape earn
 * itself.
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
    // NO BACKGROUND ON THIS DIV, and that is deliberate. `html` already carries
    // the page colour, and this element is a descendant of body — so painting
    // `bg-cream` here drew an opaque sheet over `body::before`, which is where
    // the ambient glow lives (see globals.css). The glow was rendering
    // perfectly and being covered by the shell on every single signed-in
    // screen, which is the whole product. The comment in globals.css warns
    // about giving BODY a background; this is the same mistake one element
    // further down.
    // `print-flow` is what unpicks this layout on paper: a sticky flex
    // column is neither sticky nor a column in a paged medium, and left alone
    // it printed the content starting 288px in on every sheet. See the print
    // block at the foot of globals.css.
    <div className="print-flow min-h-viewport flex">
      {/* Sticky and exactly one viewport tall, so the panel's background runs
          edge to edge however long the page behind it is (see .h-viewport —
          100dvh with a 100vh fallback). */}
      {/* A TRANSLUCENT WASH, not an opaque surface and no longer nothing at
          all. `bg-cream-50` here drew a 288px vertical slab across the corner
          glow and put a hard seam down the side of every signed-in screen;
          removing it entirely fixed the seam by removing the panel, and the
          column then read as the same tone as the page with a title floating
          in it. `.panel-wash` is the middle answer — a panel in FRONT of the
          light source, which knocks it back without blocking it. See the note
          on --c-panel in tokens.ts for the measurements, and the one in
          globals.css for why there is no backdrop blur.
          The hairline is `panel-edge` rather than `taupe`, one step stronger,
          because it is the whole of the separation wherever the glow does not
          reach — which on a wide window is most of this column. */}
      <aside
        className={`chrome panel-wash h-viewport sticky top-0 hidden shrink-0 flex-col border-r border-panel-edge transition-[width] duration-200 ease-out md:flex print-hide ${
          collapsed ? 'w-[84px]' : 'w-[288px]'
        }`}
      >
        <SidebarContents collapsed={collapsed} onExpand={() => setCollapsed(false)} />
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-24 z-10 rounded-full border border-taupe bg-white p-1.5 text-espresso/80 shadow-card transition duration-150 ease-out hover:text-bronze"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <CollapseIcon />
        </button>
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-night/60 motion-safe:animate-fadeIn" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          {/* The drawer KEEPS its surface, unlike the desktop panel. It is a
              floating layer over the page rather than part of it, and the
              scrimmed content behind it would otherwise read straight through
              the navigation. */}
          <div
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Patient portal navigation"
            className="chrome absolute left-0 top-0 flex h-full w-[86vw] max-w-[320px] flex-col bg-cream-50 shadow-card outline-none motion-safe:animate-riseIn"
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
        {/* h-14 rather than vertical padding, and that is load-bearing: the
            results control bar pins BELOW this header, and it does so against
            `--shell-sticky-top` in globals.css, which is this number written
            down. A height derived from the padding and whatever the tallest
            child happens to be is a number that changes when somebody swaps an
            icon, and the bar would then pin a few pixels off with a strip of
            scrolling content showing through the gap. */}
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-taupe bg-cream/90 px-4 backdrop-blur md:hidden print-hide">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 rounded-input p-2 text-espresso transition duration-150 ease-out hover:bg-cream-200"
            aria-label="Open navigation menu"
          >
            <MenuIcon />
          </button>
          <Link to="/overview" aria-label="Aspire Bloods, my results" className="rounded-input">
            <Wordmark variant="light" size="sm" />
          </Link>
        </div>

        <main className="flex-1 px-5 py-10 sm:px-8 md:px-14 md:pt-12 md:pb-16 lg:px-20">
          <div className="mx-auto max-w-5xl">
            <PageTransition>{children ?? <Outlet />}</PageTransition>
          </div>
        </main>

        {/* The on-screen disclaimer footer is chrome; the printed one is the
            clinic's contact details repeating on every sheet. */}
        <Footer className="px-5 sm:px-8 md:px-14 lg:px-20 print-hide" />
        <PrintFooter />
      </div>
    </div>
  );
}
