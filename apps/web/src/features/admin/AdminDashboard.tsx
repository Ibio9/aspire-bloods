import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../lib/AuthContext';
import { readRecentPatients, type RecentPatient } from '../../lib/recentPatients';

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
  { to: '/admin/audit-log', title: 'Audit log', description: 'Full system-wide activity — every action and every view, by every admin.', adminOnly: true },
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

export function AdminDashboard() {
  const { user } = useAuth();
  const [recent, setRecent] = useState<RecentPatient[]>([]);

  useEffect(() => {
    setRecent(readRecentPatients());
  }, []);

  return (
    <>
      <p className="eyebrow">Aspire Clinic — Admin console</p>
      <h1 className="display-heading mt-2 leading-[1.05]">Welcome, {user?.displayName ?? ''}</h1>

      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
