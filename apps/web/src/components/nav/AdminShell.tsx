import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { AccountMenu } from '../AccountMenu';
import { CommandPalette } from './CommandPalette';
import { PageTransition } from '../PageTransition';
import { useAuth } from '../../lib/AuthContext';
import { ReportsIcon, PatientsIcon, ContentIcon, AuditIcon, SearchIcon, MenuIcon, CollapseIcon } from './icons';

const COLLAPSE_KEY = 'aspire_admin_sidebar_collapsed';

interface NavItem {
  to: string;
  label: string;
  icon: (props: React.SVGProps<SVGSVGElement>) => JSX.Element;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Reports & entry', icon: ReportsIcon },
  { to: '/admin/patients', label: 'Patients', icon: PatientsIcon },
  { to: '/admin/content', label: 'Panels & content', icon: ContentIcon },
  { to: '/admin/audit-log', label: 'Audit log', icon: AuditIcon, adminOnly: true },
  { to: '/admin/ingestion-log', label: 'Ingestion log', icon: AuditIcon, adminOnly: true },
];

function SidebarLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-input px-3 py-2.5 text-sm transition-colors duration-150 ease-out ${
          isActive ? 'bg-bronze-50 font-semibold text-bronze-700' : 'font-medium text-espresso/80 hover:bg-cream-200 hover:text-espresso'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* Active state is marked by this bar AND the weight/background/colour shift above —
              never colour alone (brief). */}
          <span
            aria-hidden="true"
            className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-bronze transition-opacity duration-150 ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <Icon className="shrink-0" />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {collapsed && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-input bg-espresso px-2.5 py-1.5 text-xs text-cream opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100"
            >
              {item.label}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function SidebarContents({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { user } = useAuth();
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === 'ADMIN');

  return (
    <nav aria-label="Admin navigation" className="flex h-full flex-col gap-1 p-3">
      <Link
        to="/"
        className={`mb-4 flex items-center gap-2 px-2 py-2 font-display italic text-bronze ${collapsed ? 'justify-center text-xl' : 'text-2xl'}`}
      >
        {collapsed ? 'A' : 'Aspire'}
      </Link>
      {items.map((item) => (
        <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
      {user?.hasPatientProfile && (
        <>
          <div className="my-2 border-t border-taupe" />
          <SidebarLink item={{ to: '/my-results', label: 'My results', icon: ReportsIcon }} collapsed={collapsed} onNavigate={onNavigate} />
        </>
      )}
    </nav>
  );
}

function AdminTopBar({ onOpenSearch, onOpenDrawer }: { onOpenSearch: () => void; onOpenDrawer: () => void }) {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between border-b border-taupe bg-cream/90 px-4 py-3 backdrop-blur md:px-8">
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
          className="hidden items-center gap-2 rounded-input border border-taupe bg-white px-3 py-1.5 text-sm text-espresso/60 transition duration-150 ease-out hover:border-bronze/60 md:flex"
        >
          <SearchIcon />
          <span>Search patients…</span>
          <span className="ml-6 rounded border border-taupe px-1.5 py-0.5 text-xs text-espresso/50">⌘K</span>
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
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

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
    <div className="flex min-h-screen bg-cream">
      {/* Desktop persistent sidebar */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r border-taupe bg-cream-50 transition-[width] duration-200 ease-out md:block ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        <SidebarContents collapsed={collapsed} />
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-taupe bg-white p-2 text-espresso/70 shadow-card transition duration-150 ease-out hover:text-bronze"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <CollapseIcon />
        </button>
      </aside>

      {/* Mobile slide-over drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-espresso/50 motion-safe:animate-fadeIn" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 top-0 h-full w-72 bg-cream-50 shadow-card motion-safe:animate-riseIn">
            <SidebarContents collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <AdminTopBar onOpenSearch={() => setSearchOpen(true)} onOpenDrawer={() => setDrawerOpen(true)} />
        <main className="flex-1 px-6 py-12 md:px-12 md:py-20">
          <div className="mx-auto max-w-6xl">
            <PageTransition>{children ?? <Outlet />}</PageTransition>
          </div>
        </main>
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
