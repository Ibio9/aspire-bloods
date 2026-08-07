import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { OtpStep, type OtpChallenge } from './OtpStep';
import { apiFetch } from '../../lib/api';
import { authErrorMessage, formatCountdown, lockoutSeconds } from '../../lib/authErrors';
import { useAuth } from '../../lib/AuthContext';
import { LOGOUT_REASON_KEY } from '../../lib/AuthContext';
import { AuthSplitLayout } from './AuthSplitLayout';
import { AuthCrossLink } from './AuthCrossLink';
import { consumeRedirect } from '../../lib/redirectAfterLogin';

const LOGOUT_REASON_COPY: Record<string, string> = {
  idle: "You were signed out after a period of inactivity, to keep your results secure.",
  expired: 'Your session has expired. Please sign in again.',
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
  // Seconds left on a lockout, ticking. Null when there isn't one.
  const [lockedFor, setLockedFor] = useState<number | null>(null);

  // The lock lifts on its own, so the copy has to as well — otherwise
  // someone who waited the full two minutes is still looking at a screen
  // telling them they're locked out.
  useEffect(() => {
    if (lockedFor === null) return;
    if (lockedFor <= 0) {
      setLockedFor(null);
      setError(null);
      return;
    }
    const t = setTimeout(() => setLockedFor((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [lockedFor]);

  async function handleCredentials(e: FormEvent) {
    e.preventDefault();
    // Fields now only complain once they've been touched (see Input), which
    // is what stops the autofocused email box shoving the rest of the screen
    // down the first time someone clicks elsewhere. Submit is therefore the
    // moment an empty form has to be caught, and catching it here beats a
    // round-trip that comes back as "Email: Invalid email".
    const missing = validateEmail(email) ?? validateRequired(password);
    if (missing) {
      setError(missing);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<{ status: string } & Partial<OtpChallenge>>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setLockedFor(null);
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
      const wait = lockoutSeconds(e);
      if (wait !== null) {
        setLockedFor(wait);
        setError(null);
      } else {
        setError(authErrorMessage(e));
      }
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
          {/* Someone arriving cold has no way of knowing whose site this is
              or what's behind the form. One line, before the fields, naming
              the clinic and what the portal holds — that's the whole job. */}
          <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80">
            This is Aspire Clinic's blood test results portal. Sign in to see your results, track markers over
            time, and book a test.
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
            {/* A count, not "shortly". Someone locked out needs to know
                whether to wait or come back later, and the number is the
                only thing that answers that. Icon + heading carry the state
                alongside the colour, per the house rule. */}
            {lockedFor !== null && (
              <div
                role="alert"
                className="flex gap-3 rounded-input border border-status-significantHigh bg-cream-50 px-4 py-3"
              >
                <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" className="mt-0.5 shrink-0 text-status-significantHigh">
                  <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-espresso">Sign-in paused</p>
                  <p className="mt-1 text-sm leading-relaxed text-espresso/80">
                    Too many attempts from this connection. You can try again in{' '}
                    <span className="tabular font-medium">{formatCountdown(lockedFor)}</span>.
                  </p>
                </div>
              </div>
            )}
            <Button type="submit" loading={submitting} disabled={lockedFor !== null} className="w-full">
              Sign in
            </Button>
          </form>

          {/* Sits directly under the button, where someone looks the moment
              their password doesn't work — not below the registration band. */}
          <p className="mt-[calc(var(--auth-step)*0.85)] text-sm text-espresso/80">
            <Link
              to="/forgot-password"
              className="rounded-sm font-medium text-bronze underline underline-offset-2 hover:text-bronze-700"
            >
              Forgotten your password?
            </Link>
          </p>

          <AuthCrossLink
            prompt="New here? Anyone can register. You don't need an invitation from the clinic."
            to="/signup"
            label="Create an account"
          />

          {/* Invites still exist in parallel for patients the practice sets
              up directly, and that link goes to /activate, not here. Kept as
              a footnote rather than deleted: registration being open doesn't
              make an invitation email wrong, it just makes it optional. */}
          <p className="mt-[calc(var(--auth-step)*0.9)] text-xs leading-relaxed text-espresso/80">
            If the clinic emailed you an invitation, use the link in it instead. It sets your account up with the
            details we already hold.
          </p>
        </>
      ) : (
        <OtpStep challenge={step.challenge} onVerified={handleVerified} onCancel={handleCancelOtp} />
      )}
    </AuthSplitLayout>
  );
}
