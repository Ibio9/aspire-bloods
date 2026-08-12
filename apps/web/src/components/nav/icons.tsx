/** Minimal 20x20 stroke icons, one shared visual language across the sidebar — deliberately not an
 * icon library dependency for a handful of glyphs. currentColor throughout so active/hover states
 * just work.
 *
 * Every admin nav destination has its own glyph. Three of them (audit log, ingestion log and the
 * old Randox catalogue screen) used to share the single AuditIcon shield, which made the bottom
 * third of the sidebar read as one repeated item — and an icon that doesn't distinguish is worse
 * than no icon, because it actively suggests the rows are the same thing. */

/** A work list: three rows, the top one marked. Not a clock — the queue is a
 * list somebody clears, and a clock glyph beside "Work queue" reads as a
 * scheduling screen. */
export function QueueIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M3 5.5h3M3 10h3M3 14.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8.5 5.5H17M8.5 10h6M8.5 14.5h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ReportsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M6 2.5h6l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 2.5V6h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7.5 10.5h5M7.5 13h5M7.5 8h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function PatientsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <circle cx="7.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.75 16c.5-3 2.4-4.5 4.75-4.5s4.25 1.5 4.75 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14" cy="7" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M13 11.75c1.9.2 3.3 1.6 3.7 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Audit log — a clock turned back on itself. This is a *history*: what was done
 * and when. The shield it replaces said "security", which is the reason the log
 * exists rather than the thing the screen shows.
 */
export function AuditIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3.2 8.2A7 7 0 1 1 3 10.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M2.6 4.6v3.8h3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 6.6V10l2.4 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Ingestion log — results arriving from outside, landing in a tray. An inbound
 * arrow, not a shield: what this screen records is an import, successful or not.
 */
export function IngestionIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M10 2.5v7.5m0 0L7.2 7.4M10 10l2.8-2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M3 11.5h3.4l1 2h5.2l1-2H17v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Result linking — deciding whose results these are. Two rings joined: the join is the action. */
export function LinkingIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8.4 11.6 6.2 13.8a2.9 2.9 0 0 1-4.1-4.1l2.2-2.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.6 8.4l2.2-2.2a2.9 2.9 0 0 1 4.1 4.1l-2.2 2.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7.6 12.4l4.8-4.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Panels — a test level is a stack of markers sold as one thing. Layers, not tiles. */
export function PanelsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="m10 2.5 7 3.2-7 3.2-7-3.2 7-3.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="m3 10 7 3.2 7-3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m3 14.2 7 3.2 7-3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Marker library — the analyte catalogue and the wording that explains it. A labelled vial. */
export function MarkerLibraryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M7.5 2.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M8.5 2.5v4.2L5.2 14a2 2 0 0 0 1.8 3h6a2 2 0 0 0 1.8-3l-3.3-7.3V2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M6.6 11.5h6.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Back to the admin console, shown in the patient portal to a signed-in member
 * of staff. A console of controls — deliberately not a shield or a key: this is
 * a navigation affordance, and nothing about it grants anything.
 */
export function AdminConsoleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M3 6h5.5M11.5 6H17M3 14h5.5M11.5 14H17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10" cy="6" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="14" r="1.8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M13.5 13.5 10.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function MenuIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function CollapseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.5 2.5v11" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.3 8h0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Both shells' mobile drawers close with this — shared rather than living in patientIcons. */
export function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
