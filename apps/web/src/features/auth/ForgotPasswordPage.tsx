import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { authErrorMessage } from '../../lib/authErrors';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { AuthSplitLayout } from './AuthSplitLayout';
import { validateEmail } from '../../lib/validateEmail';

const EYEBROW = 'Aspire Clinic';
const HEADLINE = 'Locked out? Not for long.';
const SUPPORTING =
  "Tell us the address you registered with and we'll email you a link to set a new password.";

/**
 * "I've forgotten my password" — the exit that didn't exist. Without it the
 * only recovery from a forgotten password was to call the clinic, which is a
 * phone call about a password.
 *
 * The confirmation copy is careful: the server answers identically whether
 * the address is known or not (see requestPasswordReset — this endpoint is
 * unauthenticated and must not become a membership oracle for a medical
 * practice), so this screen must not claim an email definitely went out. It
 * says "if that address has an account", and means it.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING}>
        <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Check your email</p>
        <h2 className="auth-heading">On its way</h2>
        <p role="status" className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80">
          If <span className="font-medium text-espresso">{email}</span> has an Aspire Bloods account, a link to set
          a new password is on its way. It can take a minute to arrive, so check your junk folder too.
        </p>
        <p className="mt-[calc(var(--auth-step)*0.75)] text-sm leading-relaxed text-espresso/80">
          The link can only be used once, and it expires. Nothing has changed until you use it.
        </p>

        <div className="mt-[calc(var(--auth-step)*1.5)] border-t border-taupe pt-[calc(var(--auth-step)*1.25)]">
          <p className="text-sm text-espresso/80">
            Wrong address?{' '}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="rounded-input font-medium text-bronze underline underline-offset-2 hover:text-bronze-700"
            >
              Try another one
            </button>
            .
          </p>
          <p className="mt-[calc(var(--auth-step)*0.6)] text-sm text-espresso/80">
            Remembered it?{' '}
            <Link
              to="/login"
              className="rounded-input font-medium text-bronze underline underline-offset-2 hover:text-bronze-700"
            >
              Back to sign in
            </Link>
            .
          </p>
        </div>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING}>
      <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Patient portal</p>
      <h2 className="auth-heading">Reset your password</h2>
      <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80">
        You'll still need your two-factor code to sign in afterwards.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-[calc(var(--auth-step)*1.6)] flex flex-col gap-[calc(var(--auth-step)*1.2)]"
        noValidate
      >
        <Input
          label="Email address"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          validate={validateEmail}
          autoFocus
        />
        {error && (
          <p role="alert" className="text-sm text-status-significantHigh">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting} className="w-full">
          Email me a reset link
        </Button>
      </form>

      <p className="mt-[calc(var(--auth-step)*1.2)] text-sm text-espresso/80">
        <Link
          to="/login"
          className="rounded-input font-medium text-bronze underline underline-offset-2 hover:text-bronze-700"
        >
          Back to sign in
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
