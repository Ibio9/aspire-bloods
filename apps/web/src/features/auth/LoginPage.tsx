import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { apiFetch, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { AuthSplitLayout } from './AuthSplitLayout';

type Step = { kind: 'credentials' } | { kind: 'otp'; challengeId: string };

export function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<{ status: string; challengeId?: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (result.status === 'authenticated') {
        await refresh();
        navigate('/');
      } else if (result.challengeId) {
        setStep({ kind: 'otp', challengeId: result.challengeId });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtp(e: FormEvent) {
    e.preventDefault();
    if (step.kind !== 'otp') return;
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeId: step.challengeId, code, trustDevice }),
      });
      await refresh();
      navigate('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout>
      {step.kind === 'credentials' ? (
        <>
          <p className="eyebrow mb-2">Patient portal</p>
          <h2 className="font-display text-4xl leading-tight text-espresso">Sign in</h2>
          <p className="mt-3 text-sm text-espresso/80">Enter your details below to access your results.</p>

          <form onSubmit={handleCredentials} className="mt-8 flex flex-col gap-5" noValidate>
            <Input
              label="Email address"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoFocus
            />
            <Input
              label="Password"
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {error && (
              <p role="alert" className="text-sm text-status-significantHigh">
                {error}
              </p>
            )}
            <Button type="submit" loading={submitting} className="w-full">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-center text-sm text-espresso/80">
              New patient?{' '}
              <Link
                to="/signup"
                className="inline-block py-3 -my-3 font-medium text-espresso underline decoration-bronze underline-offset-2"
              >
                Create an account
              </Link>
            </p>
          </form>
        </>
      ) : (
        <>
          <p className="eyebrow mb-2">One more step</p>
          <h2 className="font-display text-4xl leading-tight text-espresso">Verify it's you</h2>
          <p className="mt-3 text-sm text-espresso/80">
            We've sent a 6-digit verification code to your email. Enter it below to finish signing in.
          </p>

          <form onSubmit={handleOtp} className="mt-8 flex flex-col gap-5" noValidate>
            <Input
              label="Verification code"
              name="code"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="tabular text-center text-lg tracking-widest"
            />
            <Checkbox
              name="trustDevice"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              label="Trust this device for 30 days"
            />
            {error && (
              <p role="alert" className="text-sm text-status-significantHigh">
                {error}
              </p>
            )}
            <Button type="submit" loading={submitting} className="w-full">
              {submitting ? 'Verifying…' : 'Verify and sign in'}
            </Button>
          </form>
        </>
      )}
    </AuthSplitLayout>
  );
}
