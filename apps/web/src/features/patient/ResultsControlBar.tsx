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
import { RANGE_FILTERS, RESULT_TYPE_FILTERS } from './reportSections';
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
      // A filter chip is a control, so it is made of what controls are made of.
      // `bg-cream-100` was the card tone, which on a white page is a white pill
      // on a white field — and it sits on the glass control bar, where an
      // opaque fill is a hole in the material it is travelling with.
      className="glass-control-quiet inline-flex max-w-full items-center gap-1.5 rounded-full border border-taupe py-1.5 pl-3 pr-2.5 text-xs font-medium text-espresso transition duration-150 ease-out hover:border-bronze hover:text-bronze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
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
 *   The fold, below it: Show, Category, Group by and Sort by. Closed on
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
 * THE PIN IS BACK, ON GLASS (Aug 2026).
 *
 * It was unpinned because a sticky element with no surface has the page
 * scrolling THROUGH it, and the only fix anybody reached for was a solid fill —
 * which is the thing that read as a form panel, and also the thing the corner
 * glow may never be painted over. Both objections are objections to a FILL, and
 * neither survives glass: a translucent warm sheet over a backdrop blur is a
 * surface, and the light and the content behind it still come through.
 *
 * Four properties, and each of them is the reason for one line below:
 *
 *  · UNBOXED, STILL. No border, no rounded container, nothing that reads as a
 *    panel. The glass is the whole of the separation.
 *  · IT APPEARS ONLY WHEN PINNED. Sitting in the page at the top there is
 *    nothing behind the bar to separate it from, and a sheet of glass over the
 *    page at rest is a panel nobody asked for.
 *  · IT FADES IN. A surface that appears from nowhere on the first scroll wheel
 *    click reads as a fault. 180ms, and instant under reduced motion.
 *  · IT REACHES PAST THE CONTENT COLUMN. Negative insets matching the shell's
 *    own page padding, so the sheet runs to the window edge at the widths this
 *    is read at rather than stopping at the text and leaving a strip of sharp
 *    content beside it.
 *
 * WHAT SETS `pinned`, AND WHAT IT IS ALLOWED TO TOUCH. A rAF-throttled scroll
 * read comparing the bar's own top against its sticky offset. It writes ONE
 * boolean and that boolean is the glass. It must never touch `open` — a scroll
 * handler that writes the panel's state is exactly what made the disclosure
 * fail to toggle the last time this bar was pinned, and the rule that came out
 * of it stands: the panel is the reader's.
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
  resultTypes,
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
  /**
   * The result types this view actually contains — empty everywhere but an open
   * report, which is the only screen with sections other than the marker grid
   * on it. Same rule as the health areas: a picker never offers a value that
   * can only ever return nothing.
   */
  resultTypes: { key: string; name: string }[];
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

  /**
   * Whether the bar is currently stuck to the top of the window.
   *
   * The ONLY thing this drives is the glass. It is deliberately not derived
   * into anything else and nothing else derives from it — see the note above
   * about what a scroll handler is allowed to write.
   *
   * Read from the element's own geometry rather than from an
   * IntersectionObserver on a sentinel, because the sticky offset is a CSS
   * variable (the mobile shell has a header above this and the desktop one does
   * not) and a rootMargin would have to duplicate that number in JavaScript.
   * Comparing the bar's measured top against its own computed `top` cannot
   * disagree with the stylesheet.
   */
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    let frame = 0;
    function measure() {
      frame = 0;
      const element = barRef.current;
      if (!element) return;
      const offset = Number.parseFloat(getComputedStyle(element).top) || 0;
      // Half a pixel of tolerance: a fractional device pixel ratio otherwise
      // toggles this on and off along one scroll, which is a flickering sheet
      // of glass.
      setPinned(element.getBoundingClientRect().top <= offset + 0.5);
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

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
  // One value space, two vocabularies — so the chip has to look in both or a
  // result-type filter appears in the row as "Selected category" and the reader
  // cannot tell what they turned on. The result types are read from the CLOSED
  // LIST rather than from what this view happens to offer, because a filter set
  // inside a report and carried out of it is exactly the case where a chip has
  // to keep naming itself: switching view must never silently drop a filter,
  // and a chip reading "Selected category" is a filter nobody can identify.
  const categoryLabel = [
    ...RESULT_TYPE_FILTERS.map((t) => ({ key: t.value, name: t.label })),
    ...RANGE_FILTERS.map((r) => ({ key: r.value, name: r.label })),
    ...categories,
  ].find((c) => c.key === filters.categoryFilter)?.name;
  // What is narrowing the page from behind the fold — the search box is in the
  // row above and says so for itself.
  const narrowing = (filters.statusFilter === 'ALL' ? 0 : 1) + (filters.categoryFilter === 'ALL' ? 0 : 1);
  const applied = filtersApplied(filters);

  return (
    // `top` comes from --shell-sticky-top (globals.css): zero on desktop, the
    // height of the patient shell's own mobile header below md, so the bar
    // never pins underneath it. z-20 keeps it under that header (z-30) and over
    // the results.
    <div ref={barRef} className="sticky top-[var(--shell-sticky-top)] z-20 mt-12 print-hide">
      {/* THE GLASS. Behind the controls, wider than the content column by
          exactly the shell's own page padding, and taller than the bar at both
          ends so nothing scrolls into contact with the type. Pointer events
          off: it is a surface, not a target. */}
      <div
        aria-hidden="true"
        className={`glass glass-veil pointer-events-none absolute -left-5 -right-5 -top-4 -bottom-3 sm:-left-8 sm:-right-8 md:-left-14 md:-right-14 lg:-left-20 lg:-right-20 ${
          pinned ? 'is-pinned' : ''
        }`}
      />
      {/* Everything else sits on it. `relative` with no z-index is enough —
          a positioned sibling later in the source order paints above an
          absolutely positioned one. */}
      <div className="relative">
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
            // Travels with the bar, so it takes the bar's material rather than
            // reading as a hairline pill floating on a sheet of glass.
            tone="glass"
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
            <FilterChip value={categoryLabel ?? 'Selected category'} onClear={() => onChange({ categoryFilter: 'ALL' })} />
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
          {/* ── ONE ROW AT DESKTOP WIDTHS, AND TWO-AND-TWO BELOW (Aug 2026) ──
              It was four fixed widths in a `flex-wrap` row: 192 + 224 + 160 +
              208 plus three 16px gaps is 832px, against a content column of
              about 832px at 1280 with the sidebar out. So Show, Category and
              Group by took the line and SORT BY DROPPED TO A SECOND ROW ON ITS
              OWN, leaving most of a row of empty space above it — the worst of
              the three arrangements, because it reads as a mistake rather than
              as a layout.

              A GRID rather than tuned widths, because the widths were what
              broke: four columns that share whatever the panel has cannot go
              three-and-one at any viewport, and they cannot drift when somebody
              adds an option with a longer label. 1280 gives each column ~196px,
              1440 ~236px and 1920 ~356px.

              The step below `lg` is TWO AND TWO, which is the arrangement to
              fall back to rather than three-and-one: two even rows read as a
              block of controls, and a row of three over a row of one reads as
              something that failed to fit. One column on a phone.

              The column count follows the number of controls — `scope` is null
              on the report LIST and on Compare, where Group by and Sort by mean
              nothing and are not rendered. A four-column grid holding two
              pickers would set them at a quarter width each with half the panel
              empty beside them. Both class strings are literals, because
              Tailwind reads the source rather than the runtime value. */}
          <div
            className={`grid items-end gap-4 ${
              scope ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'
            }`}
          >
            <div>
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
            {/* CATEGORY, NOT "HEALTH AREA" (Aug 2026) — because it now answers
                two questions with one control.

                A patient who wants to see only their food sensitivities and a
                patient who wants to see only their kidney markers are asking
                the same kind of thing, and until this they had to ask it in two
                completely different ways: one was a picker at the top of the
                page, the other was scrolling 5,000px to find a section they
                did not know existed. Result types sit ABOVE the areas under
                their own heading, because they are a coarser cut — one names a
                whole section of the report, the other names a slice through the
                markers in one of them.

                Grouped rather than merged into one flat list: "Food
                sensitivity" and "Kidney health" are both answers to "narrow
                this", and they are not the same KIND of answer. Where a view
                has no result types to offer (everything but an open report) the
                group is absent and this is the area picker it always was. */}
            <div>
              <Select
                label="Category"
                name="results-category-filter"
                value={filters.categoryFilter}
                onChange={(e) => onChange({ categoryFilter: e.target.value })}
              >
                <option value="ALL">Everything</option>
                {resultTypes.length > 0 && (
                  <optgroup label="Result type">
                    {resultTypes.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {/* A THIRD VOCABULARY, AND THE ONLY ONE OFFERED EVERYWHERE.
                    Some markers in the grid carry no reference range and never
                    will — the dipstick pads, the antibody result, and every
                    physical measurement — so they render as untinted cards
                    reading "Not compared to a range". Correct, and until now
                    there was nothing a reader could do about a block of them:
                    somebody reading their measured results scrolled past, and
                    somebody who wanted just their blood pressure and their
                    weight could not ask.

                    Two options, exact complements, both self-describing so the
                    chip in the row above names itself wherever it is carried.
                    The wording is the sentence already on the cards — never
                    "qualitative", which is not a word a patient has and is not
                    even the right one (these cut across the result types).

                    ALWAYS OFFERED, unlike the result types: every view this bar
                    appears on has a measured grid, and every measured grid can
                    contain both kinds. See reportSections.ts. */}
                <optgroup label="Reference range">
                  {RANGE_FILTERS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </optgroup>
                {categories.length > 0 && (
                  <optgroup label="Health area">
                    {categories.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </div>
            {scope && (
              <>
                <div>
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
                <div>
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
    </div>
  );
}
