import { status as statusTokens, type MarkerStatus } from '@aspire-bloods/shared';

const STATUS_MAP: Record<MarkerStatus, keyof typeof statusTokens> = {
  IN_RANGE: 'inRange',
  HIGH: 'high',
  LOW: 'low',
  SIGNIFICANT_HIGH: 'significantHigh',
  SIGNIFICANT_LOW: 'significantLow',
};

/** Shape-distinct icons — status must read correctly in greyscale, color is reinforcement only. */
function StatusIcon({ icon, color }: { icon: string; color: string }) {
  const stroke = color;
  switch (icon) {
    case 'dash':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="7" width="10" height="2" rx="1" fill={stroke} />
        </svg>
      );
    case 'chevron-up':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 10 L8 5 L13 10" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'chevron-down':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 6 L8 11 L13 6" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'chevron-double-up':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 9 L8 4 L13 9" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 13 L8 8 L13 13" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'chevron-double-down':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3 L8 8 L13 3" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 7 L8 12 L13 7" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

export function StatusBadge({ status, className = '' }: { status: MarkerStatus; className?: string }) {
  const key = STATUS_MAP[status];
  const token = statusTokens[key];
  // The theme-aware custom property rather than the light-mode hex: the same
  // label has to stay AA on cream and on a warm near-black. `currentColor` in
  // the icon then follows it without a second lookup.
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${className}`} style={{ color: token.cssVar }}>
      <StatusIcon icon={token.icon} color="currentColor" />
      {token.label}
    </span>
  );
}
