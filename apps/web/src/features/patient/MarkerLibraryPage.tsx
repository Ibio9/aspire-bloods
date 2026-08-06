import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { ArrowRightIcon } from '../../components/nav/patientIcons';
import { apiFetch } from '../../lib/api';
import type { LibraryEntry } from '../../lib/patientPortal';

/**
 * The explanation copy as somewhere you can go, rather than something you can
 * only stumble into by clicking a specific result. Someone who wants to read
 * up on what ferritin actually measures shouldn't first have to find a
 * ferritin result.
 *
 * Entries expand in place — the copy is a few paragraphs, so a page per
 * marker would be a navigation step that buys nothing, and it would push
 * "read about a marker" to three clicks from Overview.
 */

type LibraryFilter = 'ALL' | 'MINE';

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: 'ALL', label: 'Every marker' },
  { value: 'MINE', label: 'Markers you’ve had tested' },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
    >
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LibraryCard({ entry }: { entry: LibraryEntry }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <Card className="!p-0">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-start justify-between gap-4 rounded-card p-5 text-left transition-colors duration-150 ease-out hover:bg-cream-100 sm:p-6"
        >
          <span className="min-w-0">
            <span className="block font-display text-xl leading-tight text-espresso sm:text-2xl">{entry.name}</span>
            <span className="mt-1.5 block text-xs text-espresso/70">
              Measured in {entry.unit}
              {entry.hasResults && ' · you have results for this'}
              {entry.panels.length > 0 && ` · ${entry.panels.slice(0, 2).join(', ')}`}
            </span>
          </span>
          <span className="mt-1 text-bronze-700">
            <ChevronIcon open={open} />
          </span>
        </button>
      </h3>

      {open && (
        <div id={panelId} className="border-t border-taupe px-5 pb-6 pt-5 sm:px-6">
          {entry.explanation.pending ? (
            <p className="text-[15px] leading-relaxed text-espresso/80">{entry.explanation.whatItIs}</p>
          ) : (
            <div className="flex max-w-2xl flex-col gap-5 text-[15px] leading-relaxed text-espresso">
              <p>{entry.explanation.whatItIs}</p>
              {entry.explanation.highMeans && (
                <div>
                  <p className="font-medium">If it's above the usual range</p>
                  <p className="mt-1">{entry.explanation.highMeans}</p>
                </div>
              )}
              {entry.explanation.lowMeans && (
                <div>
                  <p className="font-medium">If it's below the usual range</p>
                  <p className="mt-1">{entry.explanation.lowMeans}</p>
                </div>
              )}
              {entry.explanation.lifestyleContext && (
                <div>
                  <p className="font-medium">Lifestyle context</p>
                  <p className="mt-1">{entry.explanation.lifestyleContext}</p>
                </div>
              )}
            </div>
          )}

          {entry.hasResults && (
            <Link
              to={`/markers/${entry.markerId}`}
              className="mt-6 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-bronze-700 underline-offset-4 hover:underline"
            >
              See your own {entry.name} results <ArrowRightIcon />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}

export function MarkerLibraryPage() {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('ALL');

  useEffect(() => {
    apiFetch<LibraryEntry[]>('/patient/library')
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  const visible = useMemo(() => {
    if (!entries) return [];
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) => (filter === 'ALL' || e.hasResults) && (q === '' || e.name.toLowerCase().includes(q)),
    );
  }, [entries, query, filter]);

  const mineCount = entries?.filter((e) => e.hasResults).length ?? 0;

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic — Patient portal" title="Understanding your results" />
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">
        Plain-English explanations of what each marker measures, written and reviewed by the Aspire clinical team.
        Nothing here is a diagnosis — it's background, so the numbers mean something when you read them.
      </p>

      {entries === null ? (
        <div className="mt-12 flex flex-col gap-4" aria-busy="true" aria-label="Loading the marker library">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="!p-5 sm:!p-6">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="mt-3 h-3 w-40" />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Find a marker"
              name="library-filter"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ferritin, vitamin D…"
              required={false}
            />
            <Select label="Show" name="library-scope" value={filter} onChange={(e) => setFilter(e.target.value as LibraryFilter)}>
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.value === 'MINE' ? `${f.label} (${mineCount})` : f.label}
                </option>
              ))}
            </Select>
          </div>

          <p className="mt-6 text-sm text-espresso/70" role="status">
            {visible.length} marker{visible.length === 1 ? '' : 's'}
          </p>

          {visible.length === 0 ? (
            <Card className="mt-4 max-w-2xl">
              <p className="font-display text-2xl text-espresso">Nothing matches</p>
              <p className="mt-2 text-sm text-espresso/80">
                Try a different spelling, or switch “Show” back to every marker.
              </p>
            </Card>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              {visible.map((entry) => (
                <LibraryCard key={entry.markerId} entry={entry} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
