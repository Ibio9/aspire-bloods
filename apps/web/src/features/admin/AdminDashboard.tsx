import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
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
      <p className="eyebrow">Aspire Clinic · Admin console</p>
      <h1 className="display-heading mt-2 leading-[1.05]">Welcome, {user?.displayName ?? ''}</h1>

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

      {recent.length > 0 && (
        <div className="mt-14">
          <p className="eyebrow mb-4">Recently viewed</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((p) => (
              <Link key={p.id} to={`/admin/patients/${p.id}`}>
                <Card interactive className="flex items-center justify-between py-4">
                  <span className="font-medium text-espresso">{p.name}</span>
                  <span className="text-xs text-espresso/60">{timeAgo(p.viewedAt)}</span>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
