import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { OtpInput } from '../../components/ui/OtpInput';
import { Button } from '../../components/ui/Button';
import { apiFetch } from '../../lib/api';
import { authErrorMessage } from '../../lib/authErrors';
import { useAuth } from '../../lib/AuthContext';
import { CLINIC_PHONE, CLINIC_PHONE_HREF, CLINIC_EMAIL } from '../../lib/clinicContact';
import { consumeRedirect } from '../../lib/redirectAfterLogin';

interface EmailCodeStepProps {
  /** The address the code went to — needed to submit the code and to ask for another. */
  email: string;
  /** Masked by the server ("i••••@gmail.com"); the full address is never displayed back. */
  sentTo?: string;
  expiresInMinutes?: number;
  cooldownSeconds?: number;
  /** Shown under the code screen only — once 2FA starts, a way out of *this*
   *  step is no longer the thing the patient needs. */
  footer?: ReactNode;
}

const FALLBACK_COOLDOWN_SECONDS = 30;
const MAX_RESENDS = 3;

/**
 * Confirming a new account's email address — a six-digit code, and THE ONLY
 * ONE a new patient enters (changed Aug 2026).
 *
 * It was a link before, then a code — and then, for a while, a code followed
 * immediately by a SECOND code on a screen that looked the same, because
 * verifying the address opened a 2FA enrolment challenge that emailed another
 * one. Two one-time codes to the same mailbox prove the same thing once, and
 * what a patient actually experienced was one step apparently repeating
 * itself, which reads as a fault. The server now issues the session when this
 * code is accepted (see verifyEmail), and two-factor sign-in is untouched and
 * still mandatory the next time they sign in.
 *
 * So this component ends in exactly one place: signed in. It cannot end
 * anywhere a patient could wander away from mid-registration.
 *
 * Resend mirrors OtpStep's rules (cooldown, cap, previous code retired on
 * reissue) but counts down against a constant rather than a per-account
 * number: this endpoint answers identically for an address that is waiting
 * and one that was never registered, so the server enforces the limits
 * silently and the UI shows the same countdown to everyone. See
 * resendVerificationCode() on the server.
 */
export function EmailCodeStep({ email, sentTo, expiresInMinutes, cooldownSeconds, footer }: EmailCodeStepProps) {
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [maskedAddress, setMaskedAddress] = useState(sentTo);
  const [expiry, setExpiry] = useState(expiresInMinutes ?? 20);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(cooldownSeconds ?? FALLBACK_COOLDOWN_SECONDS);
  const [resendAttempts, setResendAttempts] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submitCode = useCallback(
    async (submittedCode: string) => {
      if (submitting) return;
      setError(null);
      setSubmitting(true);
      try {
        const result = await apiFetch<{ status: string }>('/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ email, code: submittedCode }),
        });
        if (result.status !== 'authenticated') {
          setError('We could not finish confirming your email. Please request a new code.');
          return;
        }
        await refresh();
        // Same rule as the sign-in screen: if a deep link was followed while
        // signed out, land on the thing that was clicked. A patient who opened
        // a result link, hit the login wall, registered, and confirmed their
        // email should arrive at that result — not at the home page having
        // lost it. A brand-new account has nothing to deep-link to, so this is
        // almost always the walkthrough at '/'.
        navigate(consumeRedirect() ?? '/');
      } catch (e) {
        setError(authErrorMessage(e));
      } finally {
        setSubmitting(false);
      }
    },
    [email, submitting, refresh, navigate],
  );

  const exhausted = resendAttempts >= MAX_RESENDS;

  async function handleResend() {
    if (cooldown > 0 || resending || exhausted) return;
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ sentTo?: string; expiresInMinutes?: number; cooldownSeconds?: number }>(
        '/auth/verify-email/resend',
        { method: 'POST', body: JSON.stringify({ email }) },
      );
      if (result.sentTo) setMaskedAddress(result.sentTo);
      if (result.expiresInMinutes) setExpiry(result.expiresInMinutes);
      setCooldown(result.cooldownSeconds ?? FALLBACK_COOLDOWN_SECONDS);
      setResendAttempts((n) => n + 1);
      // The previous code is dead the moment a new one is issued (server
      // side), so the field is cleared rather than left holding digits that
      // can no longer work.
      setCode('');
      setNotice(
        `New code sent to ${result.sentTo ?? maskedAddress ?? 'your email'}. Your previous code no longer works.`,
      );
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setResending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submitCode(code);
  }

  return (
    <>
      <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Almost there</p>
      <h2 className="auth-heading">Confirm your email</h2>
      <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80">
        We’ve sent a 6-digit code to{' '}
        <span className="font-medium text-espresso">{maskedAddress ?? 'your email address'}</span>. It’s valid for{' '}
        {expiry} minutes, and it’s the only code you’ll need today — next time you sign in, we’ll send one to confirm
        it’s you.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-[calc(var(--auth-step)*1.6)] flex flex-col gap-[calc(var(--auth-step)*1.2)]"
        noValidate
      >
        <OtpInput
          label="Confirmation code"
          autoFocus
          value={code}
          onChange={(v) => {
            setError(null);
            setCode(v);
          }}
          onComplete={submitCode}
          disabled={submitting}
          error={!!error}
        />

        {notice && (
          <p role="status" className="rounded-input border border-taupe bg-cream-50 px-4 py-2.5 text-sm text-espresso">
            {notice}
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-status-significantHigh">
            {error}
          </p>
        )}

        <Button type="submit" loading={submitting} className="w-full">
          Confirm email and sign in
        </Button>
      </form>

      <div className="mt-[calc(var(--auth-step)*1.4)] border-t border-taupe pt-[calc(var(--auth-step)*1.2)]">
        <p className="text-sm text-espresso/80">Didn’t get it? Check your junk folder first.</p>
        <div className="mt-[calc(var(--auth-step)*0.75)] flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            variant="secondary"
            onClick={handleResend}
            loading={resending}
            disabled={cooldown > 0 || exhausted}
            disabledReason={
              exhausted
                ? "We’ve sent as many codes as we can to this address for now."
                : `You can request another code in ${cooldown} second${cooldown === 1 ? '' : 's'}.`
            }
          >
            Send a new code
          </Button>
          {cooldown > 0 && !exhausted && (
            <span className="tabular text-sm text-espresso/80" aria-live="polite">
              Available in {cooldown}s
            </span>
          )}
        </div>

        {(exhausted || resendAttempts >= 2) && (
          <p className="mt-[var(--auth-step)] rounded-input border border-taupe bg-cream-50 px-4 py-2.5 text-sm leading-relaxed text-espresso">
            If it still hasn’t arrived,{' '}
            {CLINIC_PHONE && CLINIC_PHONE_HREF ? (
              <>
                call the clinic on{' '}
                <a href={CLINIC_PHONE_HREF} className="font-medium text-bronze underline underline-offset-2">
                  {CLINIC_PHONE}
                </a>
              </>
            ) : (
              <>
                email us at{' '}
                <a href={`mailto:${CLINIC_EMAIL}`} className="font-medium text-bronze underline underline-offset-2">
                  {CLINIC_EMAIL}
                </a>
              </>
            )}{' '}
            and we’ll get your account confirmed.
          </p>
        )}
      </div>

      {footer}
    </>
  );
}
