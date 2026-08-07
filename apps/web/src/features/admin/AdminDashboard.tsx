import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { readRecentPatients, type RecentPatient } from '../../lib/recentPatients';
import { bucketAwaitingAction, type AwaitingActionBucket } from '../../lib/reportStatus';

interface NavCard {
  to: string;
  title: string;
  description: string;
  adminOnly?: boolean;
}

const CARDS: NavCard[] = [
  { to: '/admin', title: 'Reports', description: 'Upload PDFs, enter results manually, verify, review and release.' },
  { to: '/admin/patients', title: 'Patients', description: 'Search patients, open full profiles, manage invites, 2FA, access and erasure.' },
  { to: '/admin/content', title: 'Content & configuration', description: 'Panels, markers, reference ranges, marker explanations, patient-facing wording.' },
  { to: '/admin/audit-log', title: 'Audit log', description: 'Full system-wide activity: every action and every view, by every admin.', adminOnly: true },
];

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
            Replaces the demo patient's reports with a fresh set — no redeploy needed. Touches nothing but the
            single demo account.
          </p>
        </div>
      </Card>
    </div>
  );
}

export function AdminDashboard() {
  const { user } = useAuth();
  const [recent, setRecent] = useState<RecentPatient[]>([]);
  const [buckets, setBuckets] = useState<AwaitingActionBucket[] | null>(null);

  useEffect(() => {
    setRecent(readRecentPatients());
    void apiFetch<ReportSummary[]>('/reports').then((reports) => setBuckets(bucketAwaitingAction(reports)));
  }, []);

  const totalAwaitingAction = buckets?.reduce((sum, b) => sum + b.count, 0) ?? 0;

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Admin console" title={`Welcome, ${user?.displayName ?? ''}`} />

      {/* This is the admin's actual job, so it leads the page (brief §1) —
          counted and sorted by what's blocking each report, most
          time-sensitive first. */}
      <div className="mt-10">
        <p className="eyebrow mb-4">Reports awaiting action{totalAwaitingAction > 0 ? ` (${totalAwaitingAction})` : ''}</p>
        {buckets === null ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-3 h-6 w-16" />
              </Card>
            ))}
          </div>
        ) : buckets.length === 0 ? (
          <EmptyState title="Nothing waiting" description="Every report is either released or hasn't been uploaded yet." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {buckets.map((b, i) => (
              <Link
                key={b.status}
                to={`/admin?status=${b.status}`}
                className="stagger-item motion-safe:animate-riseIn rounded-card"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <Card interactive className="h-full">
                  <p className="tabular text-3xl font-medium text-espresso">{b.count}</p>
                  <p className="mt-1.5 text-sm text-espresso">{b.label}</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.filter((c) => !c.adminOnly || user?.role === 'ADMIN').map((card, i) => (
          <Link
            key={card.to}
            to={card.to}
            className="stagger-item motion-safe:animate-riseIn rounded-card"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <Card interactive className="h-full">
              <p className="text-lg font-medium text-espresso">{card.title}</p>
              <p className="mt-2.5 text-sm text-espresso/80">{card.description}</p>
            </Card>
          </Link>
        ))}
      </div>

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
