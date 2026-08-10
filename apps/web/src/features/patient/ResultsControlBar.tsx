import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Segmented } from '../../components/ui/Segmented';
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
  type ArrangementScope,
  type ResultsArrangement,
  type ResultsFilters,
  type ResultsView,
} from './resultsView';

/**
 * Every control the results page has, in one bar.
 *
 * There were two. Search, Show and Health area sat at the top of the page with
 * the view switch; Group by and Sort by sat further down, inside whichever view
 * was showing — so an opened report put its own header between them and the
 * page read controls, content, more controls. Which of the five you wanted
 * decided where you had to look for it, and neither bar was the bar.
 *
 * One bar, in the order the questions get asked: WHICH markers (search, then
 * the two filters), then HOW they are laid out (group, then sort), then WHICH
 * ARRANGEMENT of the data you are in at all. Everything behaves exactly as it
 * did — this moved the controls, it did not redesign any of them.
 *
 * Group by and Sort by are absent where nothing they could say would be true:
 * the report LIST has no markers to group, and the comparison arranges itself
 * around a selection. See ArrangementScope. Their state survives their absence,
 * so a report grouped by health area is still grouped when you come back to it.
 *
 * STICKY FROM md UP, and deliberately not below it. A 187-marker report is a
 * great deal of scrolling to get back to the search box, which is the argument
 * for pinning it — but on a phone the five controls stack, and a bar that tall
 * pinned to the top of a 375px screen is not a toolbar, it is a lid.
 */
export function ResultsControlBar({
  filters,
  onChange,
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

  return (
    // Full-bleed: the negative margins are exactly the shell's own gutters, so
    // the band reaches the sidebar on one side and the window on the other and
    // reads as page furniture rather than as another card. Same construction as
    // the admin console's report bar.
    <div className="-mx-5 mt-10 border-y border-taupe bg-cream/95 px-5 py-5 backdrop-blur sm:-mx-8 sm:px-8 md:sticky md:top-0 md:z-20 md:-mx-14 md:px-14 lg:-mx-20 lg:px-20">
      {/* WHICH markers. Five pickers on one line is five pickers nobody can
          read the labels of at 1280, so the bar is two deliberate groups
          rather than one row that wraps wherever it happens to run out —
          narrowing above, arranging below. Search takes whatever width is
          left over, because a marker name is longer than any fixed option
          beside it. */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-4">
        <div className="min-w-[13rem] flex-1 basis-64">
          <Input
            label="Find a marker"
            name="results-search"
            type="search"
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
            // The abbreviation is the only name most people know, and search
            // matches aliases as well as the printed name.
            placeholder="Ferritin, ALT, TSH…"
            // A filter, not a form field — Input marks required by default.
            required={false}
          />
        </div>
        <div className="w-full sm:w-52">
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
        <div className="w-full sm:w-52">
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
      </div>

      {/* HOW they are laid out, and which arrangement you are in at all. The
          switch is last in the bar and so directly above the panel it
          switches, which is what makes the tab strip read as belonging to
          what is underneath it rather than to the pickers overhead. */}
      <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-4 border-t border-taupe pt-5">
        {scope && (
          <>
            <div className="w-full sm:w-44">
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
            <div className="w-full sm:w-56">
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
        {/* Pushed right only when it has company. Alone on its row — the
            report list and the comparison arrange themselves — a right-aligned
            pill strip reads as something that has lost the control it was
            paired with. */}
        <div className={scope ? 'sm:ml-auto' : ''}>
          <Segmented options={RESULTS_VIEWS} value={view} onChange={onViewChange} label="Results view" panelId={panelId} />
        </div>
      </div>
    </div>
  );
}
