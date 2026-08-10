import type { MarkerSort, ResultGrouping, ResultSort, StatusFilter } from '../../lib/markerCopy';

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
 * Grouping and sort live here too, in ResultsArrangement — see below. They used
 * to sit inside each view, which put a second control bar halfway down an open
 * report, underneath the report's own header. There is one bar now and it holds
 * all of it.
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
 * How the markers are ARRANGED, as against which of them are shown.
 *
 * One object at page level rather than a pair of useStates inside each view,
 * because the controls that drive it now sit in the same bar as the search and
 * the filters — and because state that lives inside a view is state that is
 * thrown away the moment somebody switches view. Group a report by health area,
 * look at every marker, come back: still grouped.
 *
 * The two sorts are two fields rather than one, because they are two
 * vocabularies (see MARKER_SORTS). Only one is ever on screen, and neither
 * disturbs the other.
 */
export interface ResultsArrangement {
  grouping: ResultGrouping;
  reportSort: ResultSort;
  markerSort: MarkerSort;
}

/** Ungrouped, needs-attention first — what every arrangement opens as. */
export const DEFAULT_ARRANGEMENT: ResultsArrangement = {
  grouping: 'NONE',
  reportSort: 'STATUS',
  markerSort: 'ATTENTION',
};

/**
 * Which sort vocabulary the thing currently on screen speaks, or null where it
 * has no order to choose — the report LIST and the comparison both arrange
 * themselves, so the bar drops Group by and Sort by entirely rather than
 * showing two pickers that cannot move anything.
 */
export type ArrangementScope = 'REPORT' | 'MARKER' | null;

/**
 * What a view tells the page about itself, so the page's control bar can offer
 * exactly the health areas the active view can actually return something for.
 * Offering one that cannot is the same mistake as offering a status filter over
 * genetic indicators.
 */
export interface ViewReportsCategories {
  onCategoriesAvailable?: (categories: { key: string; name: string }[]) => void;
}
