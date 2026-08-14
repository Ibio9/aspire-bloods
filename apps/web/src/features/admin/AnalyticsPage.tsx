import { useCallback, useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Segmented } from '../../components/ui/Segmented';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { apiFetch } from '../../lib/api';
import { downloadFromApi } from '../../lib/download';
import { ConsolePage } from './ConsolePage';

/**
 * ===========================================================================
 *  PRACTICE ANALYTICS — NUMBERS THE PRACTICE CAN ACT ON.
 * ===========================================================================
 *
 * Five questions, in the order a practice asks them: how many patients, how
 * much is coming through, how long it takes, what comes back out of range, and
 * what is being ordered.
 *
 * ── WHAT THIS SCREEN IS NOT ────────────────────────────────────────────────
 *
 * NOT VANITY CHARTS. There is no line graph on it, and that is deliberate
 * rather than unfinished: on a practice this size a weekly volume series is
 * six or eight points, and a chart of eight points is a picture of noise with
 * a trend implied over it. The figures are printed, and the period is a table
 * because a table is what somebody reads a row out of into an email.
 *
 * NOT A SECOND WORK QUEUE. Nothing here is actionable per row — every number
 * is a count over a window. The queue is where a clinician does the work; this
 * is where the practice looks at the shape of it.
 *
 * NOT INDIVIDUAL. No figure on this screen names a patient or carries a value,
 * and a row whose count is under the small-cell threshold is WITHHELD AND SAID
 * TO BE — see `SUPPRESS_BELOW` in the server's analyticsService.ts. A table
 * that quietly drops its own tail reads as complete and is not, so the number
 * of suppressed rows and the observations in them are printed under every
 * breakdown that has any.
 *
 * ── EVERY NUMBER SAYS WHAT IT MEANS AND OVER WHAT PERIOD ───────────────────
 *
 * The window is a control at the top, one figure, applied to everything — so
 * two numbers on this screen are always comparable with each other, which is
 * the whole reason they are on one screen. Each block carries a sentence
 * saying what it counts, because "42" under "Reports" is a number nobody can
 * check: released or received, in what window, including voided ones or not.
 */

interface CountedRow {
  key: string;
  label: string;
  count: number;
}

interface SuppressibleBreakdown {
  rows: CountedRow[];
  suppressedRows: number;
  suppressedCount: number;
}

interface PeriodPoint {
  start: string;
  received: number;
  released: number;
}

interface PracticeAnalytics {
  window: { from: string; to: string; days: number };
  generatedAt: string;
  suppressBelow: number;
  panels: SuppressibleBreakdown;
  markersOutOfRange: SuppressibleBreakdown;
  markerCoverage: { measuredMarkers: number; markersEverReported: number; markersNeverReported: number };
  weekly: PeriodPoint[];
  monthly: PeriodPoint[];
  turnaround: { released: number; medianMs: number | null; worstMs: number | null };
  outOfRange: { results: number; outOfRange: number; ratePerThousand: number | null };
  patients: { registered: number; active: number; withReleasedReport: number };
}

/**
 * THE WINDOWS ON OFFER, and why there are four rather than a date picker.
 *
 * A free date range is a control that has to be filled in before the screen
 * says anything, and the questions this screen answers are all "how are we
 * doing lately". Four fixed windows answer them in one press; the CSV carries
 * the same window, so anybody who needs an arbitrary range has the raw figures.
 */
const WINDOWS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '12 months' },
  { value: '1095', label: '3 years' },
] as const;

/** Hours to one decimal, or days past two of them. Same ladder as the work queue. */
function formatDuration(ms: number | null): string {
  if (ms == null) return '–';
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours / 24)} d`;
}

/** A month or week label a person reads, from the ISO date the server bucketed on. */
function periodLabel(iso: string, grain: 'week' | 'month'): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return grain === 'month'
    ? d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * One figure and what it means. The sentence is not optional: a number with a
 * two-word label is a number a reader has to guess the definition of, and the
 * guess is what ends up in an email to an insurer.
 */
function Figure({ value, label, meaning }: { value: string; label: string; meaning: string }) {
  return (
    <Card className="flex h-full flex-col">
      <p className="numeric tabular text-2xl font-medium leading-none text-espresso">{value}</p>
      <p className="mt-2 text-sm font-medium text-espresso">{label}</p>
      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-espresso/80">{meaning}</p>
    </Card>
  );
}

function Band({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <p className="eyebrow mb-2">{title}</p>
      <p className="mb-5 max-w-measure text-sm leading-relaxed text-espresso/85">{note}</p>
      {children}
    </section>
  );
}

/** A counted breakdown, with the suppressed tail accounted for rather than dropped. */
function Breakdown({
  data,
  nounColumn,
  countColumn,
  suppressBelow,
  emptyMessage,
}: {
  data: SuppressibleBreakdown;
  nounColumn: string;
  countColumn: string;
  suppressBelow: number;
  emptyMessage: string;
}) {
  if (data.rows.length === 0 && data.suppressedRows === 0) {
    return <EmptyState title="Nothing in this window" description={emptyMessage} />;
  }
  return (
    <Card padding="none">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{nounColumn}</TableHeaderCell>
            <TableHeaderCell className="text-right">{countColumn}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell>{r.label}</TableCell>
              <TableCell className="numeric tabular text-right">{r.count}</TableCell>
            </TableRow>
          ))}
          {data.suppressedRows > 0 && (
            // SAID, NOT DROPPED. The threshold is a privacy rule, and a table
            // that silently omits its tail is a table whose totals cannot be
            // checked against the figures above it.
            <TableRow>
              <TableCell className="text-espresso/80">
                {data.suppressedRows} withheld: each had fewer than {suppressBelow}, which on a practice this size can
                point at one patient
              </TableCell>
              <TableCell className="numeric tabular text-right text-espresso/80">{data.suppressedCount}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

function VolumeTable({ points, grain }: { points: PeriodPoint[]; grain: 'week' | 'month' }) {
  if (points.length === 0) {
    return <EmptyState title="Nothing in this window" description="No report arrived in the period selected above." />;
  }
  // NEWEST FIRST. The server returns them in time order because that is the
  // order they are computed in; a reader of a volume table wants the current
  // period at the top, and reversing here rather than there keeps the CSV
  // chronological, which is what a spreadsheet wants to chart.
  const rows = [...points].reverse();
  return (
    <Card padding="none">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{grain === 'month' ? 'Month' : 'Week beginning'}</TableHeaderCell>
            <TableHeaderCell className="text-right">Received</TableHeaderCell>
            <TableHeaderCell className="text-right">Released</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.start}>
              <TableCell className="numeric">{periodLabel(p.start, grain)}</TableCell>
              <TableCell className="numeric tabular text-right">{p.received}</TableCell>
              <TableCell className="numeric tabular text-right">{p.released}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/** The two regions the two segmented controls actually govern. */
const FIGURES_PANEL = 'analytics-figures';
const VOLUME_PANEL = 'analytics-volume';

const PURPOSE =
  'What the practice is ordering, how much is coming through, how long it takes and what comes back outside the range, counted over one window and exportable to a spreadsheet.';

export function AnalyticsPage() {
  const [days, setDays] = useState<string>('90');
  const [grain, setGrain] = useState<'week' | 'month'>('month');
  const [data, setData] = useState<PracticeAnalytics | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [exporting, setExporting] = useState(false);
  const { show } = useToast();

  const load = useCallback(() => {
    setError(null);
    setData(null);
    apiFetch<PracticeAnalytics>(`/admin/analytics?days=${days}`)
      .then(setData)
      .catch(setError);
  }, [days]);

  useEffect(load, [load]);

  async function exportCsv() {
    setExporting(true);
    try {
      // The same window the screen is showing. A download that quietly exported
      // a different period from the one on screen is the one way a spreadsheet
      // and a page can disagree while both being right.
      await downloadFromApi(`/admin/analytics.csv?days=${days}`, `aspire-analytics-${days}-days.csv`);
    } catch {
      show('That export could not be prepared. Please try again.', 'error');
    } finally {
      setExporting(false);
    }
  }

  const windowLabel = WINDOWS.find((w) => w.value === days)?.label ?? `${days} days`;

  return (
    <ConsolePage
      title="Analytics"
      purpose={PURPOSE}
      actions={
        <Button variant="secondary" loading={exporting} onClick={() => void exportCsv()}>
          Download these figures (CSV)
        </Button>
      }
    >
      {/* ONE WINDOW, APPLIED TO EVERYTHING BELOW IT. The `tabpanel` is the
          whole page body rather than a section of it, and that is the honest
          markup: pressing "12 months" changes every figure on the screen. */}
      <div className="mt-8">
        <Segmented
          label="Period these figures cover"
          options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
          value={days}
          onChange={setDays}
          panelId={FIGURES_PANEL}
        />
      </div>

      {error ? (
        <div className="mt-10">
          <ErrorState error={error} subject="the practice figures" onRetry={load} />
        </div>
      ) : data === null ? (
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="mt-3 h-4 w-32" />
            </Card>
          ))}
        </div>
      ) : (
        <div id={FIGURES_PANEL} role="tabpanel">
          <p className="numeric mt-6 text-xs text-espresso/80">
            {data.window.from} to {data.window.to}
          </p>

          <Band
            title="Patients"
            note="Everyone with a patient account on this deployment. Not filtered by the period, because an account does not expire, so these three are the only figures on this screen that describe the whole practice rather than the window."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Figure
                value={String(data.patients.registered)}
                label="Registered"
                meaning="Every patient account, including those not yet verified and those deactivated."
              />
              <Figure
                value={String(data.patients.active)}
                label="Active"
                meaning="Accounts that can sign in today. Excludes pending verification, deactivated and erased."
              />
              <Figure
                value={String(data.patients.withReleasedReport)}
                label="With a released report"
                meaning="Patients who have at least one report a clinician has released. The rest have signed up or been sampled and are still waiting."
              />
            </div>
          </Band>

          <Band
            title={`Turnaround over ${windowLabel.toLowerCase()}`}
            note="From the result arriving to a clinician releasing it. The median is the middle report of the window rather than an average, so every figure here is a duration a real report actually took. Voided reports are excluded."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Figure
                value={String(data.turnaround.released)}
                label="Reports released"
                meaning={`Released within the window. Received but not yet released is the work queue's job, not this one.`}
              />
              <Figure
                value={formatDuration(data.turnaround.medianMs)}
                label="Median"
                meaning="Half of the reports released in this window took less than this."
              />
              <Figure
                value={formatDuration(data.turnaround.worstMs)}
                label="Worst"
                meaning="The longest a single released report waited between arriving and reaching its patient."
              />
            </div>
          </Band>

          <Band
            title={`Out of range over ${windowLabel.toLowerCase()}`}
            note="Every measured result on a report released in this window. A result nobody compared against a range counts toward the total and toward neither side of it, which is the rule the patient-facing tallies follow."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Figure
                value={data.outOfRange.results.toLocaleString('en-GB')}
                label="Results released"
                meaning="Individual marker results on reports released in this window."
              />
              <Figure
                value={data.outOfRange.outOfRange.toLocaleString('en-GB')}
                label="Outside the range"
                meaning="Above, below or significantly out. Not a count of patients, and not a count of reports."
              />
              <Figure
                value={data.outOfRange.ratePerThousand === null ? '–' : String(data.outOfRange.ratePerThousand)}
                label="Per 1,000 results"
                meaning="Stated per thousand rather than as a percentage to one decimal: an integer is honest about the precision the sample supports."
              />
            </div>
          </Band>

          <Band
            title="Markers most often outside the range"
            note={`Counted across every report released in this window, by result rather than by patient, so one patient with a raised ferritin on three reports is three. Rows under ${data.suppressBelow} are withheld.`}
          >
            <Breakdown
              data={data.markersOutOfRange}
              nounColumn="Marker"
              countColumn="Out-of-range results"
              suppressBelow={data.suppressBelow}
              emptyMessage="No result on a report released in this window sat outside its reference range."
            />
          </Band>

          <Band
            title="What was ordered"
            note={`Reports released in this window, by the catalogue panel behind them. A report keyed in by hand or drawn ad hoc has no panel and is counted under its own name rather than dropped. Rows under ${data.suppressBelow} are withheld.`}
          >
            <Breakdown
              data={data.panels}
              nounColumn="Panel"
              countColumn="Reports released"
              suppressBelow={data.suppressBelow}
              emptyMessage="No report was released in this window."
            />
          </Band>

          <Band
            title="Catalogue coverage"
            note="How much of the analyte catalogue the practice has ever actually reported on. Across all time rather than the window: a marker reported once two years ago is still a marker the clinic can offer."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Figure
                value={String(data.markerCoverage.measuredMarkers)}
                label="Measured markers"
                meaning="Active analytes in the catalogue that produce a number against a reference range."
              />
              <Figure
                value={String(data.markerCoverage.markersEverReported)}
                label="Ever reported"
                meaning="Appeared on at least one released report, at any time."
              />
              <Figure
                value={String(data.markerCoverage.markersNeverReported)}
                label="Never reported"
                meaning="In the catalogue and never yet issued to a patient. Some are on panels the clinic does not sell."
              />
            </div>
          </Band>

          <Band
            title="Volume over time"
            note="Reports received against reports released. The two differ by whatever was in the queue at each end of the window, which is what makes the pair worth reading rather than either alone."
          >
            <div className="mb-5">
              <Segmented
                label="Group by"
                options={[
                  { value: 'month', label: 'Month' },
                  { value: 'week', label: 'Week' },
                ]}
                value={grain}
                onChange={(v) => setGrain(v as 'week' | 'month')}
                panelId={VOLUME_PANEL}
              />
            </div>
            <div id={VOLUME_PANEL} role="tabpanel">
              <VolumeTable points={grain === 'month' ? data.monthly : data.weekly} grain={grain} />
            </div>
          </Band>
        </div>
      )}
    </ConsolePage>
  );
}
