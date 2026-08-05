import { useCallback, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { OtpInput } from '../../components/ui/OtpInput';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { apiFetch } from '../../lib/api';
import { authErrorMessage } from '../../lib/authErrors';
import { useAuth } from '../../lib/AuthContext';
import { LOGOUT_REASON_KEY } from '../../lib/AuthContext';
import { AuthSplitLayout } from './AuthSplitLayout';

const LOGOUT_REASON_COPY: Record<string, string> = {
  idle: "You were signed out after a period of inactivity, to keep your results secure.",
  expired: 'Your session has expired — please sign in again.',
};

function readAndClearLogoutReason(): string | null {
  const reason = sessionStorage.getItem(LOGOUT_REASON_KEY);
  if (reason) sessionStorage.removeItem(LOGOUT_REASON_KEY);
  return reason ? (LOGOUT_REASON_COPY[reason] ?? null) : null;
}

type Step = { kind: 'credentials' } | { kind: 'otp'; challengeId: string };

function validateEmail(value: string): string | undefined {
  if (!value) return 'Email address is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.';
  return undefined;
}

function validateRequired(value: string): string | undefined {
  return value ? undefined : 'Password is required.';
}

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
  const [sessionNotice] = useState(readAndClearLogoutReason);

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
      setError(authErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  const submitOtp = useCallback(
    async (submittedCode: string) => {
      if (step.kind !== 'otp' || submitting) return;
      setError(null);
      setSubmitting(true);
      try {
        await apiFetch('/auth/otp/verify', {
          method: 'POST',
          body: JSON.stringify({ challengeId: step.challengeId, code: submittedCode, trustDevice }),
        });
        await refresh();
        navigate('/');
      } catch (e) {
        setError(authErrorMessage(e));
      } finally {
        setSubmitting(false);
      }
    },
    [step, submitting, trustDevice, refresh, navigate],
  );

  function handleOtp(e: FormEvent) {
    e.preventDefault();
    void submitOtp(code);
  }

  return (
    <AuthSplitLayout>
      {step.kind === 'credentials' ? (
        <>
          <p className="eyebrow mb-2">Patient portal</p>
          <h2 className="font-display text-4xl leading-tight text-espresso">Sign in</h2>
          <p className="mt-3 text-sm text-espresso/80">Enter your details below to access your results.</p>

          {sessionNotice && (
            <p role="status" className="mt-4 rounded-input border border-taupe bg-cream-50 px-3.5 py-2.5 text-sm text-espresso">
              {sessionNotice}
            </p>
          )}

          <form onSubmit={handleCredentials} className="mt-8 flex flex-col gap-5" noValidate>
            <Input
              label="Email address"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              validate={validateEmail}
              autoComplete="username"
              autoFocus
            />
            <Input
              label="Password"
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              validate={validateRequired}
              autoComplete="current-password"
            />
            {error && (
              <p role="alert" className="text-sm text-status-significantHigh">
                {error}
              </p>
            )}
            <Button type="submit" loading={submitting} className="w-full">
              Sign in
            </Button>
          </form>
          <p className="mt-5 text-xs text-espresso/60">
            Trouble signing in? Check you've activated your account from your invitation email, and that your
            password is correct — repeated failed attempts will briefly lock the account.
          </p>
        </>
      ) : (
        <>
          <p className="eyebrow mb-2">One more step</p>
          <h2 className="font-display text-4xl leading-tight text-espresso">Verify it's you</h2>
          <p className="mt-3 text-sm text-espresso/80">
            We've sent a 6-digit verification code to your email. Enter it below to finish signing in.
          </p>

          <form onSubmit={handleOtp} className="mt-8 flex flex-col gap-5" noValidate>
            <OtpInput
              label="Verification code"
              autoFocus
              value={code}
              onChange={(v) => {
                setError(null);
                setCode(v);
              }}
              onComplete={submitOtp}
              disabled={submitting}
              error={!!error}
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
              Verify and sign in
            </Button>
          </form>
        </>
      )}
    </AuthSplitLayout>
  );
}
