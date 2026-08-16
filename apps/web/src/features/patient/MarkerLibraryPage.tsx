import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
import { ArrowRightIcon } from '../../components/nav/patientIcons';
import { MarkerExplanationBody } from '../../components/patient/MarkerExplanation';
import { PrintHeader } from '../../components/patient/PrintDocument';
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
type KindFilter = 'ALL' | 'MEASURED' | 'GENETIC' | 'SENSITIVITY' | 'COMPOSITION' | 'QUALITATIVE';

const KINDS: { value: KindFilter; label: string }[] = [
  { value: 'ALL', label: 'Everything' },
  { value: 'MEASURED', label: 'Blood and clinic measurements' },
  { value: 'GENETIC', label: 'Genetic indicators' },
  { value: 'SENSITIVITY', label: 'Food sensitivity' },
  { value: 'COMPOSITION', label: 'Gut microbiome' },
  { value: 'QUALITATIVE', label: 'Findings and readings' },
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
  if (type === 'QUALITATIVE') return 'Qualitative result';
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
          className="flex w-full items-start justify-between gap-4 rounded-card p-5 text-left transition-colors duration-150 ease-out hover:bg-cream-100/50 sm:p-6"
        >
          <span className="min-w-0">
            <span className="block font-display opsz-small text-lg leading-tight text-espresso sm:text-xl">{entry.name}</span>
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
        // THE SECOND SURFACE REGISTER, on the same content class as the marker
        // page's explanation card: this is that component, and a reading ground
        // that appeared under one instance of it and not the other would be a
        // register that means "this page" rather than "this kind of writing".
        // Only the opened panel takes it — the closed row is a list item, and a
        // wall of four hundred vellum bars is a texture rather than a signal.
        // `rounded-b-card` because it is the foot of the card it sits in.
        <div id={panelId} className="card-glass glass-vellum rounded-b-card border-t border-taupe px-5 pb-6 pt-5 sm:px-6">
          {/* One presentation for every entry. Whether a clinician has yet
              signed the wording off is recorded server-side and shown in the
              admin review queue; it changes nothing here, on purpose. */}
          {/* The same four levels as the marker page's card, from the same
              component. These two used to be the same content styled two
              different ways, which is two places for one hierarchy to drift. */}
          <MarkerExplanationBody explanation={entry.explanation} labels="library" />

          {entry.hasResults && (
            <Link
              to={`/markers/${entry.markerId}`}
              className="mt-6 inline-flex items-center gap-1.5 rounded-input text-sm font-medium text-bronze-700 underline-offset-4 hover:underline"
            >
              See your own {entry.name} results <ArrowRightIcon />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}

/** See `shown` below: the library is 442 entries and this is how many are drawn at once. */
const LIBRARY_PAGE = 40;

export function MarkerLibraryPage() {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  /**
   * ── IT OPENS ON THE READER'S OWN MARKERS (Aug 2026) ────────────────────
   *
   * This defaulted to "Every marker", which on the demo patient is **442
   * cards** and a 44,000px page. The reader arriving here has a result they
   * want to understand; the other 276 analytes are the clinic's catalogue,
   * which is worth having and is not what somebody came for. A default nobody
   * changes is the design, and "Every marker" is one press away.
   *
   * `null` until the fetch lands rather than 'MINE' outright, because a patient
   * with no results yet must not be shown an empty library: for them the
   * catalogue IS the page. Derived below rather than written by an effect, so
   * there is no frame in which the wrong one is rendered — and once the reader
   * touches the picker their choice is what applies, in both directions.
   */
  const [filter, setFilter] = useState<LibraryFilter | null>(null);
  const [kind, setKind] = useState<KindFilter>('ALL');
  /**
   * How many entries are in the DOM at once.
   *
   * The library is 442 markers and it rendered every one of them: **55,150px**
   * at 1440, which is 61 screens, on a page whose whole purpose is looking one
   * thing up. It has a search and two filters — which is what makes a window
   * honest here rather than a way of hiding things — and each closed row is a
   * disclosure whose copy is not in the DOM until it is opened, so find-in-page
   * could never reach the explanations anyway.
   *
   * The count above the list is the FILTERED total and the button below says
   * how much of it is on the page, so a list that stops is never mistaken for a
   * list that has ended.
   */
  const [shown, setShown] = useState(LIBRARY_PAGE);

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

  const mineCount = entries?.filter((e) => e.hasResults).length ?? 0;

  /** The reader's choice if they have made one, otherwise the one their own data asks for. */
  const activeFilter: LibraryFilter = filter ?? (mineCount > 0 ? 'MINE' : 'ALL');

  const visible = useMemo(() => {
    if (!entries) return [];
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (activeFilter === 'ALL' || e.hasResults) &&
        (kind === 'ALL' || (e.resultType ?? 'MEASURED') === kind) &&
        (q === '' || e.name.toLowerCase().includes(q)),
    );
  }, [entries, query, activeFilter, kind]);

  // A narrowed set starts at the top of its own first window. Somebody who has
  // pressed "show more" four times and then searches wants the answer, not 160
  // cards of the previous question.
  useEffect(() => {
    setShown(LIBRARY_PAGE);
  }, [query, activeFilter, kind]);

  const rendered = useMemo(() => visible.slice(0, shown), [visible, shown]);

  return (
    <>
      {/* No standfirst. It said the page contained plain-English explanations,
          which is what the page visibly is, and that nothing here is a
          diagnosis, which the footer disclaimer says on every screen. */}
      <PrintHeader note="Reference material about what each marker measures. Not a result and not a diagnosis." />
      <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="Understanding your results" />
      {/* The way back to the first sign-in introduction, for anyone who skipped
          it or wants it again. It is a link on the page rather than a setting,
          because "show me that again" is a thing you do once and not a
          preference you keep. */}
      <Link
        to="/welcome"
        className="mt-3 inline-flex rounded-input text-sm font-medium text-bronze-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze print-hide"
      >
        Read the introduction to your results
      </Link>

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
            <Select
              label="Show"
              name="library-scope"
              value={activeFilter}
              onChange={(e) => setFilter(e.target.value as LibraryFilter)}
            >
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
            <>
              <div className="mt-4 flex flex-col gap-4">
                {rendered.map((entry, i) => (
                  <Reveal key={entry.markerId} delay={staggerDelay(i)}>
                    <LibraryCard entry={entry} />
                  </Reveal>
                ))}
              </div>
              {visible.length > rendered.length && (
                <div className="mt-8 flex flex-col items-start gap-3 border-t border-taupe pt-6">
                  <p className="numeric tabular text-sm text-espresso/80" role="status">
                    {rendered.length} of {visible.length} shown
                  </p>
                  <Button variant="secondary" onClick={() => setShown((n) => n + LIBRARY_PAGE)}>
                    Show {Math.min(LIBRARY_PAGE, visible.length - rendered.length)} more
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
