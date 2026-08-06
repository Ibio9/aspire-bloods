/**
 * Patient-side sidebar glyphs — same 20x20 stroke language as ./icons.tsx
 * (which serves admin), drawn a touch rounder and lighter. currentColor
 * throughout so active/hover states need no per-icon handling.
 */

export function OverviewIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 17v-5h4v5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function PanelsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 8h15" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 8v8.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function MarkersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M3 5.5h14M3 10h14M3 14.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="16" cy="14.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function TrendsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M3 3v13.5h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 12.5 9 8.5l2.5 2.5L16 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LibraryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M10 5.5C8.6 4.2 6.8 3.5 4 3.5v11c2.8 0 4.6.7 6 2 1.4-1.3 3.2-2 6-2v-11c-2.8 0-4.6.7-6 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 5.5v11" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function DocumentsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M6 2.5h5l4 4V16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M11 2.5V6.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 9v4.5m0 0L8.3 11.8M10 13.5l1.7-1.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AccountIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M10 2.5 4.5 4.6v4.7c0 3.5 2.2 6.1 5.5 7.2 3.3-1.1 5.5-3.7 5.5-7.2V4.6L10 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="10" cy="8.5" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 13.4c.6-1.2 1.7-1.8 3-1.8s2.4.6 3 1.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function PhoneIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M5.2 2.5 6.6 5 5.4 6.4c.6 1.5 1.7 2.6 3.2 3.2L10 8.4l2.5 1.4v2.4c0 .7-.6 1.2-1.3 1.1C6.5 12.8 3.2 9.5 2.6 4.8 2.5 4.1 3 3.5 3.7 3.5h1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MailIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="m2.5 4.5 5.5 4 5.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M8 14.5s5-4.2 5-7.6A5 5 0 0 0 3 6.9c0 3.4 5 7.6 5 7.6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="6.8" r="1.7" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function ArrowRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M3 8h9.5M9 4.5 12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
