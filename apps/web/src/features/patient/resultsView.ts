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
export type ResultsView = 'by-marker' | 'by-test' | 'compare';

/**
 * BY MARKER IS FIRST, AND IT IS THE DEFAULT (Aug 2026).
 *
 * By test used to be both, on the reasoning that nearly every visit is
 * somebody coming back to the panel they were just emailed about. That is true
 * of the visit AFTER a release and untrue of every visit since: the question
 * that keeps bringing people back is "how is my vitamin D doing", and nobody
 * remembers which panel vitamin D was on. By test is one press away and,
 * more to the point, every emailed link opens a report directly — /reports/:id
 * is its own route and pins that view whatever this says.
 *
 * ── IT WAS "BY REPORT" UNTIL Aug 2026 ──────────────────────────────────────
 *
 * A patient books a TEST and receives a report about it; "report" is the
 * clinic's word for the artefact and "test" is the patient's word for the
 * thing they had done. The tab is what a patient reads, so it is theirs.
 */
export const RESULTS_VIEWS: { value: ResultsView; label: string; spoken: string }[] = [
  { value: 'by-marker', label: 'By marker', spoken: 'By marker, the default view' },
  { value: 'by-test', label: 'By test', spoken: 'By test' },
  { value: 'compare', label: 'Compare', spoken: 'Compare markers over time' },
];

/** What /results shows with no ?view= on it. */
export const DEFAULT_RESULTS_VIEW: ResultsView = 'by-marker';

/**
 * THE OLD URL TOKEN STILL RESOLVES, AND THAT IS THE WHOLE OF "DOES NOT BREAK
 * LINKS".
 *
 * `?view=by-report` is in bookmarks and in at least one browser history, and
 * `/my-results` has redirected to it since the three screens were folded into
 * one. Renaming the value without this would have turned every one of those
 * into "the default view" — not a 404, which is worse: a silent landing on the
 * wrong arrangement with nothing saying why.
 *
 * Read-only. Nothing WRITES `by-report` any more, so the old token exists on
 * the way in and never on the way out — follow a legacy link and the URL that
 * ends up in the address bar is the current one.
 */
const LEGACY_VIEW_ALIASES: Record<string, ResultsView> = { 'by-report': 'by-test' };

export function isResultsView(value: string | null): value is ResultsView {
  return value === 'by-test' || value === 'by-marker' || value === 'compare';
}

/** A `?view=` value, current or legacy, as the view it names — or null. */
export function resolveResultsView(value: string | null): ResultsView | null {
  if (isResultsView(value)) return value;
  if (!value) return null;
  return LEGACY_VIEW_ALIASES[value] ?? null;
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
 * ═══ GROUPING BY HEALTH AREA IS NOT THE DEFAULT, AND HERE IS THE MEASUREMENT
 *
 * A Signature report opens as one flat grid of 165 cards, 24,753px tall, and
 * the obvious answer to "nobody reaches the bottom" is to make health-area
 * grouping the default above some size — twenty short lists rather than one
 * wall. ReportDetailView's own note argues for exactly that, and it is wrong.
 * It was tried, and measured on the demo patient's Signature panel:
 *
 *     flat      165 cards                        24,753px
 *     grouped   218 cards, 27 area headings      38,410px   (+55%)
 *
 * Health areas OVERLAP by design — a marker belongs to every area it is
 * relevant to, and `groupByHealthArea` draws it under all of them (the counts
 * stay distinct, the cards do not). So grouping this panel adds 53 duplicate
 * cards: a patient scrolling sees their own Albumin four times, under four
 * headings, and the page they could not reach the bottom of got half as long
 * again. It makes the document longer AND makes the same result appear
 * repeatedly, which is the opposite of both things that were wanted.
 *
 * It remains exactly right as a CHOICE, which is what it already is: a reader
 * who asks to read by area gets the overlap explained by the heading itself
 * ("3 of 21 markers"), because they asked the question that answer belongs to.
 *
 * WHAT ACTUALLY ANSWERS THE LENGTH is already on the page and is not an
 * arrangement: the section index above the control bar, which names every
 * section this report has with its count, so a reader knows that the markers
 * are 165 of 433 and can jump past them. 165 results is 165 results; the fault
 * was never that they were all shown, it was that nothing said how far down
 * the page went.
 *
 * Do not re-derive this. Any scheme that groups by an overlapping taxonomy
 * duplicates cards, and the duplication is the cost that decides it.
 */

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
