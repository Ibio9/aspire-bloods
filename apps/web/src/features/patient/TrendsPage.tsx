import { formatDate } from '@aspire-bloods/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { MultiTrendChart } from '../../components/ui/MultiTrendChart';
import { apiFetch } from '../../lib/api';
import { statusLabel } from '../../lib/markerCopy';
import { type MarkerRow, type TrendSeries } from '../../lib/patientPortal';

/**
 * Pick two or three markers, see them on one timeline. Someone paying £575
 * for a panel is buying the relationships between numbers, not the numbers —
 * ferritin against haemoglobin, HbA1c against fasting insulin — and until now
 * the portal could only ever show one marker at a time.
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

export function TrendsPage() {
  const [markers, setMarkers] = useState<MarkerRow[] | null>(null);
  const [series, setSeries] = useState<TrendSeries[] | null>(null);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [query, setQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  const selected = useMemo(
    () => (searchParams.get('markers') ?? '').split(',').filter(Boolean).slice(0, MAX_SELECTED),
    [searchParams],
  );

  useEffect(() => {
    apiFetch<MarkerRow[]>('/patient/markers')
      .then(setMarkers)
      .catch(() => setMarkers([]));
  }, []);

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

  /** Only markers with more than one result can show a trend — one point is a dot, not a line. */
  const plottable = useMemo(() => (markers ?? []).filter((m) => m.resultCount > 1), [markers]);

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plottable.filter((m) => q === '' || m.name.toLowerCase().includes(q));
  }, [plottable, query]);

  const suggestions = useMemo(() => {
    if (plottable.length === 0) return [];
    return SUGGESTED_PAIRS.map((pair) => {
      const ids = pair.markers
        .map((name) => plottable.find((m) => m.name.toLowerCase() === name.toLowerCase())?.markerId)
        .filter((id): id is string => !!id);
      return { ...pair, ids };
    }).filter((p) => p.ids.length >= 2);
  }, [plottable]);

  if (markers === null) {
    return (
      <div aria-busy="true" aria-label="Loading your markers">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-12 w-72" />
        <Skeleton className="mt-12 h-80 w-full" />
      </div>
    );
  }

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="Trends" />
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">
        Put up to {MAX_SELECTED} markers on one timeline to see how they've moved in relation to each other.
      </p>

      {plottable.length === 0 ? (
        <div className="mt-12 max-w-2xl">
          <EmptyState
            title="Not enough history yet"
            description="A trend needs at least two results for the same marker. Once you've had a second test, everything measured on both will be plottable here."
            action={
              <Link
                to="/markers"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-taupe px-5 py-2.5 text-sm font-medium text-espresso transition duration-150 ease-out hover:border-bronze"
              >
                See all markers
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-10">
          <div className="lg:sticky lg:top-8 lg:self-start">
            <Card className="!p-5 sm:!p-6">
              <p className="eyebrow mb-4">Choose markers</p>

              {suggestions.length > 0 && (
                <div className="mb-5 border-b border-taupe pb-5">
                  <p className="mb-2.5 text-xs text-espresso/70">Common comparisons</p>
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

              <Input
                label="Find a marker"
                name="trend-filter"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ferritin, HbA1c…"
                required={false}
              />

              <p className="mt-4 text-xs text-espresso/70" role="status">
                {selected.length} of {MAX_SELECTED} selected
              </p>

              <div className="scroll-thin mt-3 flex max-h-[360px] flex-col gap-1 overflow-y-auto pr-1">
                {matching.length === 0 && <p className="py-3 text-sm text-espresso/60">No marker matches that.</p>}
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
                            <span className="tabular block text-xs text-espresso/60">
                              {m.resultCount} results · latest {m.value} {m.unit}
                            </span>
                          </span>
                        }
                      />
                    </div>
                  );
                })}
              </div>

              {selected.length >= MAX_SELECTED && (
                <p className="mt-3 text-xs text-espresso/70">
                  That's the maximum. Deselect one to swap it out. More than three lines stops being a comparison.
                </p>
              )}
            </Card>
          </div>

          <div>
            {selected.length === 0 ? (
              <Card className="flex min-h-[340px] flex-col items-center justify-center text-center">
                <p className="font-display text-3xl text-espresso">Pick a marker to begin</p>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-espresso/80">
                  Choose two or three from the list, or start with one of the common comparisons. Each marker is
                  plotted against its own reference range, so markers measured in different units can share one chart.
                </p>
              </Card>
            ) : loadingSeries || series === null ? (
              <Card aria-busy="true" aria-label="Loading chart">
                <Skeleton className="h-[300px] w-full" />
              </Card>
            ) : series.length === 0 ? (
              <Card>
                <p className="font-display text-2xl text-espresso">Nothing to plot</p>
                <p className="mt-2 text-sm text-espresso/80">We couldn't find released results for that selection.</p>
              </Card>
            ) : (
              <>
                <Card>
                  <p className="eyebrow mb-1">Compared over time</p>
                  <p className="mb-6 text-sm leading-relaxed text-espresso/80">
                    The shaded band is the usual reference range, shared by every line, because each marker is
                    plotted against its own. A line inside the band is within range for that marker.
                  </p>
                  <MultiTrendChart series={series} />
                </Card>

                <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {series.map((s) => {
                    const last = s.points[s.points.length - 1];
                    const first = s.points[0];
                    return (
                      <Link key={s.markerId} to={`/markers/${s.markerId}`} className="rounded-card">
                        <Card interactive className="h-full !p-5 sm:!p-6">
                          <p className="font-display text-xl leading-tight text-espresso">{s.name}</p>
                          <p className="tabular mt-2 text-sm text-espresso">
                            {first.value} → {last.value} {s.unit}
                          </p>
                          <p className="mt-1 text-xs text-espresso/70">
                            {formatDate(first.sampleDate)} to {formatDate(last.sampleDate)} · {statusLabel(last.status)}
                          </p>
                        </Card>
                      </Link>
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
