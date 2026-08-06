import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { authErrorMessage } from '../../lib/authErrors';
import { useAuth } from '../../lib/AuthContext';
import { AuthSplitLayout } from './AuthSplitLayout';
import { OtpStep, type OtpChallenge } from './OtpStep';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

/**
 * The server answers this identically whether the address is unknown,
 * already confirmed, or genuinely waiting — so the copy has to be honest
 * about that rather than claiming an email definitely went out.
 */
function ResendLinkForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      await apiFetch('/auth/verify-email/resend', { method: 'POST', body: JSON.stringify({ email }) });
      setState('sent');
    } catch (err) {
      setError(authErrorMessage(err));
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <p role="status" className="rounded-input border border-taupe bg-cream-50 px-4 py-2.5 text-sm leading-relaxed text-espresso">
        If that address has an account waiting to be confirmed, a new link is on its way. It can take a minute
        to arrive, so check your junk folder too.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[calc(var(--auth-step)*0.9)]" noValidate>
      <p className="text-sm text-espresso/80">Send yourself a new link:</p>
      <Input
        label="Email address"
        name="resendEmail"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        validate={(v) => (!v ? 'Email address is required.' : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Enter a valid email address.')}
      />
      {error && (
        <p role="alert" className="text-sm text-status-significantHigh">
          {error}
        </p>
      )}
      <Button type="submit" variant="secondary" loading={state === 'sending'}>
        Send a new link
      </Button>
    </form>
  );
}

const EYEBROW = 'Aspire Clinic';
const HEADLINE = 'Confirm your email.';
const SUPPORTING =
  "One tap to prove this is your address, then a one-time code to set up two-factor sign-in. After that you're in.";

type State =
  | { kind: 'verifying' }
  | { kind: 'otp'; challenge: OtpChallenge }
  | { kind: 'failed'; message: string }
  | { kind: 'missing-token' };

/**
 * Step two of self-registration: the emailed link lands here.
 *
 * Verification and 2FA enrolment are a single uninterrupted run, not two
 * things a patient could half-finish. Confirming the address is what makes
 * the account ACTIVE, and the same response immediately carries the 2FA
 * challenge — so the only way this screen ends is signed in, or not at all.
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>(token ? { kind: 'verifying' } : { kind: 'missing-token' });
  // React 18 StrictMode mounts effects twice in development, and this one
  // spends a single-use token — without the guard the second run always
  // fails with "already used", on a link that was perfectly good.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    apiFetch<{ status: string } & Partial<OtpChallenge>>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then((result) => {
        if (result.challengeId) {
          setState({
            kind: 'otp',
            challenge: {
              challengeId: result.challengeId,
              sentTo: result.sentTo,
              channel: result.channel,
              expiresInMinutes: result.expiresInMinutes,
            },
          });
        } else {
          setState({ kind: 'failed', message: 'We could not finish confirming your email. Please request a new link.' });
        }
      })
      .catch((e) => setState({ kind: 'failed', message: authErrorMessage(e) }));
  }, [token]);

  const handleVerified = useCallback(async () => {
    await refresh();
    navigate('/');
  }, [refresh, navigate]);

  if (state.kind === 'otp') {
    return (
      <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING}>
        <OtpStep
          challenge={state.challenge}
          onVerified={handleVerified}
          eyebrow="Last step"
          heading="Set up two-factor sign-in"
          // Brand new account: "trust this device for 30 days" is a decision
          // for someone who already knows the account is theirs and working,
          // not a checkbox to tick during enrolment.
          allowTrustDevice={false}
        />
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING}>
      {state.kind === 'verifying' && (
        <>
          <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Confirming</p>
          <h2 className="auth-heading">Checking your link</h2>
          <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80" role="status">
            One moment…
          </p>
        </>
      )}

      {state.kind === 'missing-token' && (
        <>
          <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Confirmation</p>
          <h2 className="auth-heading">This link is incomplete</h2>
          <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80">
            The confirmation link is missing its token. Open the link in your email again, or{' '}
            <Link to="/signup" className="rounded-sm font-medium text-bronze underline underline-offset-2">
              ask for a new one
            </Link>
            .
          </p>
        </>
      )}

      {state.kind === 'failed' && (
        <>
          <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Confirmation</p>
          <h2 className="auth-heading">We couldn't confirm this link</h2>
          <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80" role="alert">
            {state.message}
          </p>
          {/* A dead link is a dead end unless the way out is right here.
              Sending them back to /signup to re-enter the whole form would
              be the wrong repair for "the link expired". */}
          <div className="mt-[calc(var(--auth-step)*1.4)] border-t border-taupe pt-[calc(var(--auth-step)*1.2)]">
            <ResendLinkForm />
          </div>
          <p className="mt-[calc(var(--auth-step)*1.2)] text-sm text-espresso/80">
            Already confirmed?{' '}
            <Link to="/login" className="rounded-sm font-medium text-bronze underline underline-offset-2">
              Sign in
            </Link>
            .
          </p>
        </>
      )}
    </AuthSplitLayout>
  );
}
