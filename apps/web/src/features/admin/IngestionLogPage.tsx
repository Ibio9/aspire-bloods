import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '@aspire-bloods/shared';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../components/ui/Table';
import { apiFetch } from '../../lib/api';
import { AnalyteMappingPanel } from './AnalyteMappingPanel';
import { ConsolePage } from './ConsolePage';
import { useAuth } from '../../lib/AuthContext';

interface IngestionLogRow {
  id: string;
  sourceKey: string;
  externalId: string | null;
  outcome: 'INGESTED' | 'PARTIAL' | 'DUPLICATE' | 'UNMATCHED_PATIENT' | 'FAILED';
  reportId: string | null;
  patientName: string | null;
  markerCount: number;
  message: string;
  mappingFailures: { markerName: string; reason: string }[] | null;
  createdAt: string;
}

const OUTCOME_LABEL: Record<IngestionLogRow['outcome'], string> = {
  INGESTED: 'Ingested',
  PARTIAL: 'Partial',
  DUPLICATE: 'Duplicate, ignored',
  UNMATCHED_PATIENT: 'No matching patient',
  FAILED: 'Failed',
};

const PAGE_SIZE = 50;

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

// ═══════════════════════════════════════════════════════════════════════════
//  THE DEMO SEED — MOVED HERE FROM THE OLD CONSOLE LANDING PAGE (Aug 2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// It is a deployment diagnostic rather than anything clinical, and this is the
// other screen in the console that answers "what has this deployment actually
// done" — what arrived from Randox, what could not be read, and now whether
// the boot-mode seed ran. ADMIN only, on a page that is already ADMIN only.

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


interface UnknownCode {
  code: string;
  sightings: number;
  firstSeenAt: string;
  lastSeenAt: string;
  sampleOrderNumber: string | null;
  sampleMarkerName: string | null;
}

/**
 * Codes Randox have sent that our map does not recognise.
 *
 * Every one of these withheld a result. That is the deliberate direction of
 * failure — an unrecognised code is treated as a void code, because reporting
 * a result whose caveat we cannot read is worse than not reporting it — but it
 * means an unknown code is silently costing patients results until somebody
 * asks Randox what it means. The rows were being written and nothing in the
 * console read them. This is where they belong: the ingestion log is where an
 * admin comes to find out what did not arrive.
 */
function UnknownCodesPanel() {
  const [codes, setCodes] = useState<UnknownCode[] | null>(null);
  // Randox switched off in this environment is not an error to report.
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    apiFetch<UnknownCode[]>('/randox/unknown-codes')
      .then(setCodes)
      .catch(() => setUnavailable(true));
  }, []);

  if (unavailable || codes === null || codes.length === 0) return null;

  return (
    <section className="mt-14" aria-labelledby="unknown-codes-heading">
      <h2 id="unknown-codes-heading" className="font-display text-xl text-espresso">
        Result codes we don’t recognise
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-espresso/85">
        Randox sent these alongside results and our code map has no entry for them, so each one withheld a result
        rather than reporting it with a caveat nobody could read. Ask Randox what they mean and add them to the code
        map file.
      </p>
      <div className="mt-5">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Code</TableHeaderCell>
              <TableHeaderCell>Seen</TableHeaderCell>
              <TableHeaderCell>Last seen</TableHeaderCell>
              <TableHeaderCell>An example</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {codes.map((c) => (
              <TableRow key={c.code}>
                <TableCell className="font-medium">{c.code}</TableCell>
                <TableCell className="tabular">{c.sightings}</TableCell>
                <TableCell className="tabular whitespace-nowrap">{formatDateTime(c.lastSeenAt)}</TableCell>
                <TableCell className="text-sm text-espresso/85">
                  {[c.sampleMarkerName, c.sampleOrderNumber].filter(Boolean).join(' · ') || 'Not recorded'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

/**
 * Phase 3 §3: every automated-source ingestion attempt, success or not —
 * a silently failed import must never go unnoticed. Text label carries the
 * outcome first (never colour alone), same house rule as StatusBadge.
 */
export function IngestionLogPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<IngestionLogRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<unknown>(null);

  // "Nothing has come in from Randox" and "we couldn't ask" are opposite
  // facts, and this screen exists precisely so a silently failed import is
  // noticed. Reporting the second as the first would defeat the whole page.
  async function load(nextOffset = 0) {
    setRows(null);
    setError(null);
    try {
      const result = await apiFetch<{ total: number; entries: IngestionLogRow[] }>(
        `/admin/ingestion-log?limit=${PAGE_SIZE}&offset=${nextOffset}`,
      );
      setRows(result.entries);
      setTotal(result.total);
      setOffset(nextOffset);
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    void load(0);
  }, []);

  return (
    <ConsolePage
      title="Ingestion log"
      /* ── A LEFTOVER FROM A REMOVED STAGE, TWICE OVER (Aug 2026) ──────────
         This said a clean result "stops at admin-verified", then "waiting for a
         clinician". Both stages have now been deleted from the pipeline, so the
         one screen that explains where a result comes to rest has twice named a
         state it could no longer be in, to the people whose job is to know. The
         pipeline is UPLOADED → PARSED → RELEASED, and a clean result does not
         stop at all — it is released to the patient by the call that wrote it.
         What stops is a HELD one, which is what the exception queues below are
         for. */
      purpose="Every attempt to pull a result in from Randox’s API, successful or not, and below it the two ways a delivery can go quiet: a code we cannot read, and an analyte spelling no marker answered to."
    >

      {error != null ? (
        <div className="mt-6">
          <ErrorState error={error} subject="the ingestion log" onRetry={() => void load(offset)} />
        </div>
      ) : rows === null ? (
        <div className="mt-6 flex flex-col gap-2" aria-busy="true" aria-label="Loading ingestion log">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No ingestion attempts yet" description="Entries appear here once automated ingestion is active." />
        </div>
      ) : (
        <>
          <div className="mt-6">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>When</TableHeaderCell>
                  <TableHeaderCell>Outcome</TableHeaderCell>
                  <TableHeaderCell>Patient</TableHeaderCell>
                  <TableHeaderCell>Markers</TableHeaderCell>
                  <TableHeaderCell>Details</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                    <TableCell>
                      <span className={r.outcome === 'INGESTED' ? 'text-espresso' : 'font-medium text-status-high'}>
                        {OUTCOME_LABEL[r.outcome]}
                      </span>
                    </TableCell>
                    <TableCell>
                      {r.reportId && r.patientName ? (
                        <Link to={`/admin/reports/${r.reportId}`} className="font-medium text-bronze-600 underline underline-offset-2">
                          {r.patientName}
                        </Link>
                      ) : (
                        (r.patientName ?? 'Not recorded')
                      )}
                    </TableCell>
                    <TableCell className="tabular">{r.markerCount}</TableCell>
                    <TableCell className="max-w-[420px]">
                      <p className="text-sm text-espresso">{r.message}</p>
                      {r.mappingFailures && r.mappingFailures.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-xs text-espresso/80">
                          {r.mappingFailures.map((f, i) => (
                            <li key={i}>
                              {f.markerName}: {f.reason}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-espresso/80">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" disabled={offset === 0} onClick={() => load(Math.max(0, offset - PAGE_SIZE))}>
                Previous
              </Button>
              <Button variant="secondary" disabled={offset + PAGE_SIZE >= total} onClick={() => load(offset + PAGE_SIZE)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <UnknownCodesPanel />
      {/* The other half of "what did not arrive". An unrecognised CODE withheld
          a result the lab reported; an unmapped ANALYTE is a result the lab
          reported that we could not file. Both belong on the page an admin
          comes to when something is missing, and neither had a home before. */}
      <AnalyteMappingPanel />
      {/* Last on the page, and last for a reason: it is about this DEPLOYMENT
          rather than about any delivery. See the banner above DemoSeedCard. */}
      {user?.role === 'ADMIN' && <DemoSeedCard />}
    </ConsolePage>
  );
}
