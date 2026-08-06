import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '@aspire-bloods/shared';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
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
  // Self-registered, hasn't opened the confirmation link yet. Distinct from
  // "Invited" — nobody is waiting on the practice for this one.
  if (p.status === 'PENDING_VERIFICATION') return 'Email not confirmed';
  if (p.status === 'DISABLED') return 'Erased';
  return 'Active';
}

export function PatientsListPage() {
  const [patients, setPatients] = useState<PatientRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('displayName');
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    void apiFetch<PatientRow[]>('/admin/patients').then(setPatients);
  }, []);

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
      <TwoTierHeading eyebrow="Aspire Clinic · Admin console" title="Patients" />

      <div className="mt-8 max-w-md">
        <Input
          label="Search"
          name="query"
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          optional
        />
      </div>

      {patients === null ? (
        <div className="mt-6 flex flex-col gap-2" aria-busy="true" aria-label="Loading patients">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-10">
          <EmptyState title="No patients found" description="Try a different search, or invite a new patient from the reports page." />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
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
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link to={`/admin/patients/${p.id}`} className="font-medium text-bronze-600 underline underline-offset-2">
                      {p.displayName}
                    </Link>
                  </TableCell>
                  <TableCell>{p.email}</TableCell>
                  <TableCell>{statusLabel(p)}</TableCell>
                  <TableCell className="tabular">{formatDate(p.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
