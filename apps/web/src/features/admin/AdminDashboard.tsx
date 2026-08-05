import { Link, useNavigate } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';

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

export function AdminDashboard() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
    navigate('/login');
  }

  return (
    <main className="min-h-screen px-6 py-16 md:px-16 bg-cream">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TwoTierHeading eyebrow="Aspire Clinic — Admin console" title={`Welcome, ${user?.displayName ?? ''}`} />
        <div className="flex gap-3">
          {user?.hasPatientProfile && (
            <Link to="/my-results">
              <Button variant="secondary">My results</Button>
            </Link>
          )}
          <Button variant="secondary" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.filter((c) => !c.adminOnly || user?.role === 'ADMIN').map((card, i) => (
          <Link
            key={card.to}
            to={card.to}
            className="stagger-item motion-safe:animate-riseIn"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <Card interactive className="h-full">
              <p className="font-medium text-espresso">{card.title}</p>
              <p className="mt-2 text-sm text-espresso/80">{card.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
