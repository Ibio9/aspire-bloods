import { useEffect, useRef, useState } from 'react';
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
 *   Row one, always on screen: the search box, the Filters disclosure, the
 *   view switch, and whatever is currently narrowing the page. These are what
 *   a patient reaches for repeatedly while reading 187 markers.
 *
 *   The fold, below it: Show, Health area, Group by and Sort by. Closed on
 *   load, behind a Filters disclosure that brings it straight back.
 *
 * NO BOX, AND NO BAND (Aug 2026). It used to be a full-bleed sticky band —
 * hairline top and bottom, a cream fill and a backdrop blur — and read as a
 * form panel bolted onto the page: an outlined search box, an outlined
 * disclosure and a filled segmented control, all inside a fourth outline. Four
 * boxes to say three things.
 *
 * The controls sit on the page now. The search field is one hairline
 * underneath (`.input-quiet`), the disclosure is a text control on the same
 * baseline beside it, the view switch keeps its track because a segmented
 * control genuinely is one object but takes the quiet tone, and the separation
 * is space rather than a border.
 *
 * THE STICKINESS WENT WITH THE BAND, and that is a real trade rather than an
 * oversight. A sticky element with no surface of its own has the page scrolling
 * THROUGH it, so keeping the pin meant keeping the fill, and the fill is the
 * thing that reads as a panel — it is also the thing the corner glow is not
 * allowed to be painted over. What is left in its place is order: the summary
 * answers "is anything worth a look" before the controls are offered at all,
 * so the walk back up the page is a walk to a decision that has already been
 * made rather than to a tool.
 *
 * Everything behaves exactly as it did — this moved the controls and changed
 * when they are on screen, it did not redesign any of them. Nothing here holds
 * state except whether the fold is open: search, filters, grouping, sort and
 * view all live on the page, so scrolling, folding and switching view cannot
 * throw any of them away.
 *
 * THE PANEL IS THE READER'S, AND NOTHING ELSE TOUCHES IT.
 *
 * It used to open and close on SCROLL: an IntersectionObserver decided whether
 * the bar was pinned, and the same callback wrote the panel's open state on
 * every crossing. So the disclosure did not reliably toggle — a scroll of one
 * pixel could reopen what had just been shut — and at the top of the page the
 * button was not rendered at all, on the grounds that the panel was open
 * anyway, which left no way to close it.
 *
 * One boolean now, set only by the reader. Closed on load. The button toggles
 * it; Escape, a click outside the bar and a change of view close it. It is
 * unmounted when shut rather than held invisible, so it cannot overlap or
 * displace the search field or the view switch at any width, and the four
 * pickers are genuinely out of the tab order rather than merely unpainted.
 *
 * What stays visible whatever the panel is doing: the count badge on the
 * disclosure, and the "Filtered by" chip row in the bar's first row. A filter
 * somebody cannot see is how they conclude their results have gone missing.
 *
 * Group by and Sort by are absent where nothing they could say would be true:
 * the report LIST has no markers to group, and the comparison arranges itself
 * around a selection. See ArrangementScope. Their state survives their absence,
 * so a report grouped by health area is still grouped when you come back to it.
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

  const barRef = useRef<HTMLDivElement>(null);
  const foldRef = useRef<HTMLDivElement>(null);

  /**
   * WHETHER THE PANEL IS OPEN, AND NOTHING ELSE DECIDES IT.
   *
   * This used to be two pieces of state — "is the bar pinned" and "has the
   * reader asked for the fold back" — with the panel's visibility derived from
   * both (`folded = pinned && !foldOpen`). That is why the disclosure did not
   * reliably toggle: the same scroll observer that set `pinned` also WROTE
   * `foldOpen` on every crossing, so pressing the button and then scrolling a
   * pixel reopened or reclosed the panel underneath the press, and at the top
   * of the page the button was hidden entirely on the grounds that the panel
   * was open anyway. A control whose state a scroll handler can overwrite is a
   * control that does not work.
   *
   * One boolean now, and only the reader sets it: the button toggles it, and
   * Escape, an outside click and a change of view close it. It starts CLOSED
   * on every load and it stays closed until somebody asks. The bar's pinned
   * state no longer touches it at all — pinning changes what the bar looks
   * like, not what it is showing.
   */
  const [open, setOpen] = useState(false);

  // Closed whenever the reader moves to a different arrangement. The four
  // pickers inside mean different things per view (see ArrangementScope), and
  // a panel that survives the switch is a panel showing the last view's
  // controls over this view's results.
  useEffect(() => {
    setOpen(false);
  }, [view]);

  /**
   * Escape, and a click anywhere outside the bar.
   *
   * Both are bound only while the panel is open, so a page with a shut panel
   * carries no listeners at all. Escape is captured on keydown rather than
   * keyup so it beats anything inside that might also be listening, and the
   * outside click is measured against the WHOLE bar rather than the panel:
   * pressing the disclosure itself is not an outside click, and treating it as
   * one would close the panel and then let the button reopen it in the same
   * gesture — the classic toggle that never toggles.
   */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    // Capture, so a control inside the page that stops propagation cannot
    // leave the panel open with the reader's attention somewhere else.
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  const statusLabel = STATUS_FILTERS.find((f) => f.value === filters.statusFilter)?.label;
  const categoryLabel = categories.find((c) => c.key === filters.categoryFilter)?.name;
  // What is narrowing the page from behind the fold — the search box is in the
  // row above and says so for itself.
  const narrowing = (filters.statusFilter === 'ALL' ? 0 : 1) + (filters.categoryFilter === 'ALL' ? 0 : 1);
  const applied = filtersApplied(filters);

  return (
    <div ref={barRef} className="mt-12">
      {/* ROW ONE — search, the way into the rest, and which arrangement you
          are in. Aligned on the BASELINE rather than the box: the search
          field's hairline is its bottom edge, and the disclosure beside it
          carries the same vertical padding over a transparent border so the
          two sets of type sit on one line. Items-end is what holds that
          together when the segmented control (a taller object, because it has
          a track and padding of its own) shares the row. */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        {/* Takes whatever width is left over — a marker name is longer than
            any fixed control beside it. The label is spoken but not drawn:
            a caption above the field would be a second line of chrome on a
            row that exists to have almost none, and the placeholder carries
            the same sentence. */}
        <div className="min-w-0 flex-1 basis-48 sm:basis-72">
          <Input
            label="Find a marker"
            hideLabel
            variant="quiet"
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

        {/* A LIGHTER CONTROL, not a competing pill. It was a secondary Button:
            a filled, bordered, shadowed object sitting beside a filled,
            bordered, shadowed field, so the row had two pills and a track on
            it and no way to tell which one mattered. This is type with a
            chevron, on the same baseline as the field, going bronze on hover.

            The count badge stays exactly as it was, and it is the one thing
            here allowed to be loud: it survives the panel being shut, and a
            filter somebody cannot see is how they conclude their results have
            gone missing.

            border-b border-transparent is not decoration — it reserves the
            same pixel the field's hairline occupies, so the two baselines
            agree at every width without a magic offset. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={FOLD_ID}
          className="inline-flex min-h-tap shrink-0 items-center gap-2 border-b border-transparent py-2.5 text-sm font-medium text-espresso/85 transition duration-150 ease-out hover:text-bronze focus-visible:rounded-input focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bronze"
        >
          <span>
            Filters<span className="hidden sm:inline"> and sort</span>
          </span>
          {narrowing > 0 && (
            <span className="numeric rounded-full bg-bronze px-1.5 py-0.5 text-xs font-semibold text-onaccent">
              {narrowing}
              <span className="sr-only"> applied</span>
            </span>
          )}
          {/* The chevron follows the state and cannot disagree with it —
              there is one boolean to follow. */}
          <ChevronIcon up={open} />
        </button>

        {/* Its own line on a phone, where three labels and a search field
            cannot share one; pushed to the far edge from sm up. Quiet tone,
            because a filled bronze block was the loudest thing on a page whose
            loudest thing should be the results. */}
        <div className="min-w-0 basis-full sm:ml-auto sm:basis-auto">
          <Segmented
            options={RESULTS_VIEWS}
            value={view}
            onChange={onViewChange}
            label="Results view"
            panelId={panelId}
            tone="quiet"
          />
        </div>
      </div>

      {/* WHAT IS CURRENTLY HIDING THINGS, below the row and therefore on
          screen whether the panel is open or shut. A filter you cannot see is
          how somebody concludes their results have gone missing — and the
          page's own Clear filters button is below the bar, which is to say
          gone by the time it is wanted. It is deliberately outside the panel,
          so shutting the panel never takes away either the chips or the way to
          clear them. */}
      {applied && (
        <div role="group" aria-label="Applied filters" className="mt-4 flex flex-wrap items-center gap-2">
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

      {/* THE PANEL — how the markers are narrowed and how they are laid
          out, in the order the questions get asked.

          UNMOUNTED WHEN SHUT, not merely hidden. It used to be held in the
          layout with `visibility: hidden` so that collapsing it could not drag
          a pinned page upward. That reasoning was sound while the panel opened
          and closed on SCROLL — the reader had not asked for it and must not
          lose their place. It is not sound now that the panel only ever
          changes because somebody pressed the button: they are looking at the
          controls, the movement is the answer to their press, and reserving
          the space permanently meant an invisible box sitting over the markers
          on every screen.

          No border and no fill of its own either: it belongs to the row above
          it, and drawing a box round four pickers is how the whole bar became
          a form panel in the first place. */}
      {open && (
        <div id={FOLD_ID} ref={foldRef} className="mt-6 motion-safe:animate-fadeIn">
          {/* Four pickers, sized to sit on ONE line inside the narrowest
              content column that shows them all — 1280 with the sidebar out,
              which is 880px less a scrollbar. */}
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
      )}
    </div>
  );
}
