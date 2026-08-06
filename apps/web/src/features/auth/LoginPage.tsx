import { useCallback, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { OtpStep, type OtpChallenge } from './OtpStep';
import { apiFetch } from '../../lib/api';
import { authErrorMessage } from '../../lib/authErrors';
import { useAuth } from '../../lib/AuthContext';
import { LOGOUT_REASON_KEY } from '../../lib/AuthContext';
import { AuthSplitLayout } from './AuthSplitLayout';
import { consumeRedirect } from '../../lib/redirectAfterLogin';

const LOGOUT_REASON_COPY: Record<string, string> = {
  idle: "You were signed out after a period of inactivity, to keep your results secure.",
  expired: 'Your session has expired — please sign in again.',
};

function readAndClearLogoutReason(): string | null {
  const reason = sessionStorage.getItem(LOGOUT_REASON_KEY);
  if (reason) sessionStorage.removeItem(LOGOUT_REASON_KEY);
  return reason ? (LOGOUT_REASON_COPY[reason] ?? null) : null;
}

type Step = { kind: 'credentials' } | { kind: 'otp'; challenge: OtpChallenge };

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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionNotice] = useState(readAndClearLogoutReason);

  async function handleCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<{ status: string } & Partial<OtpChallenge>>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (result.status === 'authenticated') {
        await refresh();
        navigate(consumeRedirect() ?? '/');
      } else if (result.challengeId) {
        setStep({
          kind: 'otp',
          challenge: {
            challengeId: result.challengeId,
            sentTo: result.sentTo,
            channel: result.channel,
            expiresInMinutes: result.expiresInMinutes,
          },
        });
      }
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  const handleVerified = useCallback(async () => {
    await refresh();
    // A deep link followed while signed out is remembered by ProtectedRoute;
    // land on the thing that was clicked, not the home page.
    navigate(consumeRedirect() ?? '/');
  }, [refresh, navigate]);

  // Backing out of 2FA returns to the credentials form with the password
  // cleared — the email stays so a typo can be corrected rather than retyped.
  const handleCancelOtp = useCallback(() => {
    setStep({ kind: 'credentials' });
    setPassword('');
    setError(null);
  }, []);

  return (
    <AuthSplitLayout>
      {step.kind === 'credentials' ? (
        <>
          <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Patient portal</p>
          <h2 className="auth-heading">Sign in</h2>
          <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80">
            Enter your details below to access your results.
          </p>

          {sessionNotice && (
            <p
              role="status"
              className="mt-[var(--auth-step)] rounded-input border border-taupe bg-cream-50 px-4 py-2.5 text-sm text-espresso"
            >
              {sessionNotice}
            </p>
          )}

          <form
            onSubmit={handleCredentials}
            className="mt-[calc(var(--auth-step)*1.6)] flex flex-col gap-[calc(var(--auth-step)*1.2)]"
            noValidate
          >
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
          {/* One compact line: the full version ran three lines and was the
              thing pushing the card past the fold. The lockout warning stays
              because it's the one part a patient can't infer. */}
          <p className="mt-[var(--auth-step)] text-xs leading-relaxed text-espresso/60">
            Trouble signing in? Activate your account from your invitation email first — repeated failed
            attempts briefly lock it.
          </p>
        </>
      ) : (
        <OtpStep challenge={step.challenge} onVerified={handleVerified} onCancel={handleCancelOtp} />
      )}
    </AuthSplitLayout>
  );
}
