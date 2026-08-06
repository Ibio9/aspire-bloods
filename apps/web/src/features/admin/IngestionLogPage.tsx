import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../components/ui/Table';
import { apiFetch } from '../../lib/api';

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
 * Phase 3 §3: every automated-source ingestion attempt, success or not —
 * a silently failed import must never go unnoticed. Text label carries the
 * outcome first (never colour alone), same house rule as StatusBadge.
 */
export function IngestionLogPage() {
  const [rows, setRows] = useState<IngestionLogRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  async function load(nextOffset = 0) {
    setRows(null);
    const result = await apiFetch<{ total: number; entries: IngestionLogRow[] }>(
      `/admin/ingestion-log?limit=${PAGE_SIZE}&offset=${nextOffset}`,
    );
    setRows(result.entries);
    setTotal(result.total);
    setOffset(nextOffset);
  }

  useEffect(() => {
    void load(0);
  }, []);

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Admin console" title="Ingestion log" />
      <p className="mt-3 max-w-prose text-sm text-espresso/80">
        Every attempt to pull a result in automatically from Randox's API, successful or not. Ingestion only ever
        reaches admin-verified; a clinician still has to review and release before a patient sees anything.
      </p>

      {rows === null ? (
        <div className="mt-6 flex flex-col gap-2" aria-busy="true" aria-label="Loading ingestion log">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-10">
          <EmptyState title="No ingestion attempts yet" description="Entries appear here once automated ingestion is active." />
        </div>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto">
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
                    <TableCell className="tabular whitespace-nowrap">{new Date(r.createdAt).toLocaleString('en-GB')}</TableCell>
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
                        (r.patientName ?? '—')
                      )}
                    </TableCell>
                    <TableCell className="tabular">{r.markerCount}</TableCell>
                    <TableCell className="max-w-[420px]">
                      <p className="text-sm text-espresso">{r.message}</p>
                      {r.mappingFailures && r.mappingFailures.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-xs text-espresso/70">
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
    </>
  );
}
