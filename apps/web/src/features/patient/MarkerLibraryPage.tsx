import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
import { ArrowRightIcon } from '../../components/nav/patientIcons';
import { apiFetch } from '../../lib/api';
import type { LibraryEntry } from '../../lib/patientPortal';

/**
 * The explanation copy as somewhere you can go, rather than something you can
 * only stumble into by clicking a specific result. Someone who wants to read
 * up on what ferritin actually measures shouldn't first have to find a
 * ferritin result.
 *
 * Entries expand in place: the copy is a few paragraphs, so a page per marker
 * would be a navigation step that buys nothing, and it would push "read about
 * a marker" to three clicks from Overview.
 */

type LibraryFilter = 'ALL' | 'MINE';

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: 'ALL', label: 'Every marker' },
  { value: 'MINE', label: 'Markers you’ve had tested' },
];

/**
 * A second axis, because the library is no longer a few dozen entries.
 *
 * It now lists every marker the clinic can report, and at Signature that is
 * 207 food sensitivity items alongside about 120 blood analytes. Without this
 * the foods bury everything else, which is the same reason the report itself
 * gives each non-measured type its own section and its own filters.
 */
type KindFilter = 'ALL' | 'MEASURED' | 'GENETIC' | 'SENSITIVITY' | 'COMPOSITION';

const KINDS: { value: KindFilter; label: string }[] = [
  { value: 'ALL', label: 'Everything' },
  { value: 'MEASURED', label: 'Blood and clinic measurements' },
  { value: 'GENETIC', label: 'Genetic indicators' },
  { value: 'SENSITIVITY', label: 'Food sensitivity' },
  { value: 'COMPOSITION', label: 'Gut microbiome' },
];

/**
 * The line under a marker's name. "Measured in mmol/L" is right for a blood
 * analyte and wrong for everything else: a food IgG item and a genetic
 * indicator have no unit, and the old wording rendered as a dangling
 * "Measured in " for both.
 */
function kindLabel(entry: LibraryEntry): string {
  const type = entry.resultType ?? 'MEASURED';
  if (type === 'GENETIC') return 'Genetic indicator';
  if (type === 'SENSITIVITY') return 'Food sensitivity';
  if (type === 'COMPOSITION') return 'Microbiome composition';
  return entry.unit ? `Measured in ${entry.unit}` : 'Measured at the clinic';
}

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
    <Card padding="none">
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
            <span className="mt-1.5 block text-xs text-espresso/80">
              {kindLabel(entry)}
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
          {/* One presentation for every entry. Whether a clinician has yet
              signed the wording off is recorded server-side and shown in the
              admin review queue; it changes nothing here, on purpose. */}
          <div className="flex max-w-2xl flex-col gap-5 text-reading leading-relaxed text-espresso">
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
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('ALL');
  const [kind, setKind] = useState<KindFilter>('ALL');

  const load = useCallback(() => {
    setError(null);
    setEntries(null);
    apiFetch<LibraryEntry[]>('/patient/library')
      .then(setEntries)
      .catch(setError);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (!entries) return [];
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (filter === 'ALL' || e.hasResults) &&
        (kind === 'ALL' || (e.resultType ?? 'MEASURED') === kind) &&
        (q === '' || e.name.toLowerCase().includes(q)),
    );
  }, [entries, query, filter, kind]);

  const mineCount = entries?.filter((e) => e.hasResults).length ?? 0;

  return (
    <>
      {/* No standfirst. It said the page contained plain-English explanations,
          which is what the page visibly is, and that nothing here is a
          diagnosis, which the footer disclaimer says on every screen. */}
      <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="Understanding your results" />

      {error ? (
        <div className="mt-10">
          <ErrorState
            error={error}
            subject="the marker library"
            onRetry={load}
            backTo={{ to: '/overview', label: 'Back to overview' }}
          />
        </div>
      ) : entries === null ? (
        <div className="mt-10 flex flex-col gap-4" aria-busy="true" aria-label="Loading the marker library">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i} padding="tight">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="mt-3 h-3 w-40" />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <Select label="Kind" name="library-kind" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </div>

          <p className="mt-6 text-sm text-espresso/80" role="status">
            {visible.length} marker{visible.length === 1 ? '' : 's'}
          </p>

          {visible.length === 0 ? (
            <div className="mt-4 max-w-2xl">
              <EmptyState title="No marker matches that" />
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              {visible.map((entry, i) => (
                <Reveal key={entry.markerId} delay={staggerDelay(i)}>
                  <LibraryCard entry={entry} />
                </Reveal>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
