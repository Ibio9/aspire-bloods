import { status as statusTokens, type MarkerStatus } from '@aspire-bloods/shared';
import type { MarkerMovement } from './patientPortal';

/**
 * Every sentence the portal puts next to a number that moved. Kept in one
 * place because the constraint on all of it is the same and easy to breach
 * one card at a time: describe the movement, never interpret it. "Moved into
 * the usual range" is an observation; "improved" is a clinical judgement, and
 * this portal doesn't make those.
 *
 * "Usual range" rather than "normal range" throughout — a result outside the
 * reference interval is common and rarely abnormal, and "normal" quietly
 * tells someone the opposite.
 */

export interface MovementCopy {
  /** Short label for the card. */
  label: string;
  /** Whether this is movement toward or away from the reference range — drives the icon direction, never a colour on its own. */
  tone: 'toward' | 'away' | 'neutral';
}

export const MOVEMENT_COPY: Record<MarkerMovement, MovementCopy> = {
  MOVED_INTO_RANGE: { label: 'Now within the usual range', tone: 'toward' },
  MOVED_OUT_OF_RANGE: { label: 'Now outside the usual range', tone: 'away' },
  CLOSER_TO_RANGE: { label: 'Closer to the usual range', tone: 'toward' },
  FURTHER_FROM_RANGE: { label: 'Further from the usual range', tone: 'away' },
  CHANGED_WITHIN_RANGE: { label: 'Changed, still within the usual range', tone: 'neutral' },
};

const STATUS_KEY: Record<MarkerStatus, keyof typeof statusTokens> = {
  IN_RANGE: 'inRange',
  HIGH: 'high',
  LOW: 'low',
  SIGNIFICANT_HIGH: 'significantHigh',
  SIGNIFICANT_LOW: 'significantLow',
};

export function statusLabel(status: MarkerStatus): string {
  return statusTokens[STATUS_KEY[status]].label;
}

export function statusHex(status: MarkerStatus): string {
  return statusTokens[STATUS_KEY[status]].hex;
}

/** Filter groups for the All markers screen — five statuses is too fine a grain to filter by. */
export const STATUS_FILTERS = [
  { value: 'ALL', label: 'All markers' },
  { value: 'IN_RANGE', label: 'In the usual range' },
  { value: 'ATTENTION', label: 'Outside the usual range' },
] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

export function matchesStatusFilter(status: MarkerStatus, filter: StatusFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'IN_RANGE') return status === 'IN_RANGE';
  return status !== 'IN_RANGE';
}
