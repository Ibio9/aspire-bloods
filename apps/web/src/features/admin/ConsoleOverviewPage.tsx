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
import { ConsolePage } from './ConsolePage';
import { formatDuration, timeAgo, OVERDUE_MS, STATE_LABEL, type WorkQueue } from './workQueueData';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  OVERVIEW — WHAT NEEDS DOING, THEN HOW THE PRACTICE IS DOING.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The landing screen at `/`, and it has exactly two parts in a fixed order.
 *
 *   1. WHAT NEEDS DOING. Everything waiting on a person, oldest first, stated
 *      plainly and linked straight to the thing itself.
 *   2. ANALYTICS. Three figures, each a link through to the full page.
 *
 * Nothing else. It replaced the work queue, which is the same first half plus
 * four more bands — the bucket summary, the turnaround figures, the backup
 * state and a paragraph about where the numbers come from. Those are all real
 * and none of them is what somebody signing in at nine in the morning is
 * asking, which is "what am I doing first". The turnaround figures moved to
 * Analytics (which is where a figure over a window belongs), the backup state
 * moved to Settings (it is a thing you check, not a thing you clear), and the
 * bucket summary is gone — it was a second arrangement of the list directly
 * beneath it, and the list is the one you act on.
 *
 * ── ONE LIST, NOT THREE ───────────────────────────────────────────────────
 *
 * The exceptions were three cards, the reports were a list, and unmatched
 * results were a card pointing at a screen of their own. They are all the same
 * kind of thing — something waiting on a person — so they are one list, sorted
 * by how long each has been waiting, with the ones that are counts rather than
 * rows at the top because a count of five held deliveries outranks any single
 * report. Every row is a link to the place the work is done.
 *
 * ── NO PROSE ──────────────────────────────────────────────────────────────
 *
 * The old screen carried a purpose line, then a sentence about the data being
 * derived rather than tracked, then a `why` paragraph under each of the three
 * exception cards, then a note under the turnaround block. Five explanations
 * above a work list. A clinician reads none of them after the first day and
 * every one of them is between them and the list. What is left is the heading.
 */

interface ErasureRequest {
  id: string;
  status: string;
  requestedAt: string;
  purgeScheduledAt: string | null;
  patientId: string;
  patientName: string | null;
  patientEmail: string;
}

interface AnalyticsHeadline {
  turnaround: { released: number; medianMs: number | null };
  outOfRange: { ratePerThousand: number | null };
  patients: { withReleasedReport: number };
}

/** The window the three headline figures are counted over. */
const HEADLINE_DAYS = 30;

/**
 * ERASURE REQUESTS — an outstanding decision with a clock on it, which is what
 * every other row on this list is. ADMIN only, and it renders nothing at all
 * when there is nothing outstanding.
 *
 * The paragraph explaining what a purge does and does not remove is NOT on the
 * overview any more. It is on the confirmation the button raises, which is
 * where somebody needs it — on this screen it was four lines of retention
 * policy read every morning by people not exercising it.
 */
function useErasureRequests() {
  const [requests, setRequests] = useState<ErasureRequest[] | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<ErasureRequest[]>('/admin/erasure-requests')
      .then(setRequests)
      .catch(() => setRequests([]));
  }, []);

  useEffect(load, [load]);

  const schedule = useCallback(
    async (id: string) => {
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
    },
    [load],
  );

  return { outstanding: (requests ?? []).filter((r) => r.status === 'REQUESTED'), scheduling, schedule };
}

/**
 * ONE ROW OF THE WORK LIST.
 *
 * Three columns: what it is, why it is waiting, how long it has been waiting.
 * An explicit grid rather than a `justify-between` flex row, for the reason
 * recorded on `.value-row` in globals.css — a long patient name in a flex group
 * shrinks past its own children and paints over the duration beside it.
 */
function WorkRow({
  to,
  title,
  detail,
  age,
  urgent,
  children,
}: {
  to: string;
  title: string;
  detail?: string;
  age?: string;
  urgent?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="border-b border-taupe py-4">
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <Link to={to} className="text-sm font-medium text-bronze-600 underline underline-offset-2">
            {title}
          </Link>
          {detail && <p className="mt-0.5 text-sm text-espresso/85">{detail}</p>}
        </div>
        {age && (
          <p
            className={`numeric tabular text-xs sm:text-right ${
              urgent ? 'font-medium text-espresso' : 'text-espresso/80'
            }`}
          >
            {age}
          </p>
        )}
      </div>
      {children}
    </li>
  );
}

/** One headline figure, linked through to the page that explains it. */
function Headline({ value, label, to }: { value: string; label: string; to: string }) {
  return (
    <Link to={to} className="rounded-card">
      <Card interactive className="flex h-full flex-col">
        <p className="numeric tabular text-2xl font-medium leading-none text-espresso">{value}</p>
        <p className="mt-2 text-sm text-espresso/85">{label}</p>
      </Card>
    </Link>
  );
}

export function ConsoleOverviewPage() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<WorkQueue | null>(null);
  const [headline, setHeadline] = useState<AnalyticsHeadline | null>(null);
  const [error, setError] = useState<unknown>(null);
  const erasure = useErasureRequests();

  const load = useCallback(() => {
    setError(null);
    setQueue(null);
    apiFetch<WorkQueue>('/admin/work-queue').then(setQueue).catch(setError);
    // The headline figures are a SEPARATE request and a failure of them is not
    // a failure of this screen: what needs doing is the reason to be here, and
    // an analytics query that times out must not take the work list down with
    // it. Absent, the band simply does not render.
    apiFetch<AnalyticsHeadline>(`/admin/analytics?days=${HEADLINE_DAYS}`)
      .then(setHeadline)
      .catch(() => setHeadline(null));
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <ConsolePage title="Overview">
        <div className="mt-10">
          <ErrorState error={error} subject="the console overview" onRetry={load} />
        </div>
      </ConsolePage>
    );
  }

  /**
   * THE COUNTS LEAD THE LIST, and they are counts of things rather than things.
   * Five held deliveries outranks any one report that has been sitting for two
   * days, because clearing them is one visit to one screen and because a held
   * delivery is the only remaining thing between a bad parse and a patient.
   */
  const exceptionRows = queue
    ? [
        {
          key: 'held',
          count: queue.exceptions.heldReports,
          one: 'report held on a question',
          many: 'reports held on a question',
          to: '/admin?queue=HELD',
        },
        {
          key: 'analytes',
          count: queue.exceptions.unmappedAnalytes,
          one: 'analyte spelling no marker answered to',
          many: 'analyte spellings no marker answered to',
          to: '/admin/settings#ingestion-log',
        },
        {
          key: 'unplaced',
          count: queue.exceptions.unplacedResults,
          one: 'result not attached to a patient',
          many: 'results not attached to a patient',
          to: '/admin#unmatched',
        },
      ].filter((r) => r.count > 0)
    : [];

  const nothingWaiting =
    queue !== null && exceptionRows.length === 0 && queue.reports.length === 0 && erasure.outstanding.length === 0;

  return (
    <ConsolePage title="Overview">
      <section className="mt-10">
        <p className="eyebrow mb-4">What needs doing</p>

        {queue === null ? (
          <Card>
            <Skeleton className="h-5 w-64" />
            <Skeleton className="mt-3 h-4 w-40" />
            <Skeleton className="mt-5 h-5 w-56" />
          </Card>
        ) : nothingWaiting ? (
          <EmptyState title="Nothing waiting" description="Every report is released, and nothing is held." />
        ) : (
          <ul className="border-t border-taupe">
            {exceptionRows.map((row) => (
              <WorkRow
                key={row.key}
                to={row.to}
                title={`${row.count} ${row.count === 1 ? row.one : row.many}`}
                urgent
              />
            ))}

            {queue.reports.map((report) => (
              <WorkRow
                key={report.id}
                to={`/admin/reports/${report.id}`}
                title={report.patientName}
                detail={`${STATE_LABEL[report.state] ?? report.state} · ${report.title} · sampled ${formatDate(report.sampleDate)}`}
                age={`${formatDuration(report.inStateMs)} waiting`}
                urgent={(report.inStateMs ?? 0) >= OVERDUE_MS}
              >
                {report.holdReasons.length > 0 && (
                  // The reasons themselves, not a count of them. A held report
                  // whose reason you have to open the report to read is a queue
                  // entry that costs a page load to triage.
                  <ul className="mt-2.5 space-y-1">
                    {report.holdReasons.map((reason) => (
                      <li key={reason} className="max-w-measure text-xs leading-relaxed text-espresso/85">
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
              </WorkRow>
            ))}

            {user?.role === 'ADMIN' &&
              erasure.outstanding.map((r) => (
                <li key={r.id} className="border-b border-taupe py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/admin/patients/${r.patientId}`}
                        className="text-sm font-medium text-bronze-600 underline underline-offset-2"
                      >
                        {r.patientName ?? r.patientEmail}
                      </Link>
                      <p className="tabular mt-0.5 text-sm text-espresso/85">
                        Erasure request · raised {timeAgo(r.requestedAt)}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      loading={erasure.scheduling === r.id}
                      onClick={() => void erasure.schedule(r.id)}
                    >
                      Schedule the purge in 30 days
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* THE HEADLINES, and three is the number rather than a selection of
          however many fit. Released, how long it took, and how much came back
          outside the range — volume, speed and finding, which is the whole of
          what a practice owner asks a month at a time. Each is a link through
          to the page where it is defined and can be windowed. */}
      {headline && (
        <section className="mt-14">
          <p className="eyebrow mb-4">Analytics · last {HEADLINE_DAYS} days</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Headline
              value={String(headline.turnaround.released)}
              label="reports released"
              to="/admin/analytics"
            />
            <Headline
              value={formatDuration(headline.turnaround.medianMs)}
              label="median arrival to release"
              to="/admin/analytics"
            />
            <Headline
              value={
                headline.outOfRange.ratePerThousand === null ? '–' : String(headline.outOfRange.ratePerThousand)
              }
              label="out of range per 1,000 results"
              to="/admin/analytics"
            />
          </div>
        </section>
      )}
    </ConsolePage>
  );
}
