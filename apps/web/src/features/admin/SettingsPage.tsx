import { Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../lib/AuthContext';
import { lazyPage } from '../../lib/lazyPage';
import { ConsolePage, ConsoleSection } from './ConsolePage';
import { BackupStatusSection } from './BackupStatusSection';

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
    >
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SETTINGS — WHAT YOU CONFIGURE OR LOOK UP, RATHER THAN WORK THROUGH.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Five things that had five sidebar entries between them and were opened, in
 * total, a few times a year: the audit log, the ingestion log, the package
 * catalogue, the marker library and the backup state. Nine peers in a
 * navigation is an index rather than a navigation, and six of the nine were
 * these — so the three screens a clinician opens every day were outnumbered two
 * to one by screens nobody opens in an ordinary month.
 *
 * ONE PAGE, FIVE DISCLOSURES. Not five routes behind a submenu, which is the
 * same nine entries one press further away.
 *
 * ── NOTHING WAS REWRITTEN TO GET HERE ─────────────────────────────────────
 *
 * Each section mounts the component that used to be the page, unchanged, inside
 * `ConsoleSection` — which is a context that tells `ConsolePage` to render its
 * children without a heading or a purpose line. Two page titles on one page is
 * the thing this restructure exists to remove, and threading an `embedded` prop
 * through three branches of five files is the version of it that gets forgotten
 * in whichever branch nobody looks at.
 *
 * ── AND THE CHUNKS ARE STILL SPLIT ────────────────────────────────────────
 *
 * Each section's component is behind `lazyPage`, so opening Settings does NOT
 * pull the marker library, the audit log and the ingestion log into one
 * download — a section's code arrives when somebody opens that section and not
 * before. Importing all five eagerly here would undo five lazy boundaries at
 * once and be invisible in the entry size, which is exactly the failure mode
 * recorded against `manualChunks` in CLAUDE.md.
 *
 * ── THE DEEP LINKS STILL WORK ─────────────────────────────────────────────
 *
 * `/admin/audit-log`, `/admin/ingestion-log`, `/admin/panels` and
 * `/admin/markers` are in bookmarks and in at least one server-side error
 * message, so they redirect here with a hash and the matching section opens
 * itself. A redirect that lands somebody on a page of shut disclosures answers
 * "where is the ingestion log" with "somewhere under one of these".
 */

const PanelsPage = lazyPage(() => import('./PanelsPage'), 'PanelsPage');
const AdminMarkerLibraryPage = lazyPage(() => import('./AdminMarkerLibraryPage'), 'AdminMarkerLibraryPage');
const IngestionLogPage = lazyPage(() => import('./IngestionLogPage'), 'IngestionLogPage');
const AuditLogPage = lazyPage(() => import('./AuditLogPage'), 'AuditLogPage');

interface SettingsSection {
  id: string;
  label: string;
  adminOnly?: boolean;
  /** Open on arrival, with no hash. Exactly one section is. */
  defaultOpen?: boolean;
  render: () => JSX.Element;
}

/**
 * "EDIT PACKAGES", NOT "PANELS" (Aug 2026). The clinic sells packages; "panel"
 * is what the laboratory and this codebase call the same object, and a
 * navigation label is written in the reader's vocabulary rather than the
 * schema's. The route, the table and the API are untouched.
 */
const SECTIONS: SettingsSection[] = [
  { id: 'packages', label: 'Edit packages', render: () => <PanelsPage /> },
  { id: 'markers', label: 'Marker library', render: () => <AdminMarkerLibraryPage /> },
  { id: 'ingestion-log', label: 'Ingestion log', adminOnly: true, render: () => <IngestionLogPage /> },
  { id: 'audit-log', label: 'Audit log', adminOnly: true, render: () => <AuditLogPage /> },
  // LAST AND OPEN. Everything above is something somebody came here to change;
  // this is the one thing on the page nobody would think to come and look at,
  // and its whole failure mode is being silently absent. A backup state behind
  // a shut disclosure is a backup state nobody reads.
  { id: 'backup', label: 'Backup status', adminOnly: true, defaultOpen: true, render: () => <BackupStatusSection /> },
];

function SectionDisclosure({
  section,
  open,
  onToggle,
}: {
  section: SettingsSection;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = `settings-${section.id}`;
  return (
    <section id={section.id} className="border-b border-taupe">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-4 rounded-input py-5 text-left transition-colors duration-150 ease-out hover:text-bronze-700"
        >
          <span className="section-heading text-lg">{section.label}</span>
          <ChevronIcon open={open} />
        </button>
      </h2>
      {/* UNMOUNTED WHEN SHUT, not hidden. These are whole screens with their own
          queries; keeping four of them mounted behind a `display: none` would
          fire four API calls on arrival at a page somebody opened to change one
          package name. */}
      {open && (
        <div id={panelId} className="pb-10">
          <Suspense
            fallback={
              <div>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="mt-3 h-4 w-72" />
              </div>
            }
          >
            <ConsoleSection>{section.render()}</ConsoleSection>
          </Suspense>
        </div>
      )}
    </section>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const { hash } = useLocation();
  const sections = SECTIONS.filter((s) => !s.adminOnly || user?.role === 'ADMIN');

  const [open, setOpen] = useState<Set<string>>(
    () => new Set(SECTIONS.filter((s) => s.defaultOpen).map((s) => s.id)),
  );

  // A hash opens its section and leaves whatever else is open alone — arriving
  // from a redirect should not shut something the reader had opened.
  useEffect(() => {
    const id = hash.replace(/^#/, '');
    if (!id) return;
    if (!SECTIONS.some((s) => s.id === id)) return;
    setOpen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, [hash]);

  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  return (
    <ConsolePage title="Settings">
      <div className="mt-10 border-t border-taupe">
        {sections.map((section) => (
          <SectionDisclosure
            key={section.id}
            section={section}
            open={open.has(section.id)}
            onToggle={() => toggle(section.id)}
          />
        ))}
      </div>
    </ConsolePage>
  );
}
