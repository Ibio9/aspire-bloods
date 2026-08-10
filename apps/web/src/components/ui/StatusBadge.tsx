import { NO_STATUS_LABEL, type MarkerStatusInput } from '@aspire-bloods/shared';
import { statusToken } from '../../lib/markerCopy';

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

/**
 * No status is a real, expected input, not a missing prop.
 *
 * A result with no position on its reference range gets the words and nothing
 * else: no chevron, no level mark, no doubled mark, and no status colour. Every
 * one of those is a claim about where the value sits, and the whole point is
 * that nobody knows. Ordinary body colour, ordinary weight — it reads as a note
 * about the record rather than as a sixth state in the traffic light.
 *
 * "No status" is decided by `statusToken`, NOT by `status === null`. That
 * distinction is the bug this component shipped with: a payload whose `status`
 * key is absent arrives as `undefined`, which is not `null`, so it walked
 * straight past the guard into `statusTokens[STATUS_MAP[undefined]]` — a
 * `Record` lookup that returns `undefined` rather than throwing, so the actual
 * TypeError landed one line later on `.cssVar` and named this component with no
 * hint that the cause was a missing field. The same held for any status string
 * outside the five. Both are absence, and both now render as absence.
 */
export function StatusBadge({ status, className = '' }: { status: MarkerStatusInput; className?: string }) {
  const token = statusToken(status);
  if (!token) {
    return <span className={`inline-flex items-center text-sm text-espresso/80 ${className}`}>{NO_STATUS_LABEL}</span>;
  }
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
