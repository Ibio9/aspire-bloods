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
import { UNIT } from './workQueueData';

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
  markersOutOfRangeByPanel: SuppressibleBreakdown;
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

/**
 * Hours to one decimal, or days past two of them. Same ladder as the Overview.
 *
 * `UNIT` is the narrow no-break space between the figure and its unit — see
 * workQueueData.ts for why every duration in the console goes through one of
 * these two functions and why the character is written as an escape.
 */
function formatDuration(ms: number | null): string {
  if (ms == null) return '–';
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)}${UNIT}min`;
  if (hours < 48) return `${hours.toFixed(1)}${UNIT}h`;
  return `${Math.round(hours / 24)}${UNIT}d`;
}

/** A month or week label a person reads, from the ISO date the server bucketed on. */
function periodLabel(iso: string, grain: 'week' | 'month'): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return grain === 'month'
    ? d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE DEFINITIONS MOVED BEHIND ONE AFFORDANCE (Aug 2026).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every figure carried a sentence under it and every band carried a paragraph
 * over it — eighteen figures and seven bands, so roughly 25 explanations on one
 * screen, including three sentences on what a median is and four on how
 * small-cell suppression works. The reasoning for them was good and is still
 * good: "42" under "Reports" is a number nobody can check without knowing
 * whether it counts released or received, over what window, voided included or
 * not, and the guess is what ends up in an email to an insurer.
 *
 * WHAT WAS WRONG WAS THE PLACEMENT, NOT THE CONTENT. A definition is read once
 * and then never again, and while it sits under its figure it is between the
 * reader and every subsequent visit to the screen. So none of it is deleted —
 * all of it is in `DEFINITIONS` below, behind one disclosure at the top of the
 * page, which is closed on arrival and is where somebody goes when they need to
 * check what a column means before quoting it.
 *
 * A figure is a number and a label now. Nothing else.
 */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <Card className="flex h-full flex-col">
      <p className="numeric tabular text-2xl font-medium leading-none text-espresso">{value}</p>
      <p className="mt-2 text-sm text-espresso/85">{label}</p>
    </Card>
  );
}

function Band({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <p className="eyebrow mb-4">{title}</p>
      {children}
    </section>
  );
}

/**
 * WHAT EVERY FIGURE ON THIS SCREEN COUNTS, in the one place a reader goes
 * looking for it. Kept verbatim from the sentences that used to sit under each
 * figure — this is a relocation and not a rewrite, because every one of those
 * definitions was correct and hard-won.
 */
const DEFINITIONS: { heading: string; lines: string[] }[] = [
  {
    heading: 'The window',
    lines: [
      'One control at the top, applied to everything below it, so any two figures on this screen are comparable with each other. Patients and catalogue coverage are the exceptions and say so: an account does not expire, and a marker reported once two years ago is still one the clinic can offer.',
      'Voided reports are excluded from every count. A voided report is one the practice has withdrawn, and counting it would make the volume figure a record of what was attempted rather than of what was issued.',
    ],
  },
  {
    heading: 'Turnaround',
    lines: [
      'Measured from the result arriving to a clinician releasing it, on the reports actually released in the window. The median is the middle report rather than an average of the two middles, so every duration here is one a real report took.',
    ],
  },
  {
    heading: 'Out of range',
    lines: [
      'Above, below or significantly out — counted by result, not by patient and not by report. A result nobody compared against a range counts toward the total and toward neither side of it, which is the rule the patient-facing tallies follow.',
      'Stated per thousand rather than as a percentage to one decimal: an integer is honest about the precision the sample supports.',
    ],
  },
  {
    heading: 'Withheld rows',
    lines: [
      'A row whose count falls under the threshold is withheld and SAID to be, with its observations still counted in the total. On a practice this size a count of one or two crossed with a marker points at an individual. A table that quietly drops its own tail reads as complete and is not.',
    ],
  },
];

function HowToRead({ suppressBelow }: { suppressBelow: number }) {
  return (
    <details className="group mt-8 max-w-measure">
      <summary className="cursor-pointer list-none text-sm font-medium text-bronze-600 underline underline-offset-2">
        How to read these figures
      </summary>
      <div className="mt-4 border-l-2 border-taupe pl-5">
        {DEFINITIONS.map((d) => (
          <div key={d.heading} className="mt-4 first:mt-0">
            <p className="sublabel">{d.heading}</p>
            {d.lines.map((line) => (
              <p key={line} className="mt-1.5 text-sm leading-relaxed text-espresso/85">
                {line}
              </p>
            ))}
          </div>
        ))}
        <p className="mt-4 text-sm leading-relaxed text-espresso/85">
          Rows under {suppressBelow} are the ones withheld. Nothing on this screen names a patient or carries a value,
          and every view and every export is recorded in the audit log.
        </p>
      </div>
    </details>
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

/** One short line. Every definition is behind "How to read these figures". */
const PURPOSE = 'How the practice is doing, over one window, exportable to a spreadsheet.';

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

          <HowToRead suppressBelow={data.suppressBelow} />

          <Band title="Patients">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Figure value={String(data.patients.registered)} label="Registered" />
              <Figure value={String(data.patients.active)} label="Active" />
              <Figure value={String(data.patients.withReleasedReport)} label="With a released report" />
            </div>
          </Band>

          <Band title={`Turnaround over ${windowLabel.toLowerCase()}`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Figure value={String(data.turnaround.released)} label="Reports released" />
              <Figure value={formatDuration(data.turnaround.medianMs)} label="Median" />
              <Figure value={formatDuration(data.turnaround.worstMs)} label="Worst" />
            </div>
          </Band>

          <Band title={`Out of range over ${windowLabel.toLowerCase()}`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Figure value={data.outOfRange.results.toLocaleString('en-GB')} label="Results released" />
              <Figure value={data.outOfRange.outOfRange.toLocaleString('en-GB')} label="Outside the range" />
              <Figure
                value={data.outOfRange.ratePerThousand === null ? '–' : String(data.outOfRange.ratePerThousand)}
                label="Per 1,000 results"
              />
            </div>
          </Band>

          <Band title="Packages ordered most">
            <Breakdown
              data={data.panels}
              nounColumn="Package"
              countColumn="Reports released"
              suppressBelow={data.suppressBelow}
              emptyMessage="No report was released in this window."
            />
          </Band>

          <Band title="Markers most often outside the range">
            <Breakdown
              data={data.markersOutOfRange}
              nounColumn="Marker"
              countColumn="Out-of-range results"
              suppressBelow={data.suppressBelow}
              emptyMessage="No result on a report released in this window sat outside its reference range."
            />
          </Band>

          {/* AND THE SAME COUNT SPLIT BY PACKAGE (Aug 2026). "Ferritin is our
              commonest out-of-range result" is interesting; "Ferritin is our
              commonest out-of-range result on Signature" is something the owner
              of the catalogue can act on, because a package is a thing they
              choose the contents of. Suppression bites harder here by
              construction — splitting a count across the packages it came from
              makes every cell smaller — and the withheld rows are stated. */}
          <Band title="Markers outside the range, by package">
            <Breakdown
              data={data.markersOutOfRangeByPanel}
              nounColumn="Package · marker"
              countColumn="Out-of-range results"
              suppressBelow={data.suppressBelow}
              emptyMessage="No result on a report released in this window sat outside its reference range."
            />
          </Band>

          <Band title="Catalogue coverage">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Figure value={String(data.markerCoverage.measuredMarkers)} label="Measured markers" />
              <Figure value={String(data.markerCoverage.markersEverReported)} label="Ever reported" />
              <Figure value={String(data.markerCoverage.markersNeverReported)} label="Never reported" />
            </div>
          </Band>

          <Band title="Volume over time">
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
