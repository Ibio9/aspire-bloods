import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { authErrorMessage } from '../../lib/authErrors';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { LinkButton } from '../../components/ui/LinkButton';
import { AuthSplitLayout } from './AuthSplitLayout';

const EYEBROW = 'Aspire Clinic';
const HEADLINE = 'Choose a new password.';
const SUPPORTING =
  "One password, at least twelve characters. You'll sign in with it and your two-factor code, exactly as before.";

/**
 * Spending the emailed reset link.
 *
 * This screen deliberately ends at "now sign in", not at a session. The
 * server issues no cookies here (see auth/router.ts) precisely so that
 * holding a reset link is never enough to read a result — the patient comes
 * back through /login and therefore through 2FA. That's a real security
 * property, so the copy states it rather than treating the extra step as an
 * inconvenience to apologise for.
 *
 * A dead link is the likeliest failure (single-use, and short-lived), so the
 * way to a fresh one sits right on the error rather than three screens away.
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING}>
        <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Password reset</p>
        <h2 className="auth-heading">This link is incomplete</h2>
        <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80">
          The reset link is missing its token. Open the link in your email again, or{' '}
          <Link
            to="/forgot-password"
            className="rounded-sm font-medium text-bronze underline underline-offset-2 hover:text-bronze-700"
          >
            ask for a new one
          </Link>
          .
        </p>
      </AuthSplitLayout>
    );
  }

  if (done) {
    return (
      <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING}>
        <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Done</p>
        <h2 className="auth-heading">Your password is changed</h2>
        <p role="status" className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80">
          You've been signed out everywhere else, so anyone who was in your account no longer is. Sign in with your
          new password and we'll send your two-factor code as usual.
        </p>
        <LinkButton to="/login" variant="primary" className="mt-[calc(var(--auth-step)*1.5)] w-full">
          Sign in
        </LinkButton>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING}>
      <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Password reset</p>
      <h2 className="auth-heading">Set a new password</h2>
      <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80">
        Choose something you haven't used elsewhere. Saving it signs you out on every device — including any you
        don't recognise.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-[calc(var(--auth-step)*1.6)] flex flex-col gap-[calc(var(--auth-step)*1.2)]"
        noValidate
      >
        <Input
          label="New password"
          name="password"
          type="password"
          minLength={12}
          hint="At least 12 characters."
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          validate={(v) => (v.length >= 12 ? undefined : 'Password must be at least 12 characters.')}
          autoFocus
        />
        <Input
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          validate={(v) => (v === password ? undefined : "Those two passwords don't match.")}
        />
        {error && (
          <p role="alert" className="text-sm text-status-significantHigh">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting} className="w-full">
          Save new password
        </Button>
      </form>

      {/* Single-use and short-lived, so "the link is dead" is the most likely
          thing to go wrong here — the repair belongs on this screen. */}
      <p className="mt-[calc(var(--auth-step)*1.2)] text-sm leading-relaxed text-espresso/80">
        Link expired or already used?{' '}
        <Link
          to="/forgot-password"
          className="rounded-sm font-medium text-bronze underline underline-offset-2 hover:text-bronze-700"
        >
          Send yourself a new one
        </Link>
        .
      </p>
    </AuthSplitLayout>
  );
}
