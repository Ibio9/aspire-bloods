import { NO_STATUS_LABEL, type MarkerStatusInput } from '@aspire-bloods/shared';
import { statusToken } from '../../lib/markerCopy';

/**
 * Shape-distinct icons — status must read correctly in greyscale, color is
 * reinforcement only.
 *
 * The viewBox is fixed at 16 and only the rendered SIZE varies, so a chevron at
 * the lead size is the same chevron drawn larger rather than a second drawing
 * with its own stroke weight.
 */
function StatusIcon({ icon, color, size }: { icon: string; color: string; size: number }) {
  const stroke = color;
  const box = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true as const, className: 'shrink-0' };
  switch (icon) {
    case 'dash':
      return (
        <svg {...box}>
          <rect x="3" y="7" width="10" height="2" rx="1" fill={stroke} />
        </svg>
      );
    case 'chevron-up':
      return (
        <svg {...box}>
          <path d="M3 10 L8 5 L13 10" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'chevron-down':
      return (
        <svg {...box}>
          <path d="M3 6 L8 11 L13 6" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'chevron-double-up':
      return (
        <svg {...box}>
          <path d="M3 9 L8 4 L13 9" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 13 L8 8 L13 13" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'chevron-double-down':
      return (
        <svg {...box}>
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
/**
 * TWO SIZES, AND THE SECOND ONE IS THE MARKER PAGE'S ANSWER (Aug 2026).
 *
 * `lead` is used in exactly one place: directly under the hero value on a
 * marker's own page, where the status was the same 14px label it is on a card
 * in a grid of forty. On a page whose entire subject is one result, "where does
 * this sit" was the quietest sentence on the screen.
 *
 * At `lead` it is the reading step (18px) with a 22px glyph — a step below the
 * marker's own name and a long way below the value, so the ladder is still
 * value → name → status and nothing has been inverted. The extra room around it
 * is the caller's, because only the caller knows what is above and below.
 */
const SIZES = {
  default: { text: 'text-sm', glyph: 16 },
  lead: { text: 'text-reading', glyph: 22 },
} as const;

export function StatusBadge({
  status,
  size = 'default',
  className = '',
}: {
  status: MarkerStatusInput;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const token = statusToken(status);
  const { text, glyph } = SIZES[size];
  if (!token) {
    return <span className={`inline-flex items-center ${text} text-espresso/80 ${className}`}>{NO_STATUS_LABEL}</span>;
  }
  // The theme-aware custom property rather than the light-mode hex: the same
  // label has to stay AA on cream and on a warm near-black. `currentColor` in
  // the icon then follows it without a second lookup.
  return (
    <span className={`inline-flex items-center gap-2 ${text} font-medium ${className}`} style={{ color: token.cssVar }}>
      <StatusIcon icon={token.icon} color="currentColor" size={glyph} />
      {token.label}
    </span>
  );
}
