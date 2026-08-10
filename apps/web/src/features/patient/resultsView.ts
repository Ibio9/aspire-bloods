import type { StatusFilter } from '../../lib/markerCopy';

/**
 * The state the three results views share, and the contract each of them
 * receives it under.
 *
 * My results, All markers and Trends used to be three sidebar destinations
 * asking three overlapping questions about one set of data, each with its own
 * copy of the same search box, the same status picker and the same health-area
 * picker — three places to type "ferritin" into, and no way to carry an answer
 * from one to the next. They are now three arrangements of one page, and the
 * search and filters live above the switch rather than inside each view.
 *
 * What deliberately does NOT live here is SORT. The report view sorts by health
 * area, name or needs-attention; the marker list adds most-recent and
 * biggest-change, which mean nothing on a single report. They were different
 * before and they stay different, because the brief for this consolidation was
 * to preserve every existing filtering, sorting and counting behaviour exactly
 * rather than to unify them into a lowest common denominator.
 */
export type ResultsView = 'by-report' | 'by-marker' | 'compare';

export const RESULTS_VIEWS: { value: ResultsView; label: string; spoken: string }[] = [
  { value: 'by-report', label: 'By report', spoken: 'By report, the default view' },
  { value: 'by-marker', label: 'By marker', spoken: 'By marker' },
  { value: 'compare', label: 'Compare', spoken: 'Compare markers over time' },
];

export function isResultsView(value: string | null): value is ResultsView {
  return value === 'by-report' || value === 'by-marker' || value === 'compare';
}

/** The three controls above the switch, as one object rather than three prop drills. */
export interface ResultsFilters {
  query: string;
  statusFilter: StatusFilter;
  categoryFilter: string;
}

/**
 * Nothing narrowed. Filter state starts here on every visit and returns here on
 * Clear — never persisted to the URL, to localStorage or to the server, so a
 * report you opened last month is not still hiding two thirds of itself
 * because of something you clicked then.
 */
export const EMPTY_FILTERS: ResultsFilters = { query: '', statusFilter: 'ALL', categoryFilter: 'ALL' };

/** Whether anything is narrowing the view, so a Clear button is worth offering. */
export function filtersApplied(f: ResultsFilters): boolean {
  return f.query.trim() !== '' || f.statusFilter !== 'ALL' || f.categoryFilter !== 'ALL';
}

/**
 * What a view tells the page about itself, so the page's filter bar can offer
 * exactly the health areas the active view can actually return something for.
 * Offering one that cannot is the same mistake as offering a status filter over
 * genetic indicators.
 */
export interface ViewReportsCategories {
  onCategoriesAvailable?: (categories: { key: string; name: string }[]) => void;
}
