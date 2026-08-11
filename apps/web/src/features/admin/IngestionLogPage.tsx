import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '@aspire-bloods/shared';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../components/ui/Table';
import { apiFetch } from '../../lib/api';
import { AnalyteMappingPanel } from './AnalyteMappingPanel';

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
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Admin console" title="Ingestion log" />
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">
        Every attempt to pull a result in from Randox’s API, successful or not. A clean result attaches itself to the
        patient its order was placed for and stops at admin-verified; anything ambiguous stops earlier and says so
        here. A clinician still reviews and releases before a patient sees anything.
      </p>

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
    </>
  );
}
