import {
  status as statusTokens,
  asMarkerStatus,
  brand,
  formatOptimalRange,
  NO_STATUS_LABEL,
  type MarkerStatus,
  type MarkerStatusInput,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
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

/**
 * Status → design token, and the five lookups built on it.
 *
 * All five are TOTAL: absence of a status is an input, not a bug, and each of
 * them has an answer for it. They used to index this record directly with
 * whatever the payload carried, which is not a lookup so much as an assertion
 * that the wire agrees with the type. When it didn't, `statusTokens[undefined]`
 * came back `undefined` and the throw landed one property later — on `.cssVar`
 * or `.label`, inside StatusBadge or a chart, several frames from the cause.
 *
 * What absence resolves to, in every case, is "no traffic light": the ordinary
 * body colour, the words `NO_STATUS_LABEL`, and no tint class at all. Never a
 * sixth state, never a default onto one of the five.
 */
const STATUS_KEY: Record<MarkerStatus, keyof typeof statusTokens> = {
  IN_RANGE: 'inRange',
  HIGH: 'high',
  LOW: 'low',
  SIGNIFICANT_HIGH: 'significantHigh',
  SIGNIFICANT_LOW: 'significantLow',
};

/** The token for a status, or null where there isn't one. Every lookup below goes through this. */
export function statusToken(status: MarkerStatusInput): (typeof statusTokens)[keyof typeof statusTokens] | null {
  const known = asMarkerStatus(status);
  return known ? statusTokens[STATUS_KEY[known]] : null;
}

export function statusLabel(status: MarkerStatusInput): string {
  return statusToken(status)?.label ?? NO_STATUS_LABEL;
}

export function statusHex(status: MarkerStatusInput): string {
  return statusToken(status)?.hex ?? brand.espresso;
}

/** The theme-aware colour for a status label or icon. Prefer this over statusHex anywhere it lands on a live element. */
export function statusColor(status: MarkerStatusInput): string {
  // Ordinary body colour for absence — the same thing StatusBadge already
  // renders the words in, so a statusless label reads as a note about the
  // record rather than as a state.
  return statusToken(status)?.cssVar ?? 'rgb(var(--c-espresso))';
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

/** No wash where there is no status: the card keeps the ordinary cream surface. */
export function statusTintClass(status: MarkerStatusInput): string {
  const known = asMarkerStatus(status);
  return known ? STATUS_TINT_CLASS[known] : '';
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

export function statusBarClass(status: MarkerStatusInput): string {
  const known = asMarkerStatus(status);
  // A bar is a proportion of things that WERE compared against a range, so a
  // statusless row has no segment in it (see countable). Returning nothing is
  // therefore the honest answer rather than a fallback.
  if (!known) return '';
  return `${STATUS_BAR_CLASS[known]} ${STATUS_BAR_PATTERN[known]}`.trim();
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

/**
 * A result with no status matches "All markers" and nothing else.
 *
 * It is not in range, and it is not outside the range either — no comparison
 * was made. `status !== 'IN_RANGE'` used to be how "outside the range" was
 * spelled, which quietly swept every statusless result into the list of things
 * a patient is being told to look at.
 */
export function matchesStatusFilter(status: MarkerStatusInput, filter: StatusFilter): boolean {
  if (filter === 'ALL') return true;
  // Narrowed rather than `status === null`, so a status the client has no entry
  // for is treated as no status here too. Otherwise `!== 'IN_RANGE'` would file
  // it under "outside the usual range" — telling a patient to look at a result
  // on the strength of a value we could not read.
  const known = asMarkerStatus(status);
  if (known === null) return false;
  if (filter === 'IN_RANGE') return known === 'IN_RANGE';
  if (filter === 'ATTENTION') return known !== 'IN_RANGE';
  return known === filter;
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
export function statusFilterCounts(markers: { status: MarkerStatusInput }[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    ALL: markers.length,
    IN_RANGE: 0,
    ATTENTION: 0,
    HIGH: 0,
    LOW: 0,
    SIGNIFICANT_HIGH: 0,
    SIGNIFICANT_LOW: 0,
  };
  for (const raw of markers) {
    const status = asMarkerStatus(raw.status);
    // Counted toward ALL (it is a marker on the page) and toward nothing else.
    // A statusless result belongs in neither the in-range tally nor the
    // needs-attention one, and putting it in either is a claim about it.
    // Narrowed first, because `counts[status] += 1` on an unrecognised value
    // adds a key that is not a StatusFilter and reads back as NaN in the
    // picker — "Above range (NaN)".
    if (status === null) {
      continue;
    } else if (status === 'IN_RANGE') {
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
 * Grouping and sorting are two questions, and they are now two controls.
 *
 * They used to be one. "Health area" sat in the sort picker alongside "Name"
 * and "Needs attention first", and picking it did something the other two did
 * not: it broke the grid into sections. So there was no way to read a report
 * grouped by area with the out-of-range markers first inside each area, and no
 * way to sort by area without grouping — the control could express three of the
 * six things it looked like it could.
 *
 * Split, every combination is reachable and nothing that was reachable before
 * has gone: "sort by health area" is Group by health area, and within each
 * heading the sort still applies. Both are shared by the report view and the
 * marker list, so the two screens group and sort identically.
 *
 * UNGROUPED is the default. A report opens as every marker it contains, in one
 * flat grid — the grouped reading is one control away, and it is the reader's
 * to ask for rather than the page's to assume.
 */
export const RESULT_GROUPINGS = [
  { value: 'NONE', label: 'Ungrouped' },
  { value: 'HEALTH_AREA', label: 'Health area' },
] as const;

export type ResultGrouping = (typeof RESULT_GROUPINGS)[number]['value'];

/**
 * The two orders a page of results can be read in, flat or within a group.
 *
 * STATUS is the default and answers the question this page reliably gets. NAME
 * is for the reader who came looking for one analyte and did not use the search
 * box.
 */
export const RESULT_SORTS = [
  { value: 'STATUS', label: 'Needs attention first' },
  { value: 'NAME', label: 'Name (A–Z)' },
] as const;

export type ResultSort = (typeof RESULT_SORTS)[number]['value'];

/**
 * The marker list's orders: the report's two, plus two that only mean anything
 * across reports.
 *
 * Deliberately a second list rather than an extension of the first. "Most
 * recently tested" and "biggest change" are questions about a marker's history,
 * and a single report is one sample — offering them on an opened report would
 * be two options that cannot reorder anything. So the Sort by picker in the
 * control bar shows whichever set the active arrangement can actually answer
 * for, and each keeps its own selection.
 */
export const MARKER_SORTS = [
  { value: 'ATTENTION', label: 'Needs attention first' },
  { value: 'NAME', label: 'Name (A–Z)' },
  { value: 'RECENT', label: 'Most recently tested' },
  { value: 'MOVEMENT', label: 'Biggest change' },
] as const;

export type MarkerSort = (typeof MARKER_SORTS)[number]['value'];

export function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}

/**
 * Out of range sorts above in range; significantly out sorts above mildly out;
 * a result with no status sorts last of all.
 *
 * Last rather than first because "needs attention first" is a question about
 * findings, and a result nobody could compare has no finding in it. It is
 * still on the page, still readable, just not competing with the results that
 * do say something.
 */
export const ATTENTION_RANK: Record<MarkerStatus, number> = {
  SIGNIFICANT_HIGH: 0,
  SIGNIFICANT_LOW: 0,
  HIGH: 1,
  LOW: 1,
  IN_RANGE: 2,
};

const NO_STATUS_RANK = 3;

export function attentionRank(status: MarkerStatusInput): number {
  const known = asMarkerStatus(status);
  // An unrecognised status used to give `undefined` here, and `undefined - 2`
  // is NaN: a comparator returning NaN leaves the array in whatever order the
  // sort happened to walk it, so one bad row silently unsorted the whole list.
  return known === null ? NO_STATUS_RANK : ATTENTION_RANK[known];
}

export function byAttentionThenName<T extends { status: MarkerStatusInput; name: string }>(a: T, b: T): number {
  return attentionRank(a.status) - attentionRank(b.status) || a.name.localeCompare(b.name);
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
