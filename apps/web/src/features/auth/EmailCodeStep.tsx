import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { OtpInput } from '../../components/ui/OtpInput';
import { Button } from '../../components/ui/Button';
import { apiFetch } from '../../lib/api';
import { authErrorMessage } from '../../lib/authErrors';
import { useAuth } from '../../lib/AuthContext';
import { CLINIC_PHONE, CLINIC_PHONE_HREF, CLINIC_EMAIL } from '../../lib/clinicContact';
import { consumeRedirect } from '../../lib/redirectAfterLogin';
import { OtpStep, type OtpChallenge } from './OtpStep';

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
 * Confirming a new account's email address — a six-digit code, entered the
 * same way as the 2FA code the patient meets thirty seconds later.
 *
 * It was a link before. Two differently-shaped proofs for two adjacent steps
 * meant two things to explain and two ways to get stuck; a code for both is
 * one mental model, and it drops the day-long token that a link needs in
 * order to survive a trip to someone's inbox.
 *
 * The whole run lives here — code, then 2FA — because verification must not
 * be able to end anywhere except signed in or signed out. Nothing in between
 * is a state a patient could wander away from mid-registration.
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
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);

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
        const result = await apiFetch<{ status: string } & Partial<OtpChallenge>>('/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ email, code: submittedCode }),
        });
        if (!result.challengeId) {
          setError('We could not finish confirming your email. Please request a new code.');
          return;
        }
        setChallenge({
          challengeId: result.challengeId,
          sentTo: result.sentTo,
          channel: result.channel,
          expiresInMinutes: result.expiresInMinutes,
        });
      } catch (e) {
        setError(authErrorMessage(e));
      } finally {
        setSubmitting(false);
      }
    },
    [email, submitting],
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

  const handleVerified = useCallback(async () => {
    await refresh();
    // Same rule as the sign-in screen: if a deep link was followed while
    // signed out, land on the thing that was clicked. A patient who opened a
    // result link, hit the login wall, registered, and confirmed their email
    // should arrive at that result — not at the home page having lost it.
    navigate(consumeRedirect() ?? '/');
  }, [refresh, navigate]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submitCode(code);
  }

  if (challenge) {
    return (
      <OtpStep
        challenge={challenge}
        onVerified={handleVerified}
        eyebrow="Last step"
        heading="Set up two-factor sign-in"
        // Brand new account: "trust this device for 30 days" is a decision
        // for someone who already knows the account is theirs and working,
        // not a checkbox to tick during enrolment.
        allowTrustDevice={false}
      />
    );
  }

  return (
    <>
      <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Almost there</p>
      <h2 className="auth-heading">Confirm your email</h2>
      <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80">
        We've sent a 6-digit code to{' '}
        <span className="font-medium text-espresso">{maskedAddress ?? 'your email address'}</span>. It's valid for{' '}
        {expiry} minutes. Enter it here and we'll set up two-factor sign-in.
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
          Confirm email
        </Button>
      </form>

      <div className="mt-[calc(var(--auth-step)*1.4)] border-t border-taupe pt-[calc(var(--auth-step)*1.2)]">
        <p className="text-sm text-espresso/80">Didn't get it? Check your junk folder first, then:</p>
        <div className="mt-[calc(var(--auth-step)*0.75)] flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            variant="secondary"
            onClick={handleResend}
            loading={resending}
            disabled={cooldown > 0 || exhausted}
            disabledReason={
              exhausted
                ? "We've sent as many codes as we can to this address for now."
                : `You can request another code in ${cooldown} second${cooldown === 1 ? '' : 's'}.`
            }
          >
            Send a new code
          </Button>
          {cooldown > 0 && !exhausted && (
            <span className="tabular text-sm text-espresso/70" aria-live="polite">
              Available in {cooldown}s
            </span>
          )}
        </div>

        {(exhausted || resendAttempts >= 2) && (
          <p className="mt-[var(--auth-step)] rounded-input border border-taupe bg-cream-50 px-4 py-2.5 text-sm leading-relaxed text-espresso">
            Still nothing? Codes can be held up by spam filters. If it still hasn't arrived,{' '}
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
            and we'll get your account confirmed.
          </p>
        )}
      </div>

      {footer}
    </>
  );
}
