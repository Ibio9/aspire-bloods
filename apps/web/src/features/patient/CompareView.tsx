import { formatDate, NO_STATUS_LABEL } from '@aspire-bloods/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Checkbox } from '../../components/ui/Checkbox';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { MultiTrendChart } from '../../components/ui/MultiTrendChart';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
import { apiFetch } from '../../lib/api';
import { matchesMarkerQuery, matchesStatusFilter, statusFilterCounts, statusLabel, type StatusFilter } from '../../lib/markerCopy';
import { type MarkerRow, type TrendSeries } from '../../lib/patientPortal';
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
 */

const MAX_SELECTED = 3;

/** Pairings worth offering unprompted — each is a relationship a clinician would actually look at together. */
const SUGGESTED_PAIRS: { label: string; markers: string[] }[] = [
  { label: 'Iron status', markers: ['Ferritin', 'Haemoglobin'] },
  { label: 'Blood sugar', markers: ['HbA1c', 'Fasting Insulin'] },
  { label: 'Cholesterol balance', markers: ['HDL Cholesterol', 'LDL Cholesterol'] },
  { label: 'Thyroid', markers: ['TSH', 'Free T4'] },
];

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

  function setSelected(next: string[]) {
    setSearchParams(next.length ? { markers: next.join(',') } : {}, { replace: true });
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
          (categoryFilter === 'ALL' || (m.categoryKeys ?? []).includes(categoryFilter)),
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
            description="A comparison needs at least two results for the same marker. Once you've had a second test, everything measured on both appears here."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-10">
          <div className="lg:sticky lg:top-8 lg:self-start">
            <Card padding="tight">
              <p className="eyebrow mb-4">Choose markers</p>

              {suggestions.length > 0 && (
                <div className="mb-5 border-b border-taupe pb-5">
                  <p className="mb-2.5 text-xs text-espresso/80">Common comparisons</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => setSelected(s.ids.slice(0, MAX_SELECTED))}
                        className="rounded-full border border-taupe px-3 py-1.5 text-xs font-medium text-espresso transition duration-150 ease-out hover:border-bronze hover:bg-white"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-espresso/80" role="status">
                {selected.length} of {MAX_SELECTED} selected
              </p>

              <div className="scroll-thin mt-3 flex max-h-96 flex-col gap-1 overflow-y-auto pr-1">
                {matching.length === 0 && (
                  <p className="py-3 text-sm text-espresso/80">No marker with more than one result matches those filters.</p>
                )}
                {matching.map((m) => {
                  const isSelected = selected.includes(m.markerId);
                  const atLimit = !isSelected && selected.length >= MAX_SELECTED;
                  return (
                    <div
                      key={m.markerId}
                      className={`rounded-input px-2 transition-colors duration-150 ${atLimit ? 'opacity-40' : 'hover:bg-cream-200'}`}
                    >
                      <Checkbox
                        id={`trend-marker-${m.markerId}`}
                        checked={isSelected}
                        disabled={atLimit}
                        onChange={() => toggle(m.markerId)}
                        label={
                          <span className="block">
                            <span className="block font-medium text-espresso">{m.name}</span>
                            <span className="tabular block text-xs text-espresso/80">
                              {m.resultCount} results · latest {m.valueText ?? m.value} {m.unit}
                            </span>
                          </span>
                        }
                      />
                    </div>
                  );
                })}
              </div>

              {selected.length >= MAX_SELECTED && (
                <p className="mt-3 text-xs text-espresso/80">
                  That's the maximum. Deselect one to swap it out.
                </p>
              )}
            </Card>
          </div>

          <div>
            {selected.length === 0 ? (
              // Same min-height as the loading and chart panels beside it, so
              // choosing a first marker never jumps the layout.
              <Card className="flex min-h-96 flex-col items-center justify-center text-center">
                <p className="font-display text-3xl text-espresso">Pick a marker to begin</p>
                {/* How the shared band works is explained once, on the chart
                    it belongs to, rather than here as well. */}
                <p className="mt-3 max-w-md text-reading leading-relaxed text-espresso/80">
                  Choose two or three from the list, or start with one of the common comparisons.
                </p>
              </Card>
            ) : loadingSeries || series === null ? (
              <Card aria-busy="true" aria-label="Loading chart" className="min-h-96">
                <Skeleton className="h-80 w-full" />
              </Card>
            ) : series.length === 0 ? (
              <EmptyState
                title="Nothing to plot"
                description="We couldn't find released results for that selection. Try a different marker, or clear the selection and start again."
              />
            ) : (
              <>
                <Card>
                  <p className="eyebrow mb-1">Compared over time</p>
                  <p className="mb-6 text-sm leading-relaxed text-espresso/80">
                    Each marker is plotted against its own reference range, so the shaded band is shared: a line
                    inside it is in range for that marker.
                  </p>
                  <MultiTrendChart series={series} />
                </Card>

                <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {series.filter((s) => s.points.length > 0).map((s, i) => {
                    const last = s.points[s.points.length - 1];
                    const first = s.points[0];
                    return (
                      <Reveal key={s.markerId} delay={staggerDelay(i)} className="h-full">
                        <Link to={`/markers/${s.markerId}`} className="block h-full rounded-card">
                          <Card interactive padding="tight" className="h-full">
                            <p className="font-display text-xl leading-tight text-espresso">{s.name}</p>
                            <p className="tabular mt-2 text-sm text-espresso">
                              {first.value} → {last.value} {s.unit}
                            </p>
                            <p className="mt-1 text-xs text-espresso/80">
                              {formatDate(first.sampleDate)} to {formatDate(last.sampleDate)} ·{' '}
                              {last.status === null ? NO_STATUS_LABEL : statusLabel(last.status)}
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
