import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Segmented } from '../../components/ui/Segmented';
import { CloseIcon } from '../../components/nav/icons';
import {
  MARKER_SORTS,
  RESULT_GROUPINGS,
  RESULT_SORTS,
  STATUS_FILTERS,
  type MarkerSort,
  type ResultGrouping,
  type ResultSort,
  type StatusFilter,
} from '../../lib/markerCopy';
import {
  RESULTS_VIEWS,
  filtersApplied,
  type ArrangementScope,
  type ResultsArrangement,
  type ResultsFilters,
  type ResultsView,
} from './resultsView';

/** The half of the bar that folds away, named so the disclosure can point at it. */
const FOLD_ID = 'results-control-fold';

/**
 * How far below the window the pinned-or-not observer's root reaches — see the
 * effect below. Comfortably past the tallest page this product can produce: the
 * biggest seeded report is 187 markers and around 51,000px on a phone.
 */
const BELOW_THE_FOLD = 1_000_000;

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 transition duration-150 ease-out ${up ? 'rotate-180' : ''}`}
    >
      <path d="M1.5 3.5 5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * One applied filter, and the way out of it.
 *
 * It carries the VALUE and not the name of the picker it came from — "Above
 * range", not "Show: Above range". The eyebrow beside the set says what they
 * all are, so the prefix was only ever repetition, and it made every chip long
 * enough to take a second line on a phone. It also gave each chip an
 * accessible name containing a picker's own label, so `getByLabel('Show')`
 * matched two different controls the moment a filter was on.
 *
 * The accessible name leads with the visible text, so label-in-name holds:
 * someone saying "above range" to a voice control is saying what they can see.
 */
function FilterChip({ value, onClear }: { value: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={`${value}. Clear this filter`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-taupe bg-cream-100 py-1.5 pl-3 pr-2.5 text-xs font-medium text-espresso transition duration-150 ease-out hover:border-bronze hover:text-bronze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
    >
      <span aria-hidden="true" className="truncate">
        {value}
      </span>
      <CloseIcon className="h-3 w-3 shrink-0" />
    </button>
  );
}

/**
 * Every control the results page has, in one bar — full at the top of the page,
 * one row once you have scrolled past it.
 *
 * There were two bars. Search, Show and Health area sat at the top of the page
 * with the view switch; Group by and Sort by sat further down, inside whichever
 * view was showing — so an opened report put its own header between them and
 * the page read controls, content, more controls. Which of the five you wanted
 * decided where you had to look for it, and neither bar was the bar.
 *
 * ONE BAR, IN TWO HALVES.
 *
 *   Row one, always on screen: the search box, whatever is currently
 *   narrowing the page, and the view switch. These are what a patient reaches
 *   for repeatedly while reading 187 markers.
 *
 *   The fold, below it: Show, Health area, Group by and Sort by. Open at the
 *   top of the page; folded away once the bar pins, behind a Filters
 *   disclosure that brings it straight back.
 *
 * Everything behaves exactly as it did — this moved the controls and changed
 * when they are on screen, it did not redesign any of them. Nothing here holds
 * state except whether the fold is open: search, filters, grouping, sort and
 * view all live on the page, so scrolling, folding and switching view cannot
 * throw any of them away.
 *
 * WHY THE FOLD IS HIDDEN AND NOT REMOVED. The bar is sticky, so its box is
 * what the content below it starts after. Collapsing that box while the bar is
 * pinned drags the whole page up by the difference — the reader loses their
 * place mid-scroll, and the same thing happens in reverse on the way back.
 * `visibility: hidden` (see .bar-fold in globals.css) leaves the box exactly
 * where it is: the markers scroll up through the space the fold used to
 * occupy, nothing moves that the reader did not move, and opening the fold
 * again paints it back in place with no scrolling at all. The bar's wrapper is
 * `pointer-events-none` for the same reason — the space the fold reserves is
 * over the markers, and it must not intercept anything aimed at them.
 *
 * Group by and Sort by are absent where nothing they could say would be true:
 * the report LIST has no markers to group, and the comparison arranges itself
 * around a selection. See ArrangementScope. Their state survives their absence,
 * so a report grouped by health area is still grouped when you come back to it.
 *
 * STICKY AT EVERY WIDTH, which it was not before. The old bar was five stacked
 * controls on a phone — 580px of a 780px screen — and pinning that is not a
 * toolbar, it is a lid. One row is a toolbar, and a phone is where the walk
 * back to the top of a 187-marker report costs the most.
 */
export function ResultsControlBar({
  filters,
  onChange,
  onClearFilters,
  categories,
  statusCounts,
  arrangement,
  onArrange,
  scope,
  view,
  onViewChange,
  panelId,
}: {
  filters: ResultsFilters;
  onChange: (next: Partial<ResultsFilters>) => void;
  /** Back to nothing narrowed — the search term included. */
  onClearFilters: () => void;
  /** Only the areas the active view can return something for, plus whatever is currently chosen. */
  categories: { key: string; name: string }[];
  /** Counts beside each status option, from the active view's own marker set. */
  statusCounts?: Record<StatusFilter, number>;
  arrangement: ResultsArrangement;
  onArrange: (next: Partial<ResultsArrangement>) => void;
  /** Which sort vocabulary applies here, or null where neither picker belongs. */
  scope: ArrangementScope;
  view: ResultsView;
  onViewChange: (next: ResultsView) => void;
  /** The tabpanel the view switch controls. */
  panelId: string;
}) {
  const sorts = scope === 'MARKER' ? MARKER_SORTS : RESULT_SORTS;
  const sortValue = scope === 'MARKER' ? arrangement.markerSort : arrangement.reportSort;

  const sentinelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const foldRef = useRef<HTMLDivElement>(null);
  /** Whether the bar has left its place in the page and pinned itself. */
  const [pinned, setPinned] = useState(false);
  /** Whether the reader has asked for the fold back while it is pinned. */
  const [foldOpen, setFoldOpen] = useState(false);

  /**
   * Watched on a sentinel ABOVE the bar rather than on the bar itself.
   *
   * The bar's own top is where it is pinned the whole time it is pinned, so
   * asking it would be asking a constant. The sentinel sits one pixel above
   * the bar in the page and nothing between it and the top of the document
   * ever changes size, so the answer cannot be disturbed by the bar reacting
   * to it — which is the loop that makes a condensing header flicker.
   *
   * The top margin is the bar's own sticky offset, read off the element so the
   * mobile top bar's height is written down once (in tailwind.config.ts) and
   * nowhere else. Re-read on resize because it is 0 from md up.
   *
   * The bottom margin is what makes the answer a straight "is it above the
   * line", and it has to be there. An observer only reports a CHANGE of
   * intersection, and a bar below the fold — where it starts on a phone — is
   * already not intersecting; jump the scroll past it in one go and the state
   * never changes, so nothing is ever reported and the bar pins itself wide.
   * Extending the root all the way down the document makes "still below" an
   * intersection, so the only crossing left is the one this is asking about.
   */
  useEffect(() => {
    /** Focus inside the fold, or one of its pickers standing open. */
    const stillInUse = () => {
      const fold = foldRef.current;
      return !!fold && (fold.contains(document.activeElement) || !!fold.querySelector('[aria-expanded="true"]'));
    };

    const sentinel = sentinelRef.current;
    const bar = barRef.current;
    // A browser without IntersectionObserver keeps the bar permanently open:
    // every control is reachable, it simply never folds.
    if (!sentinel || !bar || typeof IntersectionObserver === 'undefined') return;

    let observer: IntersectionObserver | undefined;
    const watch = () => {
      observer?.disconnect();
      const offset = Number.parseFloat(window.getComputedStyle(bar).top) || 0;
      observer = new IntersectionObserver(
        ([entry]) => {
          const isPinned = !entry.isIntersecting;
          setPinned(isPinned);
          // Never fold away a control somebody is holding.
          //
          // Not every scroll is a reader scrolling. Choosing "Group by: health
          // area" on a big report re-lays the grid out under the page's own
          // scroll anchoring and moves it by the better part of a thousand
          // pixels — which is quite enough to pin the bar, a tenth of a second
          // after a hand pressed something inside it. Folding on that takes
          // the next picker away from someone who has not moved. So the fold
          // survives pinning whenever it holds the focus or has a menu
          // standing open, and folds on every other scroll. Coming back to the
          // top resets it, so the next scroll down folds again.
          setFoldOpen(isPinned && stillInUse());
        },
        { rootMargin: `${-(offset + 1)}px 0px ${BELOW_THE_FOLD}px 0px`, threshold: 0 },
      );
      observer.observe(sentinel);
    };

    watch();
    window.addEventListener('resize', watch);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', watch);
    };
  }, []);

  const folded = pinned && !foldOpen;

  const statusLabel = STATUS_FILTERS.find((f) => f.value === filters.statusFilter)?.label;
  const categoryLabel = categories.find((c) => c.key === filters.categoryFilter)?.name;
  // What is narrowing the page from behind the fold — the search box is in the
  // row above and says so for itself.
  const narrowing = (filters.statusFilter === 'ALL' ? 0 : 1) + (filters.categoryFilter === 'ALL' ? 0 : 1);
  const applied = filtersApplied(filters);

  return (
    <>
      {/* The bar's place in the page, one pixel tall, carrying the margin that
          used to be the bar's own — so the observer above flips at exactly the
          moment the bar leaves, not forty pixels early. */}
      <div ref={sentinelRef} aria-hidden="true" className="mt-10 h-px" />

      {/* Full-bleed: the negative margins are exactly the shell's own gutters,
          so the band reaches the sidebar on one side and the window on the
          other and reads as page furniture rather than as another card. Same
          construction as the admin console's report bar.
          The background lives on the two halves rather than here, because this
          box is taller than what is painted the moment the fold closes, and a
          band drawn on it would be a sheet of cream over the markers. */}
      <div
        ref={barRef}
        className="pointer-events-none sticky top-topbar-patient z-20 -mx-5 sm:-mx-8 md:top-0 md:-mx-14 lg:-mx-20"
      >
        {/* ROW ONE — search, what is applied, and which arrangement you are in.
            Its height is deliberately the same pinned as unpinned: the
            disclosure is no taller than the search field beside it, so nothing
            below the bar moves when it appears. */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-3 border-y border-taupe bg-cream/95 px-5 py-3 backdrop-blur sm:px-8 md:px-14 lg:px-20">
          {/* Takes whatever width is left over — a marker name is longer than
              any fixed control beside it. The label is spoken but not drawn:
              a caption above the field costs more of a pinned bar than the
              field itself, and the placeholder carries the same sentence.
              The basis is small enough on a phone that the disclosure beside
              it still fits on the line WITH its count on: let it wrap and the
              row grows a line at the moment the bar pins, which shunts the
              markers down by exactly the amount this bar exists to save. */}
          <div className="min-w-0 flex-1 basis-40 sm:basis-64">
            <Input
              label="Find a marker"
              hideLabel
              name="results-search"
              type="search"
              value={filters.query}
              onChange={(e) => onChange({ query: e.target.value })}
              // The abbreviation is the only name most people know, and search
              // matches aliases as well as the printed name. A colon rather
              // than the dash the old placeholder used: house style refuses em
              // dashes in anything a patient reads, and the copy spec cannot
              // see inside a placeholder to catch one.
              placeholder="Find a marker: ferritin, ALT, TSH…"
              // A filter, not a form field — Input marks required by default.
              required={false}
            />
          </div>

          {/* Only while pinned. Unpinned, the fold is already open and a
              control offering to open it would be a control that does
              nothing. */}
          {pinned && (
            <Button
              variant="secondary"
              onClick={() => setFoldOpen((open) => !open)}
              aria-expanded={foldOpen}
              aria-controls={FOLD_ID}
              className="shrink-0 px-4"
            >
              <span>
                Filters<span className="hidden sm:inline"> and sort</span>
              </span>
              {narrowing > 0 && (
                <span className="tabular rounded-full bg-bronze px-1.5 py-0.5 text-xs font-semibold text-onaccent">
                  {narrowing}
                  <span className="sr-only"> applied</span>
                </span>
              )}
              <ChevronIcon up={foldOpen} />
            </Button>
          )}

          {/* Its own line on a phone, where three labels and a search field
              cannot share one; pushed to the far edge from sm up, where it
              still reads as belonging to the panel directly beneath it. */}
          <div className="min-w-0 basis-full sm:ml-auto sm:basis-auto">
            <Segmented options={RESULTS_VIEWS} value={view} onChange={onViewChange} label="Results view" panelId={panelId} />
          </div>

          {/* WHAT IS CURRENTLY HIDING THINGS, on the last line of the row and
              therefore on screen whether the fold is open or shut. A filter
              you cannot see is how somebody concludes their results have gone
              missing — and the page's own Clear filters button is below the
              bar, which is to say gone by the time it is wanted. Shown in both
              states on purpose: appearing only once pinned would change this
              row's height mid-scroll, which is the one thing this bar is
              built not to do. */}
          {applied && (
            <div role="group" aria-label="Applied filters" className="flex basis-full flex-wrap items-center gap-2">
              {/* Only where there is a chip to introduce — a search term on
                  its own is already legible in the field above, and an eyebrow
                  over nothing is a label for an empty set. */}
              {narrowing > 0 && <span className="eyebrow">Filtered by</span>}
              {filters.statusFilter !== 'ALL' && (
                <FilterChip value={statusLabel ?? filters.statusFilter} onClear={() => onChange({ statusFilter: 'ALL' })} />
              )}
              {filters.categoryFilter !== 'ALL' && (
                <FilterChip value={categoryLabel ?? 'Selected area'} onClear={() => onChange({ categoryFilter: 'ALL' })} />
              )}
              <button
                type="button"
                onClick={onClearFilters}
                className="rounded-full border border-bronze/60 px-3 py-1.5 text-xs font-medium text-bronze transition duration-150 ease-out hover:border-bronze hover:bg-bronze-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* THE FOLD — how the markers are narrowed and how they are laid out,
            in the order the questions get asked. Painted below row one when
            open, and holding its space without painting anything when shut. */}
        <div
          id={FOLD_ID}
          ref={foldRef}
          // Held open above while it has the focus; this is where it lets go.
          // Focus moving anywhere else in the bar — to the disclosure, to a
          // chip, to the view switch — is not leaving, so the disclosure can
          // still shut it rather than having it reopened underneath the press.
          onBlur={(e) => {
            if (!barRef.current?.contains(e.relatedTarget)) setFoldOpen(false);
          }}
          className={`bar-fold pointer-events-auto border-b border-taupe bg-cream/95 px-5 pb-5 pt-4 backdrop-blur sm:px-8 md:px-14 lg:px-20 ${
            folded ? 'bar-fold-folded' : ''
          }`}
        >
          {/* Four pickers, sized to sit on ONE line inside the narrowest
              content column that shows them all — 1280 with the sidebar out,
              which is 880px less a scrollbar. At the old widths they landed a
              pixel over and wrapped, which put the bar's resting height back
              up above where it started. */}
          <div className="flex flex-wrap items-end gap-x-4 gap-y-4">
            <div className="w-full sm:w-48">
              <Select
                label="Show"
                name="results-status-filter"
                value={filters.statusFilter}
                onChange={(e) => onChange({ statusFilter: e.target.value as StatusFilter })}
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.value === 'ALL' || !statusCounts ? f.label : `${f.label} (${statusCounts[f.value]})`}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:w-48">
              <Select
                label="Health area"
                name="results-category-filter"
                value={filters.categoryFilter}
                onChange={(e) => onChange({ categoryFilter: e.target.value })}
              >
                <option value="ALL">All health areas</option>
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            {scope && (
              <>
                <div className="w-full sm:w-40">
                  <Select
                    label="Group by"
                    name="results-grouping"
                    value={arrangement.grouping}
                    onChange={(e) => onArrange({ grouping: e.target.value as ResultGrouping })}
                  >
                    {RESULT_GROUPINGS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-full sm:w-52">
                  <Select
                    label="Sort by"
                    name="results-sort"
                    value={sortValue}
                    onChange={(e) =>
                      onArrange(
                        scope === 'MARKER'
                          ? { markerSort: e.target.value as MarkerSort }
                          : { reportSort: e.target.value as ResultSort },
                      )
                    }
                  >
                    {sorts.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
