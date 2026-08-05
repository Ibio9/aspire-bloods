import { useEffect, useState, type FormEvent } from 'react';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../components/ui/Table';
import { apiFetch } from '../../lib/api';

interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  actorType: 'USER' | 'SYSTEM';
  actorName: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const PAGE_SIZE = 50;

/**
 * System-wide oversight — every admin/clinician action AND every view of
 * patient data, including other admins' own actions. No filtering-out-
 * yourself here: full transparency between admins, nothing hidden.
 */
export function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [actorEmail, setActorEmail] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');

  async function load(nextOffset = 0) {
    setRows(null);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) });
    if (actorEmail.trim()) params.set('actorEmail', actorEmail.trim());
    if (action.trim()) params.set('action', action.trim());
    if (targetType.trim()) params.set('targetType', targetType.trim());
    const result = await apiFetch<{ total: number; entries: AuditRow[] }>(`/admin/audit-log?${params.toString()}`);
    setRows(result.entries);
    setTotal(result.total);
    setOffset(nextOffset);
  }

  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilter(e: FormEvent) {
    e.preventDefault();
    void load(0);
  }

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic — Admin console" title="Audit log" />
      <p className="mt-3 max-w-prose text-sm text-espresso/80">
        Every admin and clinician action, and every view of patient data — including other admins' own activity.
        Nothing here is filtered out for anyone.
      </p>

      <Card className="mt-6">
        <form onSubmit={handleFilter} className="grid grid-cols-1 gap-4 sm:grid-cols-4" noValidate>
          <Input label="Actor email contains" name="actorEmail" optional value={actorEmail} onChange={(e) => setActorEmail(e.target.value)} />
          <Input label="Action" name="action" optional placeholder="e.g. REPORT_RELEASED" value={action} onChange={(e) => setAction(e.target.value)} />
          <Input label="Target type" name="targetType" optional placeholder="e.g. Report" value={targetType} onChange={(e) => setTargetType(e.target.value)} />
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Filter
            </Button>
          </div>
        </form>
      </Card>

      {rows === null ? (
        <div className="mt-6 flex flex-col gap-2" aria-busy="true" aria-label="Loading audit log">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-10">
          <EmptyState title="No matching entries" description="Try clearing the filters above." />
        </div>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>When</TableHeaderCell>
                  <TableHeaderCell>Action</TableHeaderCell>
                  <TableHeaderCell>Target</TableHeaderCell>
                  <TableHeaderCell>Actor</TableHeaderCell>
                  <TableHeaderCell>IP</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular whitespace-nowrap">{new Date(r.createdAt).toLocaleString('en-GB')}</TableCell>
                    <TableCell>{r.action}</TableCell>
                    <TableCell>
                      {r.targetType}
                      {r.targetId ? ` (${r.targetId.slice(0, 8)}…)` : ''}
                    </TableCell>
                    <TableCell>{r.actorType === 'SYSTEM' ? 'System' : (r.actorName ?? r.actorEmail ?? 'Unknown')}</TableCell>
                    <TableCell className="tabular">{r.ipAddress ?? '—'}</TableCell>
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
