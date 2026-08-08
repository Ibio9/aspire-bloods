import { status as statusTokens, formatOptimalRange, type MarkerStatus, type OptimalRangeDTO } from '@aspire-bloods/shared';
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

/** The theme-aware colour for a status label or icon. Prefer this over statusHex anywhere it lands on a live element. */
export function statusColor(status: MarkerStatus): string {
  return statusTokens[STATUS_KEY[status]].cssVar;
}

/**
 * The Part One surface wash, as a Tailwind class.
 *
 * Deliberately a background utility and nothing else. The card keeps its taupe
 * border, its espresso text and its ordinary shadow; only the fill changes.
 * Status is still carried first by the shape (level mark / chevron / doubled
 * chevron) and by the word beside it — strip every colour off the page and the
 * result reads exactly the same. The tint is reinforcement for the majority of
 * people who scan a page of results by colour before they read any of it.
 */
const STATUS_TINT_CLASS: Record<MarkerStatus, string> = {
  IN_RANGE: 'bg-tint-inRange',
  HIGH: 'bg-tint-high',
  LOW: 'bg-tint-low',
  SIGNIFICANT_HIGH: 'bg-tint-significantHigh',
  SIGNIFICANT_LOW: 'bg-tint-significantLow',
};

export function statusTintClass(status: MarkerStatus): string {
  return STATUS_TINT_CLASS[status];
}

/** The stronger fill, for the category summary bars where a 12% wash would simply vanish. */
const STATUS_BAR_CLASS: Record<MarkerStatus, string> = {
  IN_RANGE: 'bg-tint-inRange-bar',
  HIGH: 'bg-tint-high-bar',
  LOW: 'bg-tint-low-bar',
  SIGNIFICANT_HIGH: 'bg-tint-significantHigh-bar',
  SIGNIFICANT_LOW: 'bg-tint-significantLow-bar',
};

/**
 * A hatch pattern per status, layered over the bar fill.
 *
 * Three tints sitting edge to edge in a bar is the one place in the product
 * where colour is doing real comparative work, so it cannot be the only thing
 * separating them. In range is flat, out of range is hatched, significantly
 * out is densely hatched — a legible ramp in greyscale and to a colourblind
 * reader, on top of the accessible text label the bar already carries.
 */
const STATUS_BAR_PATTERN: Record<MarkerStatus, string> = {
  IN_RANGE: '',
  HIGH: 'bg-hatch-open',
  LOW: 'bg-hatch-open',
  SIGNIFICANT_HIGH: 'bg-hatch-dense',
  SIGNIFICANT_LOW: 'bg-hatch-dense',
};

export function statusBarClass(status: MarkerStatus): string {
  return `${STATUS_BAR_CLASS[status]} ${STATUS_BAR_PATTERN[status]}`.trim();
}

/**
 * The optimal-range vocabulary, and the whole of it.
 *
 * Two words, deliberately: "within optimal" and "outside optimal". They sit
 * beside the lab range's own verdict (in range / high / low / significantly
 * out) and never merge with it — a result can be in range and outside optimal
 * at the same time, and that combination is ordinary rather than a problem.
 *
 * Nothing here says good, bad, healthy, unhealthy, concerning, or "you
 * should". An optimal range is context, not an instruction.
 */
export function optimalStatusLabel(optimal: OptimalRangeDTO | null | undefined): string | null {
  if (!optimal || optimal.within === null) return null;
  return optimal.within ? 'Within optimal' : 'Outside optimal';
}

/** "Optimal 50–125 nmol/L" — the band itself, always labelled so it can't be read as the lab's. */
export function optimalRangeLabel(optimal: OptimalRangeDTO | null | undefined): string | null {
  if (!optimal) return null;
  const band = formatOptimalRange(optimal.low, optimal.high, optimal.unit);
  return band ? `Optimal ${band}` : null;
}

/**
 * Filters for the results and all-markers screens.
 *
 * Three broad groups first, because "show me the ones that need a look" is the
 * question almost everyone actually has — then the four individual states
 * underneath, for the smaller number of people who want to separate a mildly
 * high result from a significantly high one. Both grains, in one control,
 * rather than a coarse filter that can't answer the second question.
 */
export const STATUS_FILTERS = [
  { value: 'ALL', label: 'All markers', group: 'broad' },
  { value: 'IN_RANGE', label: 'In the usual range', group: 'broad' },
  { value: 'ATTENTION', label: 'Outside the usual range', group: 'broad' },
  { value: 'HIGH', label: 'Above range', group: 'specific' },
  { value: 'LOW', label: 'Below range', group: 'specific' },
  { value: 'SIGNIFICANT_HIGH', label: 'Significantly above range', group: 'specific' },
  { value: 'SIGNIFICANT_LOW', label: 'Significantly below range', group: 'specific' },
] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

export function matchesStatusFilter(status: MarkerStatus, filter: StatusFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'IN_RANGE') return status === 'IN_RANGE';
  if (filter === 'ATTENTION') return status !== 'IN_RANGE';
  return status === filter;
}

/**
 * The count beside each option in the status filter, all seven in a single
 * pass over the markers.
 *
 * The report and All-markers pickers used to recompute this inline —
 * `markers.filter(matchesStatusFilter).length` for every one of the seven
 * options, on every render, so a 350-marker report re-ran ~2,450 predicate
 * calls on each keystroke in the search box. One pass, memoised by the caller.
 */
export function statusFilterCounts(markers: { status: MarkerStatus }[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    ALL: markers.length,
    IN_RANGE: 0,
    ATTENTION: 0,
    HIGH: 0,
    LOW: 0,
    SIGNIFICANT_HIGH: 0,
    SIGNIFICANT_LOW: 0,
  };
  for (const { status } of markers) {
    if (status === 'IN_RANGE') {
      counts.IN_RANGE += 1;
    } else {
      // Everything not in range counts toward the broad ATTENTION group, and
      // toward its own specific filter — each of HIGH / LOW / SIGNIFICANT_HIGH /
      // SIGNIFICANT_LOW is itself a StatusFilter value.
      counts.ATTENTION += 1;
      counts[status] += 1;
    }
  }
  return counts;
}

/**
 * Name search that also matches abbreviations.
 *
 * "ALT" has to find Alanine Aminotransferase and "TSH" has to find Thyroid
 * Stimulating Hormone — which is most of the point of a search box on a page
 * of 180 analytes, since the abbreviation is the only name most people know.
 * The catalogue carries those on the marker as `aliases`; this matches the
 * name and every alias alike.
 *
 * Punctuation is stripped from both sides before comparing, so "hs-CRP",
 * "hsCRP" and "hs crp" are one query rather than three. Deliberately a plain
 * substring test and not a fuzzy one: a filter that quietly shows you things
 * you didn't ask for is worse than one that shows you nothing, because on this
 * page "nothing" is a legible answer and "something adjacent" is a wrong one.
 */
function searchNormalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function matchesMarkerQuery(marker: { name: string; aliases?: string[] }, query: string): boolean {
  const q = searchNormalise(query);
  if (!q) return true;
  if (searchNormalise(marker.name).includes(q)) return true;
  return (marker.aliases ?? []).some((a) => searchNormalise(a).includes(q));
}

/**
 * "3 of 42 markers" / "No markers match" — one phrasing for every filtered
 * list, so the count under the results grid and the count under All markers
 * can't drift into two different sentences.
 */
export function filterCountLabel(shown: number, total: number): string {
  if (total === 0) return 'No markers';
  if (shown === total) return `${total} marker${total === 1 ? '' : 's'}`;
  return `${shown} of ${total} marker${total === 1 ? '' : 's'}`;
}

/** Generic version, for the non-measured sections where the noun isn't "marker". */
export function filterCountLabelFor(shown: number, total: number, noun: string, plural = `${noun}s`): string {
  if (total === 0) return `No ${plural}`;
  if (shown === total) return `${total} ${total === 1 ? noun : plural}`;
  return `${shown} of ${total} ${total === 1 ? noun : plural}`;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * The three orders a page of results can be read in, shared by the report view
 * and All markers so the two behave identically.
 *
 * HEALTH_AREA is the default on a report because a Signature panel is 150
 * analytes and an unbroken alphabetical wall of them is not a document anyone
 * reads — under headings it becomes twenty short lists about twenty different
 * things. STATUS answers the only other question this page reliably gets.
 */
export const RESULT_SORTS = [
  { value: 'HEALTH_AREA', label: 'Health area' },
  { value: 'NAME', label: 'Name (A–Z)' },
  { value: 'STATUS', label: 'Needs attention first' },
] as const;

export type ResultSort = (typeof RESULT_SORTS)[number]['value'];

/** Out of range sorts above in range; significantly out sorts above mildly out. */
export const ATTENTION_RANK: Record<MarkerStatus, number> = {
  SIGNIFICANT_HIGH: 0,
  SIGNIFICANT_LOW: 0,
  HIGH: 1,
  LOW: 1,
  IN_RANGE: 2,
};

export function byAttentionThenName<T extends { status: MarkerStatus; name: string }>(a: T, b: T): number {
  return ATTENTION_RANK[a.status] - ATTENTION_RANK[b.status] || a.name.localeCompare(b.name);
}

/**
 * Markers under health-area headings.
 *
 * A marker legitimately belongs to several areas (one Albumin record in four
 * of them, never four Albumin records), so it appears under each — which is
 * the honest rendering of a many-to-many relationship and the reason both
 * this and the summary bars say the areas overlap. The distinct count is what
 * the count label reports, so "24 markers" never becomes "38 markers" just
 * because the reader chose to group them.
 *
 * Anything whose categories didn't come through still renders, in a final
 * group of its own. A result that exists but has nowhere to go is the one
 * outcome worse than an extra heading.
 */
export interface MarkerGroup<T> {
  key: string;
  name: string;
  markers: T[];
}

export function groupByHealthArea<T extends { categoryKeys?: string[]; name: string }>(
  markers: T[],
  categories: { key: string; name: string }[],
  sortWithin: (a: T, b: T) => number = (a, b) => a.name.localeCompare(b.name),
): MarkerGroup<T>[] {
  const groups: MarkerGroup<T>[] = [];
  const placed = new Set<T>();

  for (const c of categories) {
    const members = markers.filter((m) => (m.categoryKeys ?? []).includes(c.key));
    if (members.length === 0) continue;
    members.forEach((m) => placed.add(m));
    groups.push({ key: c.key, name: c.name, markers: [...members].sort(sortWithin) });
  }

  const ungrouped = markers.filter((m) => !placed.has(m));
  if (ungrouped.length > 0) {
    groups.push({ key: '__other', name: 'Other markers', markers: [...ungrouped].sort(sortWithin) });
  }
  return groups;
}
