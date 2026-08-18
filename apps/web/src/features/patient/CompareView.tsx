import { formatDate } from '@aspire-bloods/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Checkbox } from '../../components/ui/Checkbox';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { MultiTrendChart } from '../../components/ui/LazyCharts';
import { SeriesMark } from '../../components/ui/SeriesMark';
import { CloseIcon } from '../../components/nav/icons';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
import { apiFetch } from '../../lib/api';
import { matchesMarkerQuery, matchesStatusFilter, statusColor, statusFilterCounts, statusLabel, type StatusFilter } from '../../lib/markerCopy';
import { type MarkerRow, type TrendSeries } from '../../lib/patientPortal';
import { matchesRangeFilter, rangeFilterWantsRanged } from './reportSections';
import type { ResultsFilters, ViewReportsCategories } from './resultsView';

/**
 * Pick two or three markers, see them on one timeline — the "Compare" view.
 *
 * This is what Trends did that a sparkline in the marker list cannot: a
 * deliberate comparison between markers. Someone paying £575 for a panel is
 * buying the relationships between numbers, not the numbers — ferritin against
 * haemoglobin, HbA1c against fasting insulin — and a row of sparklines shows
 * each marker's own shape while saying nothing about how two of them move
 * together.
 *
 * It is an action rather than a browsing destination, which is why it is the
 * third segment rather than a sidebar entry of its own: you arrive here having
 * already decided what you want to compare.
 *
 * Selection lives in the URL, so a chart someone finds useful is a link they
 * can bookmark or send to their GP rather than something they have to
 * reconstruct by hand every visit.
 *
 * ═══ WHAT THE CRAFT PASS CHANGED (Aug 2026) ══════════════════════════════
 *
 * This screen had never had a pass of its own, and it showed in five places
 * that were each visible in one screenshot:
 *
 *  · THE PICKER CUT A ROW IN HALF. `max-h-96` is an arbitrary 384px, so the
 *    list ended mid-way through a marker's second line — "ALT (Alanine
 *    Aminotransferase) / 3 results · latest 122 U/L" sliced through the
 *    descenders. A clipped row reads as a rendering fault rather than as a
 *    list that continues, and nothing said it scrolled. It is a measured
 *    height against the viewport now (the card is sticky, so the list has to
 *    fit beside the chart), it carries the product's own thin scrollbar, and
 *    `.scroll-shade` fades the last few pixels so the cut is deliberate.
 *  · ROWS AT THE LIMIT WERE `opacity-40`. The opacity ladder in this product
 *    stops at /80 and everything below it is for placeholders and decoration —
 *    a marker name at 40% is a name nobody can read, on the rows somebody is
 *    most likely to be trying to read (they are the ones they cannot have
 *    yet). They keep full-tone type and lose only the affordance.
 *  · THE SELECTION WAS INVISIBLE ONCE THE PICKER SCROLLED. On a phone the card
 *    is above the chart and off screen by the time the chart is; there was no
 *    way to see what was plotted, let alone change it, without scrolling back.
 *    The three selected markers are chips above the chart now, each its own
 *    way out.
 *  · THREE CARDS IN A TWO-COLUMN GRID. `sm:grid-cols-2` with a hard maximum of
 *    three items is a 2 + 1 every single time — one card alone on a row with a
 *    card's width of nothing beside it. Three columns at lg, which is the
 *    maximum the selection can hold.
 *  · THE STATUS WORD IN THOSE CARDS WAS UNCOLOURED, while the same word in the
 *    legend directly above it was in its own state's colour. One word, one
 *    treatment.
 *
 * And each summary card carries the SERIES MARK the chart draws that marker
 * with, so a card can be matched to a line without counting down the legend.
 */

const MAX_SELECTED = 3;

/** Pairings worth offering unprompted — each is a relationship a clinician would actually look at together. */
const SUGGESTED_PAIRS: { label: string; markers: string[] }[] = [
  { label: 'Iron status', markers: ['Ferritin', 'Haemoglobin'] },
  { label: 'Blood sugar', markers: ['HbA1c', 'Fasting Insulin'] },
  { label: 'Cholesterol balance', markers: ['HDL Cholesterol', 'LDL Cholesterol'] },
  { label: 'Thyroid', markers: ['TSH', 'Free T4'] },
];

/**
 * ⚠ `SeriesMark` USED TO BE DEFINED HERE (Aug 2026), as a second copy of the
 * chart's own `SeriesSwatch` whose comment claimed it was "kept in step by
 * being the same three shapes in the same order". They had already drifted:
 * this one filled its marks with the plot surface, a light off-white in both
 * themes, and the chart's filled them with the card. It is one component in
 * components/ui/SeriesMark.tsx now, imported by both.
 *
 * It does NOT come through LazyCharts, and that matters: this screen is an
 * ordinary route chunk, so SeriesMark must not pull recharts in behind it.
 */

export function CompareView({
  filters,
  onCategoriesAvailable,
  onStatusCounts,
}: {
  filters: ResultsFilters;
  onStatusCounts?: (counts: Record<StatusFilter, number>) => void;
} & ViewReportsCategories) {
  const [markers, setMarkers] = useState<MarkerRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [series, setSeries] = useState<TrendSeries[] | null>(null);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [categories, setCategories] = useState<{ key: string; name: string }[]>([]);
  const { query, statusFilter, categoryFilter } = filters;
  const [searchParams, setSearchParams] = useSearchParams();

  const selected = useMemo(
    () => (searchParams.get('markers') ?? '').split(',').filter(Boolean).slice(0, MAX_SELECTED),
    [searchParams],
  );

  const load = useCallback(() => {
    setError(null);
    setMarkers(null);
    // A failed load is not "not enough history yet" — surface it with a retry
    // rather than telling a patient with results that they have none.
    apiFetch<MarkerRow[]>('/patient/markers')
      .then(setMarkers)
      .catch(setError);
    // Health areas for the shared picker. A failure here costs the category
    // filter and nothing else, so it degrades rather than blocking the view.
    apiFetch<{ key: string; name: string }[]>('/content/marker-categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selected.length === 0) {
      setSeries([]);
      return;
    }
    setLoadingSeries(true);
    apiFetch<TrendSeries[]>(`/patient/trends?markerIds=${selected.join(',')}`)
      .then(setSeries)
      .catch(() => setSeries([]))
      .finally(() => setLoadingSeries(false));
  }, [selected.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The selection goes into the URL WITHOUT taking the rest of it with it.
   *
   * This used to hand `setSearchParams` a fresh object, which replaces the
   * whole query string — including `view=compare`, the parameter that is the
   * only reason this component is mounted. So ticking the first marker rewrote
   * the URL to `/results?markers=<id>`, the page fell back to its default
   * arrangement, and the picker you had just used vanished mid-click. Harmless
   * when Compare was its own route at /trends; not harmless now that the view
   * lives in the same query string as the selection.
   */
  function setSelected(next: string[]) {
    const params = new URLSearchParams(searchParams);
    if (next.length) params.set('markers', next.join(','));
    else params.delete('markers');
    setSearchParams(params, { replace: true });
  }

  function toggle(markerId: string) {
    if (selected.includes(markerId)) setSelected(selected.filter((id) => id !== markerId));
    else if (selected.length < MAX_SELECTED) setSelected([...selected, markerId]);
  }

  /**
   * What can actually be put on this chart.
   *
   * Two conditions, and the picker used to enforce only the first. More than
   * one result, because one point is a dot and not a line — and MEASURED,
   * because a genome doesn't change between tests, a food-sensitivity level
   * has no reference range and a relative abundance is not an amount. The
   * server has always refused to plot those (see getMultiMarkerTrends), so
   * offering them here was a tick box whose only possible outcome was
   * "Nothing to plot".
   */
  const plottable = useMemo(
    () => (markers ?? []).filter((m) => m.resultCount > 1 && (m.resultType ?? 'MEASURED') === 'MEASURED'),
    [markers],
  );

  // The page's three controls narrow the picker, exactly as they narrow the
  // other two views. Search matches names AND aliases, because "ALT" and "TSH"
  // are the only names most people know these by.
  const matching = useMemo(
    () =>
      plottable.filter(
        (m) =>
          matchesMarkerQuery(m, query) &&
          matchesStatusFilter(m.status, statusFilter) &&
          matchesRangeFilter(m, categoryFilter) &&
          (categoryFilter === 'ALL' ||
            rangeFilterWantsRanged(categoryFilter) !== null ||
            (m.categoryKeys ?? []).includes(categoryFilter)),
      ),
    [plottable, query, statusFilter, categoryFilter],
  );

  const statusCounts = useMemo(() => statusFilterCounts(plottable), [plottable]);

  // Only the areas something plottable actually sits in — see the same rule on
  // the marker list.
  const filterableCategories = useMemo(() => {
    const present = new Set(plottable.flatMap((m) => m.categoryKeys ?? []));
    return categories.filter((c) => present.has(c.key));
  }, [categories, plottable]);

  useEffect(() => {
    onCategoriesAvailable?.(filterableCategories);
  }, [filterableCategories, onCategoriesAvailable]);
  useEffect(() => {
    onStatusCounts?.(statusCounts);
  }, [statusCounts, onStatusCounts]);

  const suggestions = useMemo(() => {
    if (plottable.length === 0) return [];
    return SUGGESTED_PAIRS.map((pair) => {
      const ids = pair.markers
        .map((name) => plottable.find((m) => m.name.toLowerCase() === name.toLowerCase())?.markerId)
        .filter((id): id is string => !!id);
      return { ...pair, ids };
    }).filter((p) => p.ids.length >= 2);
  }, [plottable]);

  /**
   * The selection, in the order it is plotted — so the chips, the summary
   * cards and the chart's own legend all name the same marker with the same
   * mark. Read from `plottable` rather than from the fetched series, because
   * the chips have to be right the instant a box is ticked rather than a
   * request later.
   */
  const selectedMarkers = useMemo(
    () => selected.map((id) => plottable.find((m) => m.markerId === id)).filter((m): m is MarkerRow => !!m),
    [selected, plottable],
  );

  return (
    <>
      {error ? (
        <ErrorState
          error={error}
          subject="your markers"
          onRetry={load}
          backTo={{ to: '/overview', label: 'Back to overview' }}
        />
      ) : markers === null ? (
        // Shaped like what replaces it: the picker column and the chart panel.
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-10" aria-busy="true" aria-label="Loading your markers">
          <Card padding="tight">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-5 h-10 w-full" />
            <Skeleton className="mt-3 h-10 w-full" />
            <Skeleton className="mt-3 h-10 w-3/4" />
          </Card>
          <Card>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-5 h-80 w-full" />
          </Card>
        </div>
      ) : plottable.length === 0 ? (
        <div className="max-w-2xl">
          <EmptyState
            title="Not enough history yet"
            description="A comparison needs at least two results for the same marker. After a second test, everything measured on both appears here."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-10">
          <div className="lg:sticky lg:top-8 lg:self-start">
            <Card padding="tight">
              {/* The label and the count on one line: they are the same fact
                  from two directions, and the count used to sit below the
                  suggestions where it read as a caption on them. */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="eyebrow">Choose markers</p>
                <p className="numeric tabular text-xs text-espresso/80" role="status">
                  {selected.length} of {MAX_SELECTED}
                </p>
              </div>

              {suggestions.length > 0 && (
                <div className="mt-5 border-b border-taupe pb-5">
                  <p className="sublabel mb-2.5">Common comparisons</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => setSelected(s.ids.slice(0, MAX_SELECTED))}
                        className="rounded-full border border-taupe px-3 py-1.5 text-xs font-medium text-espresso transition duration-150 ease-out hover:border-bronze hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* A MEASURED HEIGHT, NOT AN ARBITRARY ONE. The card is sticky, so
                  the list has to fit beside the chart at whatever height the
                  window is — and `max-h-96` was 384px whether the window was
                  700px or 1400px. The subtraction is the card's own chrome plus
                  the sticky offset; `.scroll-shade` fades the last few pixels so
                  a row continuing below the fold reads as a list that goes on
                  rather than as one that has been cut. */}
              <div className="scroll-thin scroll-shade mt-4 flex max-h-[min(30rem,calc(100vh-20rem))] flex-col gap-0.5 overflow-y-auto pr-1">
                {matching.length === 0 && (
                  <p className="py-3 text-sm text-espresso/80">No marker with more than one result matches those filters.</p>
                )}
                {matching.map((m) => {
                  const isSelected = selected.includes(m.markerId);
                  const atLimit = !isSelected && selected.length >= MAX_SELECTED;
                  return (
                    <div
                      key={m.markerId}
                      className={`rounded-input px-2 transition-colors duration-150 ${
                        isSelected ? 'bg-bronze/[0.08]' : atLimit ? '' : 'hover:bg-cream-200'
                      }`}
                    >
                      <Checkbox
                        id={`trend-marker-${m.markerId}`}
                        checked={isSelected}
                        disabled={atLimit}
                        onChange={() => toggle(m.markerId)}
                        label={
                          // FULL TONE EVEN AT THE LIMIT. The row that cannot be
                          // ticked is the one somebody is most likely to be
                          // reading, and /80 is the floor of the opacity ladder
                          // — a name at 40% is a name nobody can read. What a
                          // limited row gives up is the hover and the tick box,
                          // both of which are already visibly gone.
                          <span className="block">
                            <span className="block font-medium text-espresso">{m.name}</span>
                            <span className="block text-xs text-espresso/80">
                              <span className="numeric tabular">{m.resultCount}</span> results · latest{' '}
                              <span className="numeric tabular">{m.valueText ?? m.value}</span> {m.unit}
                            </span>
                          </span>
                        }
                      />
                    </div>
                  );
                })}
              </div>

              {/* No "that's the maximum, deselect one to swap it out": the
                  count above already reads "3 of 3" and the remaining boxes are
                  visibly disabled. */}
            </Card>
          </div>

          <div>
            {selected.length === 0 ? (
              /* A DESIGNED EMPTY STATE, not a sentence in a tall box. It used
                 to be `Pick a marker to begin` centred in a `min-h-96` card
                 with nothing else in it — which is the shape of a page that
                 failed to load. EmptyState is the product's own answer to
                 "there is deliberately nothing here": the arch behind it, a
                 title, and one line that says something the title cannot. */
              <EmptyState
                title="Nothing plotted yet"
                description={`Tick up to ${MAX_SELECTED} markers beside this, or take one of the common comparisons, to see them on one timeline.`}
              />
            ) : loadingSeries || series === null ? (
              <Card aria-busy="true" aria-label="Loading chart" className="min-h-96">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-5 h-80 w-full" />
              </Card>
            ) : series.length === 0 ? (
              <EmptyState
                title="No released results for that selection"
                description="Nothing has been released for these markers yet. Try another pair."
              />
            ) : (
              <>
                {/* ⚠ OPAQUE — the same measured exception as the marker page's trend
                    card. This chart's line colours are solved against the CARD,
                    and on a pane they fall under their own target. See
                    MarkerDetailPage for the figures. */}
                  <Card surface="card">
                  <p className="eyebrow mb-1">Compared over time</p>
                  <p className="mb-6 max-w-measure text-sm leading-relaxed text-espresso/80">
                    Each marker is plotted against its own reference range, so the two rules are shared: a line
                    between them is in range for that marker, and each line carries its own marker’s status along its
                    length.
                  </p>

                  {/* WHAT IS PLOTTED, AND THE WAY OUT OF EACH — above the chart
                      and therefore on screen with it. The picker is a sticky
                      column at lg and a card far above the chart on a phone, so
                      until this there was no way to see or change the selection
                      while looking at the thing it produced. */}
                  <ul aria-label="Markers on this chart" className="mb-6 flex flex-wrap gap-2">
                    {selectedMarkers.map((m, i) => (
                      <li key={m.markerId}>
                        <button
                          type="button"
                          onClick={() => toggle(m.markerId)}
                          aria-label={`${m.name}. Remove from this chart`}
                          className="inline-flex max-w-full items-center gap-2 rounded-full border border-taupe bg-cream-100 py-1.5 pl-2.5 pr-2.5 text-xs font-medium text-espresso transition duration-150 ease-out hover:border-bronze hover:text-bronze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
                        >
                          <SeriesMark index={i} />
                          <span aria-hidden="true" className="truncate">
                            {m.name}
                          </span>
                          <CloseIcon className="h-3 w-3 shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>

                  <MultiTrendChart series={series} />
                </Card>

                {/* THREE ACROSS, because the selection is capped at three. Two
                    columns made a 2 + 1 on every possible input, which is a
                    card's width of nothing beside the last one. `.card-row`
                    equalises the heights and makes each card a flex column, so
                    a short card spends the difference on its own gaps rather
                    than on a slab of empty card under its last line. */}
                <div className="card-row mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {series.filter((s) => s.points.length > 0).map((s, i) => {
                    const last = s.points[s.points.length - 1];
                    const first = s.points[0];
                    return (
                      <Reveal key={s.markerId} delay={staggerDelay(i)}>
                        <Link to={`/markers/${s.markerId}`} className="block rounded-card">
                          <Card interactive padding="tight">
                            {/* The mark this marker is drawn with, so a card
                                can be matched to a line without counting down
                                the legend. */}
                            <SeriesMark index={i} className="mb-3" />
                            <p className="text-balance font-display opsz-small text-lg leading-tight text-espresso">{s.name}</p>
                            <p className="numeric tabular mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-espresso">
                              <span className="text-espresso/80">{first.value}</span>
                              <span aria-hidden="true" className="text-taupe">
                                →
                              </span>
                              <span className="text-xl font-semibold">{last.value}</span>
                              <span className="text-sm text-espresso/80">{s.unit}</span>
                            </p>
                            {/* The status word takes its own state's colour,
                                exactly as it does in the legend directly above
                                and everywhere else in the product. It was the
                                one place the word was set in body tone. */}
                            <p className="mt-2.5 text-sm font-medium" style={{ color: statusColor(last.status) }}>
                              {/* statusLabel is total: it says "not compared to a range"
                                  for a point with no status, so the caller no longer
                                  carries its own copy of that sentence. */}
                              {statusLabel(last.status)}
                            </p>
                            <p className="mt-2 text-xs leading-snug text-espresso/80">
                              <span className="numeric">{formatDate(first.sampleDate)}</span> to{' '}
                              <span className="numeric">{formatDate(last.sampleDate)}</span>
                            </p>
                          </Card>
                        </Link>
                      </Reveal>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
