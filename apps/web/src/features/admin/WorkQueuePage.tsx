import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '@aspire-bloods/shared';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import type { QueueState } from '../../lib/reportStatus';
import { ConsolePage } from './ConsolePage';

/**
 * ===========================================================================
 *  WHAT IS WAITING FOR A CLINICIAN, AND WHAT IS STUCK.
 * ===========================================================================
 *
 * A WORK LIST, NOT A DASHBOARD. There are no charts on this screen and there
 * should not be: every row is something a person opens and acts on, and every
 * number above the rows is a count of rows or a duration a real report actually
 * took. Nothing here is an average of things that did not happen.
 *
 * THE EXCEPTIONS LEAD. With the verification stage gone, the exception queue is
 * the only thing standing between a bad parse and a clinician's screen, and it
 * was invisible — a count on a card halfway down the console, and an unmapped
 * analyte list on a screen only an admin ever opens. It is the first band here,
 * and it is the one band that says nothing at all when it is empty rather than
 * congratulating anybody.
 *
 * ORDER IS THE POINT. The list is sorted by time in the current state, longest
 * first, across every bucket — because the question a queue answers is "who has
 * been waiting", and grouping by state answers "what kind of waiting" which is
 * the second question. The buckets are a summary OF the list, not a different
 * arrangement of it.
 */

interface QueuedReport {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  state: QueueState | 'RELEASED';
  status: string;
  holdReasons: string[];
  inStateSince: string | null;
  inStateMs: number | null;
  sampleDate: string;
  receivedDate: string;
}

interface BackupStatus {
  neverRun: boolean;
  lastSuccessAt: string | null;
  hoursSinceSuccess: number | null;
  overdue: boolean;
  overdueAfterHours: number;
  lastRun: {
    startedAt: string;
    finishedAt: string | null;
    outcome: 'SUCCEEDED' | 'FAILED';
    objectKey: string | null;
    failureStage: string | null;
    errorMessage: string | null;
  } | null;
}

interface WorkQueue {
  backup: BackupStatus;
  buckets: {
    state: QueueState | 'RELEASED';
    count: number;
    oldest: { reportId: string; inStateSince: string | null; inStateMs: number | null } | null;
  }[];
  reports: QueuedReport[];
  turnaround: {
    sampleSize: number;
    medianMs: number | null;
    worstMs: number | null;
    worstReportId: string | null;
    windowDays: number;
  };
  exceptions: { heldReports: number; unmappedAnalytes: number; unplacedResults: number };
  generatedAt: string;
}

const STATE_LABEL: Record<string, string> = {
  HELD: 'Held',
  AWAITING_REVIEW: 'Awaiting clinician review',
  AWAITING_RELEASE: 'Reviewed, ready to release',
  AWAITING_PARSE: 'Results not read yet',
  RELEASED: 'Released',
};

/** One line saying what this bucket is, for the person who has to clear it. */
const STATE_MEANING: Record<string, string> = {
  HELD: 'Something in the delivery needs a decision before the report is reviewed.',
  AWAITING_REVIEW: 'A clinician has to decide the patient can see this.',
  AWAITING_RELEASE: 'Reviewed. One press away from the patient.',
  AWAITING_PARSE: 'The results have not been read off the delivery yet.',
};

/**
 * A duration in the largest unit that still says something useful.
 *
 * Days and hours, never "2.4 days": a queue is read at a glance and a decimal
 * in a duration is a number to parse rather than a fact to act on. Under an
 * hour reads in minutes, because on the day a report lands that is the
 * difference between "just arrived" and "sat there all morning".
 */
function formatDuration(ms: number | null): string {
  // An EN dash, not an em dash. House style refuses the em dash in anything a
  // reader sees, and this one had escaped because the copy spec only ever
  // walked the patient portal. The en dash is the conventional nil glyph in a
  // table of figures and is the same character a numeric range keeps.
  if (ms == null) return '–';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

/**
 * How long is too long, said as a weight rather than as a colour.
 *
 * Deliberately NOT a traffic-light: red, amber and green mean a clinical
 * finding everywhere else in this product, and reusing them for "this report is
 * old" would make the vocabulary mean two things. An overdue row is set in the
 * full text colour with its duration in medium weight; everything else is
 * quieter. The sort order is what actually carries urgency.
 */
const OVERDUE_MS = 48 * 3_600_000;

/**
 * "3h ago". Moved here with the cards that used it when the console landing
 * page was merged away (Aug 2026) — it is a relative REQUEST age, which is a
 * different question from `formatDuration`'s "how long has this been in this
 * state", and the two read differently on purpose.
 */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ERASURE REQUESTS — MOVED HERE FROM THE OLD CONSOLE LANDING PAGE (Aug 2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// It sat on `AdminDashboard`, which has been merged into this screen. It is
// not clinical and it is not a report, so it could have gone anywhere; it is
// HERE because it is the same shape of thing as every other band on this page
// — an outstanding decision with a clock running on it, that nothing else in
// the console would ever surface. A queue is where a queue belongs.
//
// ADMIN only, and it renders nothing at all when there is nothing outstanding.

interface ErasureRequest {
  id: string;
  status: string;
  requestedAt: string;
  purgeScheduledAt: string | null;
  patientId: string;
  patientName: string | null;
  patientEmail: string;
}

const ERASURE_STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Awaiting a decision',
  SCHEDULED: 'Purge scheduled',
  COMPLETED: 'Purged',
  REJECTED: 'Declined',
};

/**
 * Erasure requests, and the decision on them.
 *
 * This is a RELOCATION, not a new feature. A patient could raise an erasure
 * request from their own account and an admin could raise one from a patient's
 * profile, and the server has always had both the list and the approval — but
 * nothing in the console ever called either. A request went in and stopped: no
 * screen listed it, so a request raised by a patient could not be found at all
 * without knowing whose it was. That is a legal obligation dead-ending in a
 * table nobody could read.
 *
 * Scheduling sets a purge date rather than deleting anything. The job
 * de-identifies the profile; clinical results are retained under the
 * practice's records obligation. Both facts are said on the card, because an
 * admin approving this needs to know what it does and does not remove.
 */
function ErasureRequestsCard() {
  const [requests, setRequests] = useState<ErasureRequest[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [scheduling, setScheduling] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<ErasureRequest[]>('/admin/erasure-requests')
      .then(setRequests)
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  async function schedule(id: string) {
    setScheduling(id);
    try {
      await apiFetch(`/admin/erasure-requests/${id}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ purgeInDays: 30 }),
      });
      load();
    } finally {
      setScheduling(null);
    }
  }

  if (failed || requests === null) return null;

  // Outstanding decisions lead; anything already settled is history and lives
  // in the audit log rather than on the screen an admin opens every morning.
  const outstanding = requests.filter((r) => r.status === 'REQUESTED');
  if (outstanding.length === 0) return null;

  return (
    <div className="mt-14">
      <p className="eyebrow mb-4">Erasure requests</p>
      <Card className="max-w-2xl">
        <p className="text-sm leading-relaxed text-espresso/85">
          Approving one schedules a purge in 30 days. It de-identifies the patient’s profile; clinical results are
          kept under the practice’s records retention obligation. Nothing is deleted immediately and every step is
          audited.
        </p>
        <ul className="mt-4 border-t border-taupe">
          {outstanding.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-taupe py-3">
              <div>
                <Link
                  to={`/admin/patients/${r.patientId}`}
                  className="text-sm font-medium text-bronze-600 underline underline-offset-2"
                >
                  {r.patientName ?? r.patientEmail}
                </Link>
                <p className="tabular text-xs text-espresso/80">
                  {ERASURE_STATUS_LABEL[r.status] ?? r.status} · requested {timeAgo(r.requestedAt)}
                </p>
              </div>
              <Button variant="secondary" loading={scheduling === r.id} onClick={() => void schedule(r.id)}>
                Schedule the purge
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}


/**
 * IS THERE A COPY OF THE DATABASE ANYWHERE ELSE.
 *
 * First band on the page, above the exceptions, and that ordering is the whole
 * point of it. On 12 August 2026 the R2 bucket was inspected for the first time:
 * 0 bytes, empty, zero operations. The script was correct, the verification
 * logic was good, and no Railway service had ever been created to run it — so
 * the practice had been operating with no off-platform backup for months and
 * nothing anywhere could have said so.
 *
 * The failure mode of a backup job is not crashing, it is being ABSENT, and
 * absence is silent by construction. This is the thing that makes it loud.
 *
 * THREE STATES, NOT TWO. "Never run" and "last succeeded four days ago" are
 * different problems: the first means the cron service does not exist or has
 * never fired, the second means it exists and has stopped. And a run that
 * FAILED last night is a third — the job is alive and the backup is not — which
 * a panel showing only the last success would render as ordinary staleness.
 *
 * NOT A TRAFFIC LIGHT. Red, amber and green mean a clinical finding everywhere
 * else in this product and reusing them here would make the vocabulary mean two
 * things. An overdue backup is carried by the word, by full text weight against
 * the muted default, and by leading the page.
 */
function BackupBand({ backup }: { backup: BackupStatus }) {
  const failedLast = backup.lastRun?.outcome === 'FAILED';

  const headline = backup.neverRun
    ? 'never'
    : backup.hoursSinceSuccess === null
      ? 'never'
      : backup.hoursSinceSuccess < 1
        ? 'under an hour ago'
        : backup.hoursSinceSuccess < 48
          ? `${backup.hoursSinceSuccess} h ago`
          : `${Math.floor(backup.hoursSinceSuccess / 24)} d ago`;

  return (
    <div className="mt-10">
      <p className="eyebrow mb-4">Off-platform backup</p>
      <Card className="max-w-3xl">
        <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
          <div>
            <p
              className={`numeric tabular text-2xl font-medium leading-none ${
                backup.overdue ? 'text-espresso' : 'text-espresso/85'
              }`}
            >
              {headline}
            </p>
            <p className="mt-1.5 text-sm text-espresso/85">last successful backup</p>
          </div>
          {backup.lastRun && (
            <div>
              <p className="text-sm font-medium text-espresso">
                {backup.lastRun.outcome === 'SUCCEEDED' ? 'Last run succeeded' : 'Last run FAILED'}
              </p>
              <p className="numeric mt-1 text-xs text-espresso/80">{formatDate(backup.lastRun.startedAt)}</p>
            </div>
          )}
        </div>

        {backup.neverRun && (
          // The state that was live for months, said in as many words. Not
          // "unknown" and not "no data": there has never been a backup.
          <p className="mt-5 max-w-measure border-t border-taupe pt-4 text-sm font-medium leading-relaxed text-espresso">
            No backup has ever run. There is no off-platform copy of this database. The backup script exists in the
            repository; what is missing is a Railway cron service to run it. See DEPLOYMENT.md, “Standing up the backup
            cron service”.
          </p>
        )}

        {!backup.neverRun && backup.overdue && (
          <p className="mt-5 max-w-measure border-t border-taupe pt-4 text-sm font-medium leading-relaxed text-espresso">
            The last successful backup is more than {backup.overdueAfterHours} hours old. The job runs nightly, so two
            missed nights means it has stopped rather than stumbled. Check the backup service’s own logs in Railway.
          </p>
        )}

        {failedLast && backup.lastRun && (
          <p className="mt-4 max-w-measure text-sm leading-relaxed text-espresso/85">
            The last run failed
            {backup.lastRun.failureStage ? ` at the ${backup.lastRun.failureStage.toLowerCase()} stage` : ''}.
            {backup.lastRun.errorMessage ? ` ${backup.lastRun.errorMessage}` : ''}
          </p>
        )}

        {!backup.overdue && !failedLast && backup.lastRun?.objectKey && (
          <p className="numeric mt-5 border-t border-taupe pt-4 text-xs text-espresso/80">
            {backup.lastRun.objectKey}
          </p>
        )}
      </Card>
    </div>
  );
}

function ExceptionsBand({ exceptions }: { exceptions: WorkQueue['exceptions'] }) {
  const items = [
    {
      key: 'held',
      count: exceptions.heldReports,
      label: 'report held on a parse question',
      plural: 'reports held on a parse question',
      to: '/admin?queue=HELD',
      linkLabel: 'Open the held reports',
      why: 'An unmapped analyte, an unrecognised code, a row that could not be filed, a disagreement with the laboratory’s own high/low flag, or a delivery that is not finished. Each report says which.',
    },
    {
      key: 'analytes',
      count: exceptions.unmappedAnalytes,
      label: 'analyte spelling no marker answered to',
      plural: 'analyte spellings no marker answered to',
      to: '/admin/ingestion-log',
      linkLabel: 'Open the ingestion log',
      why: 'The result is recorded and is not on any report. Accepting a mapping puts it back.',
    },
    {
      key: 'unplaced',
      count: exceptions.unplacedResults,
      label: 'result that could not be attached to a patient',
      plural: 'results that could not be attached to a patient',
      to: '/admin/linking',
      linkLabel: 'Open result linking',
      why: 'The order reference, the name and the date of birth did not agree with one record.',
    },
  ].filter((i) => i.count > 0);

  if (items.length === 0) {
    return (
      <div className="mt-10">
        <p className="eyebrow mb-4">Exceptions</p>
        <Card className="max-w-3xl">
          <p className="text-sm leading-relaxed text-espresso/85">
            Nothing is held. Every delivery matched a marker for every row, every code was one we hold, and every
            result was attached to a patient.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <p className="eyebrow mb-4">Exceptions</p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {items.map((item) => (
          <Card key={item.key} className="flex h-full flex-col">
            <p className="numeric tabular text-3xl font-medium leading-none text-espresso">{item.count}</p>
            <p className="mt-2 text-sm font-medium text-espresso">{item.count === 1 ? item.label : item.plural}</p>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-espresso/80">{item.why}</p>
            <div className="mt-4 border-t border-taupe pt-3">
              <Link to={item.to} className="text-sm font-medium text-bronze-600 underline underline-offset-2">
                {item.linkLabel}
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TurnaroundBand({ turnaround }: { turnaround: WorkQueue['turnaround'] }) {
  return (
    <div className="mt-14">
      <p className="eyebrow mb-4">Arrival to release, last {turnaround.windowDays} days</p>
      <Card className="max-w-3xl">
        {turnaround.sampleSize === 0 ? (
          <p className="text-sm leading-relaxed text-espresso/85">
            Nothing has been released in the last {turnaround.windowDays} days, so there is no turnaround to report.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-14 gap-y-5">
              <div>
                <p className="numeric tabular text-2xl font-medium leading-none text-espresso">
                  {formatDuration(turnaround.medianMs)}
                </p>
                <p className="mt-1.5 text-sm text-espresso/85">median</p>
              </div>
              <div>
                <p className="numeric tabular text-2xl font-medium leading-none text-espresso">
                  {formatDuration(turnaround.worstMs)}
                </p>
                <p className="mt-1.5 text-sm text-espresso/85">worst</p>
              </div>
              <div>
                <p className="numeric tabular text-2xl font-medium leading-none text-espresso">
                  {turnaround.sampleSize}
                </p>
                <p className="mt-1.5 text-sm text-espresso/85">
                  report{turnaround.sampleSize === 1 ? '' : 's'} released
                </p>
              </div>
            </div>
            <p className="mt-5 border-t border-taupe pt-3 text-xs leading-relaxed text-espresso/80">
              Measured from the moment the results arrived to the moment they were released, on the reports actually
              released in the window. The median is a duration one of them took, not an average of the two middles.
              {turnaround.worstReportId && (
                <>
                  {' '}
                  <Link
                    to={`/admin/reports/${turnaround.worstReportId}`}
                    className="font-medium text-bronze-600 underline underline-offset-2"
                  >
                    Open the slowest one
                  </Link>
                  .
                </>
              )}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

/** One line, at the top, saying what a clinician comes here to do. */
const PURPOSE =
  'Everything waiting on somebody, longest first: reports to review or release, deliveries that stopped on a question, and whether last night’s backup ran.';

export function WorkQueuePage() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<WorkQueue | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    setQueue(null);
    apiFetch<WorkQueue>('/admin/work-queue').then(setQueue).catch(setError);
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <ConsolePage title="Work queue" purpose={PURPOSE}>
        <div className="mt-10">
          <ErrorState error={error} subject="the work queue" onRetry={load} />
        </div>
      </ConsolePage>
    );
  }

  return (
    <ConsolePage title="Work queue" purpose={PURPOSE}>
      <p className="mt-2 max-w-measure text-sm leading-relaxed text-espresso/85">
        Every figure comes from the reports themselves and from the audit log{user?.displayName ? `, ${user.displayName}` : ''};
        nothing on this screen is tracked separately.
      </p>

      {queue === null ? (
        <div className="mt-10 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-3 h-4 w-40" />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <BackupBand backup={queue.backup} />
          <ExceptionsBand exceptions={queue.exceptions} />

          <div className="mt-14">
            <p className="eyebrow mb-4">Where the open reports are</p>
            {queue.buckets.every((b) => b.count === 0) ? (
              <EmptyState
                title="Nothing open"
                description="Every report the practice holds is released or voided."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {queue.buckets.map((bucket) => (
                  <Link key={bucket.state} to={`/admin?queue=${bucket.state}`} className="rounded-card">
                    <Card interactive className="flex h-full flex-col">
                      <p className="numeric tabular text-2xl font-medium leading-none text-espresso">{bucket.count}</p>
                      <p className="mt-2 text-sm font-medium text-espresso">{STATE_LABEL[bucket.state]}</p>
                      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-espresso/80">
                        {STATE_MEANING[bucket.state]}
                      </p>
                      {bucket.oldest && (
                        <p className="numeric mt-3 border-t border-taupe pt-2.5 text-xs text-espresso/80">
                          oldest {formatDuration(bucket.oldest.inStateMs)}
                        </p>
                      )}
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="mt-14">
            <p className="eyebrow mb-4">
              The list{queue.reports.length > 0 ? ` (${queue.reports.length})` : ''}
            </p>
            {queue.reports.length === 0 ? (
              <EmptyState title="Nothing waiting" description="No report is open." />
            ) : (
              <ul className="border-t border-taupe">
                {queue.reports.map((report) => {
                  const overdue = (report.inStateMs ?? 0) >= OVERDUE_MS;
                  return (
                    <li key={report.id} className="border-b border-taupe py-4">
                      {/* An explicit grid rather than a justify-between flex row,
                          for the reason recorded on .value-row in globals.css: a
                          long patient name in a flex group shrinks past its own
                          children and paints over the duration beside it. */}
                      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="min-w-0">
                          <Link
                            to={`/admin/reports/${report.id}`}
                            className="text-sm font-medium text-bronze-600 underline underline-offset-2"
                          >
                            {report.patientName}
                          </Link>
                          <p className="mt-0.5 text-sm text-espresso">
                            {report.title}
                            <span className="numeric text-espresso/80"> · sampled {formatDate(report.sampleDate)}</span>
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <p className={`text-sm ${overdue ? 'font-medium text-espresso' : 'text-espresso/85'}`}>
                            {STATE_LABEL[report.state]}
                          </p>
                          <p
                            className={`numeric tabular text-xs ${
                              overdue ? 'font-medium text-espresso' : 'text-espresso/80'
                            }`}
                          >
                            {formatDuration(report.inStateMs)} in this state
                          </p>
                        </div>
                      </div>
                      {report.holdReasons.length > 0 && (
                        // The reasons themselves, not a count of them. A held
                        // report whose reason you have to open the report to
                        // read is a queue entry that costs a page load to
                        // triage.
                        <ul className="mt-2.5 space-y-1">
                          {report.holdReasons.map((reason) => (
                            <li key={reason} className="max-w-measure text-xs leading-relaxed text-espresso/85">
                              {reason}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <TurnaroundBand turnaround={queue.turnaround} />
          {/* Last, and ADMIN only. It is an outstanding decision like every
              other band here, and it is the one nobody is waiting on today —
              a purge is scheduled 30 days out. Renders nothing when there is
              nothing outstanding. */}
          {user?.role === 'ADMIN' && <ErasureRequestsCard />}
        </>
      )}
    </ConsolePage>
  );
}
