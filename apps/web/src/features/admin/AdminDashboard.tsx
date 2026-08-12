import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { staggerDelay } from '../../components/motion/stagger';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { readRecentPatients, type RecentPatient } from '../../lib/recentPatients';
import { bucketAwaitingAction, type AwaitingActionBucket } from '../../lib/reportStatus';

/*
 * The grid of five navigation cards that used to sit here is gone.
 *
 * It listed the same five destinations as the sidebar, with descriptions that
 * were paraphrases of the sidebar's own sublabels — and it listed them
 * INCOMPLETELY, missing result linking and the ingestion log, so the one
 * screen an admin lands on offered a smaller map than the panel permanently
 * beside it. Two navigations, disagreeing, one of them wrong.
 *
 * What is left is the thing the sidebar cannot do: say what is waiting. The
 * console is a queue, not a menu.
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

interface ReportSummary {
  id: string;
  status: string;
  voidedAt: string | null;
}

type DemoSeedOutcome = 'SKIPPED' | 'SUCCEEDED' | 'FAILED';

interface DemoSeedRun {
  outcome: DemoSeedOutcome;
  ranAt: string;
  durationMs: number | null;
  reportsCreated: number;
  patientEmail: string | null;
  detail: string;
  errorMessage: string | null;
}

/** Shape first, colour second — the same rule the marker statuses follow. */
function SeedIcon({ outcome }: { outcome: DemoSeedOutcome }) {
  if (outcome === 'SUCCEEDED') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 8.5 L6.5 12 L13 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (outcome === 'FAILED') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 3 L8 9" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="8" cy="12.5" r="1.25" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="7" width="10" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}

const SEED_LABEL: Record<DemoSeedOutcome, string> = {
  SUCCEEDED: 'Demo data seeded',
  FAILED: 'Demo data seed failed',
  SKIPPED: 'Demo data not enabled',
};

/**
 * The last boot-mode demo seed, for the deployment you are looking at.
 *
 * seedDemo.ts swallows its own failures so synthetic data can never stop the
 * API booting. That is the right call and it has one bad consequence: a failed
 * seed and a deliberately-disabled one look identical from the outside — a
 * demo account that signs in and shows an empty portal. This is where the two
 * are told apart without shell access to the deploy logs.
 *
 * Renders for ADMIN only, and only once a boot-mode seed has recorded
 * something. Nothing here means the running container never made the call at
 * all, which is itself worth knowing — see the copy below.
 */
function DemoSeedCard() {
  const [run, setRun] = useState<DemoSeedRun | null | undefined>(undefined);
  const [missing, setMissing] = useState(false);
  const [reseeding, setReseeding] = useState(false);
  const [reseedError, setReseedError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<DemoSeedRun | null>('/admin/demo-seed')
      .then((r) => (r ? setRun(r) : setMissing(true)))
      .catch(() => setMissing(true));
  }, []);

  // The break-glass path: re-run the seed against this deployment without a
  // redeploy. Synthetic data only ever lands on the single demo account, and
  // the run replaces the demo reports rather than stacking them.
  async function reseed() {
    setReseeding(true);
    setReseedError(null);
    try {
      await apiFetch('/admin/demo-seed/run', { method: 'POST' });
    } catch (e) {
      setReseedError(e instanceof Error ? e.message : 'The seed run failed.');
    } finally {
      // Whatever happened, the recorded row is the truth — re-read it.
      await apiFetch<DemoSeedRun | null>('/admin/demo-seed')
        .then((r) => {
          if (r) {
            setRun(r);
            setMissing(false);
          }
        })
        .catch(() => undefined);
      setReseeding(false);
    }
  }

  if (run === undefined && !missing) {
    return (
      <div className="mt-14" aria-busy="true" aria-label="Loading demo data status">
        <p className="eyebrow mb-4">Demo data</p>
        <Card className="max-w-2xl">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="mt-3 h-4 w-72" />
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-14">
      <p className="eyebrow mb-4">Demo data</p>
      <Card className="max-w-2xl">
        {missing || !run ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-espresso/80">
              <SeedIcon outcome="SKIPPED" />
              No demo seed recorded
            </span>
            <p className="mt-2.5 text-sm leading-relaxed text-espresso/80">
              This deployment has not run the boot-mode demo seed. Either the running image predates it, or the
              start command no longer calls it.
            </p>
          </>
        ) : (
          <>
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                run.outcome === 'FAILED' ? 'text-status-significantHigh' : 'text-espresso'
              }`}
            >
              <SeedIcon outcome={run.outcome} />
              {SEED_LABEL[run.outcome]}
            </span>
            <p className="mt-2.5 text-sm leading-relaxed text-espresso/80">{run.detail}</p>
            {run.errorMessage && (
              <p className="mt-2.5 rounded-input border border-taupe bg-cream-50 px-3 py-2 font-mono text-xs leading-relaxed text-espresso">
                {run.errorMessage}
              </p>
            )}
            <p className="mt-3 text-xs text-espresso/80">
              {timeAgo(run.ranAt)}
              {run.patientEmail ? ` · ${run.patientEmail}` : ''}
              {run.outcome === 'SUCCEEDED' && run.durationMs !== null ? ` · ${(run.durationMs / 1000).toFixed(1)}s` : ''}
            </p>
          </>
        )}
        {reseedError && (
          <p role="alert" className="mt-3 text-sm text-status-significantHigh">
            {reseedError}
          </p>
        )}
        <div className="mt-5 border-t border-taupe pt-4">
          <Button variant="secondary" loading={reseeding} onClick={() => void reseed()}>
            Run the demo seed now
          </Button>
          <p className="mt-2 text-xs leading-relaxed text-espresso/80">
            Replaces the demo patient’s reports with a fresh set. Touches nothing else.
          </p>
        </div>
      </Card>
    </div>
  );
}

/**
 * The exception queue, counted, on the screen an admin lands on.
 *
 * Results attach themselves to patients now, so this number is normally zero
 * — and a queue that is normally zero is a queue nobody thinks to open. That
 * is precisely why it belongs here: the failure mode of automatic linking is
 * not a wrong link, it is a result sitting unnoticed for a fortnight because
 * the screen that would have shown it was never visited.
 */
function ExceptionsCard() {
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // The count endpoint, not the queue itself. The queue returns claimed
    // names and dates of birth and is audited as a view of patient data —
    // fetching it to render a number would have written an entry saying
    // somebody read it every time anyone opened this page.
    apiFetch<{ pending: number }>('/admin/linking/count')
      .then((q) => setCount(q.pending))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  return (
    <div className="mt-14">
      <p className="eyebrow mb-4">Results that could not be placed</p>
      <Card className="max-w-2xl">
        {count === null ? (
          <Skeleton className="h-6 w-40" />
        ) : count === 0 ? (
          <>
            <p className="text-lg font-medium text-espresso">Nothing waiting</p>
            <p className="mt-2 text-sm leading-relaxed text-espresso/80">
              Every result that arrived was attached to the patient its order was placed for, on the order reference,
              with the name and date of birth checked. Anything that cannot be placed that way appears here.
            </p>
          </>
        ) : (
          <>
            <p className="tabular text-2xl font-medium text-espresso">{count}</p>
            <p className="mt-1.5 text-sm text-espresso">
              result{count === 1 ? '' : 's'} waiting to be placed, each with the reason it stopped.
            </p>
            <div className="mt-5 border-t border-taupe pt-4">
              <Link to="/admin/linking" className="text-sm font-medium text-bronze-600 underline underline-offset-2">
                Open result linking
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

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

export function AdminDashboard() {
  const { user } = useAuth();
  const [recent, setRecent] = useState<RecentPatient[]>([]);
  const [buckets, setBuckets] = useState<AwaitingActionBucket[] | null>(null);
  // "Nothing waiting" and "we couldn't ask" are opposite facts and this
  // screen showed neither: a failed load left the skeleton up for ever and
  // rejected unhandled. Telling an admin on a Monday morning that there is
  // nothing to publish, when in fact the request failed, is the worse of the
  // two ways to get this wrong.
  const [error, setError] = useState<unknown>(null);

  const loadBuckets = useCallback(() => {
    setError(null);
    setBuckets(null);
    apiFetch<ReportSummary[]>('/reports')
      .then((reports) => setBuckets(bucketAwaitingAction(reports)))
      .catch(setError);
  }, []);

  useEffect(() => {
    setRecent(readRecentPatients());
    loadBuckets();
  }, [loadBuckets]);

  const totalAwaitingAction = buckets?.reduce((sum, b) => sum + b.count, 0) ?? 0;

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Clinician console" title={`Welcome, ${user?.displayName ?? ''}`} />

      {/* This is the admin's actual job, so it leads the page (brief §1) —
          counted and sorted by what's blocking each report, most
          time-sensitive first. */}
      <div className="mt-10">
        <p className="eyebrow mb-4">Reports awaiting action{totalAwaitingAction > 0 ? ` (${totalAwaitingAction})` : ''}</p>
        {error ? (
          <ErrorState error={error} subject="the report queue" onRetry={loadBuckets} />
        ) : buckets === null ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-3 h-6 w-16" />
              </Card>
            ))}
          </div>
        ) : buckets.length === 0 ? (
          <EmptyState title="Nothing waiting" description="Every report is either released or hasn’t been uploaded yet." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {buckets.map((b, i) => (
              <Link
                key={b.state}
                // The queue's own vocabulary, not the status enum: HELD and
                // AWAITING_REVIEW are the same status and must not link to the
                // same list. See bucketAwaitingAction in lib/reportStatus.ts.
                to={`/admin?queue=${b.state}`}
                className="stagger-item motion-safe:animate-riseIn rounded-card"
                style={{ animationDelay: `${staggerDelay(i, 30)}ms` }}
              >
                <Card interactive className="h-full">
                  <p className="tabular text-2xl font-medium text-espresso">{b.count}</p>
                  <p className="mt-1.5 text-sm text-espresso">{b.label}</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {user?.role === 'ADMIN' && <ExceptionsCard />}
      {user?.role === 'ADMIN' && <ErasureRequestsCard />}
      {user?.role === 'ADMIN' && <DemoSeedCard />}

      {recent.length > 0 && (
        <div className="mt-14">
          <p className="eyebrow mb-4">Recently viewed</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((p) => (
              <Link key={p.id} to={`/admin/patients/${p.id}`}>
                <Card interactive className="flex items-center justify-between py-4">
                  <span className="font-medium text-espresso">{p.name}</span>
                  <span className="text-xs text-espresso/80">{timeAgo(p.viewedAt)}</span>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
