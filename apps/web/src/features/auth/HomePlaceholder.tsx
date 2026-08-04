import { Link, useNavigate } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Button } from '../../components/ui/Button';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';

export function HomePlaceholder() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
    navigate('/login');
  }

  return (
    <main className="min-h-screen px-6 py-16 md:px-16 bg-cream">
      <div className="flex items-start justify-between">
        <TwoTierHeading eyebrow="Aspire Clinic — Patient Portal" title={`Welcome, ${user?.displayName ?? ''}`} />
        <div className="flex gap-3">
          {(user?.role === 'ADMIN' || user?.role === 'CLINICIAN') && (
            <Link to="/admin">
              <Button variant="secondary">Admin</Button>
            </Link>
          )}
          <Button variant="secondary" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </div>
      <p className="mt-6 max-w-prose text-espresso">
        Signed in as {user?.email} ({user?.role}). Panel cards and results land in the next slice.
      </p>
    </main>
  );
}
