import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '@aspire-bloods/shared';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../components/ui/Table';
import { apiFetch } from '../../lib/api';

interface PatientRow {
  id: string;
  email: string;
  status: 'INVITED' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'DISABLED';
  deactivatedAt: string | null;
  createdAt: string;
  displayName: string;
}

type SortKey = 'displayName' | 'email' | 'status' | 'createdAt';

function statusLabel(p: PatientRow): string {
  if (p.deactivatedAt) return 'Deactivated';
  if (p.status === 'INVITED') return 'Invited';
  // Self-registered, hasn't entered the confirmation code yet. Distinct from
  // "Invited" — nobody is waiting on the practice for this one.
  if (p.status === 'PENDING_VERIFICATION') return 'Email not confirmed';
  if (p.status === 'DISABLED') return 'Erased';
  return 'Active';
}

export function PatientsListPage() {
  const [patients, setPatients] = useState<PatientRow[] | null>(null);
  // A failed load is not an empty practice. Without this the page held its
  // skeleton for ever and rejected into an unhandled promise — the same fault
  // the patient-side lists had, still here on the screen the clinic's own
  // staff use every morning.
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('displayName');
  const [sortAsc, setSortAsc] = useState(true);

  const load = useCallback(() => {
    setError(null);
    setPatients(null);
    apiFetch<PatientRow[]>('/admin/patients').then(setPatients).catch(setError);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!patients) return [];
    const q = query.trim().toLowerCase();
    const rows = q
      ? patients.filter((p) => p.displayName.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      : patients;
    const sorted = [...rows].sort((a, b) => {
      const av = sortKey === 'createdAt' ? a.createdAt : a[sortKey];
      const bv = sortKey === 'createdAt' ? b.createdAt : b[sortKey];
      return av < bv ? -1 : av > bv ? 1 : 0;
    });
    return sortAsc ? sorted : sorted.reverse();
  }, [patients, query, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Clinician console" title="Patients" />

      {/* Not `optional`. Every search field in existence is optional, and
          "Search (optional)" is a label telling somebody they are permitted not
          to use a search box. The placeholder already says what it takes. */}
      <div className="mt-8 max-w-md">
        <Input
          label="Find a patient"
          hideLabel
          name="query"
          type="search"
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          required={false}
        />
      </div>

      {error ? (
        <div className="mt-8">
          <ErrorState error={error} subject="the patient list" onRetry={load} backTo={{ to: '/admin', label: 'Back to the console' }} />
        </div>
      ) : patients === null ? (
        <div className="mt-6 flex flex-col gap-2" aria-busy="true" aria-label="Loading patients">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No patients found" description="Try a different search, or invite a new patient from the reports page." />
        </div>
      ) : (
        <div className="mt-6">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>
                  <button type="button" onClick={() => toggleSort('displayName')} className="font-medium">
                    Name {sortKey === 'displayName' && (sortAsc ? '↑' : '↓')}
                  </button>
                </TableHeaderCell>
                <TableHeaderCell>
                  <button type="button" onClick={() => toggleSort('email')} className="font-medium">
                    Email {sortKey === 'email' && (sortAsc ? '↑' : '↓')}
                  </button>
                </TableHeaderCell>
                <TableHeaderCell>
                  <button type="button" onClick={() => toggleSort('status')} className="font-medium">
                    Status {sortKey === 'status' && (sortAsc ? '↑' : '↓')}
                  </button>
                </TableHeaderCell>
                <TableHeaderCell>
                  <button type="button" onClick={() => toggleSort('createdAt')} className="font-medium">
                    Registered {sortKey === 'createdAt' && (sortAsc ? '↑' : '↓')}
                  </button>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* ── THE LINK GOES ON WHAT IDENTIFIES THEM (Aug 2026) ────────
                  `displayName` falls back to "(pending activation)" for anyone
                  who has been invited and not yet registered, and that string
                  was the link. On this practice's list that produced SIX
                  consecutive rows whose only link text was the identical
                  parenthesis — six different destinations with one accessible
                  name, which is a failure for anybody navigating by link and a
                  row nobody can tell from its neighbour by eye either.

                  The email is the thing that is always present and always
                  distinct, so it carries the link on those rows; the name cell
                  says plainly that there isn't one yet, in the muted tone that
                  means "absent" everywhere else in the product rather than in
                  link bronze. Where a real name exists nothing changes. */}
              {filtered.map((p) => {
                const named = p.status !== 'INVITED' && !p.displayName.startsWith('(');
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      {named ? (
                        <Link
                          to={`/admin/patients/${p.id}`}
                          className="font-medium text-bronze-600 underline underline-offset-2"
                        >
                          {p.displayName}
                        </Link>
                      ) : (
                        <span className="text-espresso/80">Not registered yet</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {named ? (
                        p.email
                      ) : (
                        <Link
                          to={`/admin/patients/${p.id}`}
                          className="font-medium text-bronze-600 underline underline-offset-2"
                        >
                          {p.email}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>{statusLabel(p)}</TableCell>
                    <TableCell className="numeric tabular">{formatDate(p.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
