import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { OtpInput } from '../../components/ui/OtpInput';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { apiFetch, ApiError } from '../../lib/api';
import { authErrorMessage } from '../../lib/authErrors';
import { CLINIC_PHONE, CLINIC_PHONE_HREF, CLINIC_EMAIL } from '../../lib/clinicContact';

export interface OtpChallenge {
  challengeId: string;
  /** Masked by the server ("i••••@gmail.com") — the full address never reaches the client. */
  sentTo?: string;
  channel?: 'EMAIL' | 'SMS';
  expiresInMinutes?: number;
}

interface OtpStepProps {
  challenge: OtpChallenge;
  /** Called once verification succeeds — the caller decides where to go next. */
  onVerified: () => Promise<void> | void;
  /** Shown above the code field; differs between signing in and finishing registration. */
  heading?: string;
  eyebrow?: string;
  /** Offered on sign-in, not on first-time registration. */
  allowTrustDevice?: boolean;
  /**
   * Back out of the 2FA step entirely — "wrong email, let me start again".
   * Without this the step is a one-way door: the only escape is reloading the
   * page, which leaves the challenge live server-side until it ages out. The
   * outstanding code is retired before this fires, so a code sitting in a
   * mistyped address's inbox can never be used afterwards.
   */
  onCancel?: () => void;
  /** What backing out returns to, named rather than a bare "Back". */
  cancelLabel?: string;
}

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * The 2FA step, shared by sign-in and registration so the most-touched
 * interaction in the product behaves identically in both.
 *
 * Resend exists because without it a code that doesn't arrive is a dead end —
 * the patient's only remaining option is to abandon signing in. The cooldown
 * shown here mirrors the server's; the server is the one that enforces it
 * (including the cap on reissues), and it hands back the authoritative
 * cooldown so the countdown can never drift ahead of what the API will allow.
 */
export function OtpStep({
  challenge,
  onVerified,
  heading,
  eyebrow,
  allowTrustDevice = true,
  onCancel,
  cancelLabel = 'Use a different email address',
}: OtpStepProps) {
  const [challengeId, setChallengeId] = useState(challenge.challengeId);
  const [sentTo, setSentTo] = useState(challenge.sentTo);
  const [expiresInMinutes, setExpiresInMinutes] = useState(challenge.expiresInMinutes ?? 10);
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resendAttempts, setResendAttempts] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const noticeRef = useRef<HTMLParagraphElement | null>(null);

  // One interval for the whole step, ticking the countdown down to zero and
  // stopping. Restarted (via setCooldown) each time a code is issued.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submitOtp = useCallback(
    async (submittedCode: string) => {
      if (submitting) return;
      setError(null);
      setSubmitting(true);
      try {
        await apiFetch('/auth/otp/verify', {
          method: 'POST',
          body: JSON.stringify({ challengeId, code: submittedCode, trustDevice }),
        });
        await onVerified();
      } catch (e) {
        setError(authErrorMessage(e));
      } finally {
        setSubmitting(false);
      }
    },
    [challengeId, submitting, trustDevice, onVerified],
  );

  async function handleResend() {
    if (cooldown > 0 || resending || exhausted) return;
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{
        challengeId: string;
        sentTo: string;
        expiresInMinutes: number;
        cooldownSeconds: number;
        resendsRemaining: number;
      }>('/auth/otp/resend', { method: 'POST', body: JSON.stringify({ challengeId }) });

      // The previous code is dead the moment a new one is issued (server
      // side), so the field is cleared rather than left holding digits that
      // can no longer work.
      setChallengeId(result.challengeId);
      setSentTo(result.sentTo);
      setExpiresInMinutes(result.expiresInMinutes);
      setCooldown(result.cooldownSeconds);
      setResendAttempts((n) => n + 1);
      setCode('');
      setNotice(`New code sent to ${result.sentTo}. Your previous code no longer works.`);
      if (result.resendsRemaining === 0) setExhausted(true);
    } catch (e) {
      // 429 from the resend endpoint means either the cooldown or the
      // per-attempt cap — both mean "stop offering the button and offer a
      // human instead".
      if (e instanceof ApiError && e.status === 429) setExhausted(true);
      setError(authErrorMessage(e));
    } finally {
      setResending(false);
    }
  }

  async function handleCancel() {
    if (!onCancel || cancelling) return;
    setCancelling(true);
    // Retiring the code is best-effort: if the call fails the user is still
    // leaving, and the challenge expires on its own. Blocking the way out on
    // a failed request would defeat the point of having a way out.
    try {
      await apiFetch('/auth/otp/cancel', { method: 'POST', body: JSON.stringify({ challengeId }) });
    } catch {
      /* leaving regardless */
    } finally {
      setCancelling(false);
      onCancel();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submitOtp(code);
  }

  const showWayOut = exhausted || resendAttempts >= 2;

  return (
    <>
      <p className="eyebrow mb-3">{eyebrow ?? 'One more step'}</p>
      <h2 className="font-display text-5xl leading-[1.05] text-espresso">{heading ?? "Verify it's you"}</h2>
      <p className="mt-5 text-sm leading-relaxed text-espresso/80">
        We've sent a 6-digit verification code to {sentTo ?? 'your email'}. It's valid for {expiresInMinutes}{' '}
        minutes.
      </p>

      <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-6" noValidate>
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

        {allowTrustDevice && (
          <Checkbox
            name="trustDevice"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
            label="Trust this device for 30 days"
          />
        )}

        {notice && (
          <p
            ref={noticeRef}
            role="status"
            className="rounded-input border border-taupe bg-cream-50 px-4 py-3 text-sm text-espresso"
          >
            {notice}
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-status-significantHigh">
            {error}
          </p>
        )}

        <Button type="submit" loading={submitting} className="w-full">
          Verify and sign in
        </Button>
      </form>

      <div className="mt-8 border-t border-taupe pt-6">
        <p className="text-sm text-espresso/80">Didn't get the code?</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            variant="secondary"
            onClick={handleResend}
            loading={resending}
            disabled={cooldown > 0 || exhausted}
            disabledReason={
              exhausted
                ? "We've sent as many codes as we can for this sign-in attempt."
                : `You can request another code in ${cooldown} second${cooldown === 1 ? '' : 's'}.`
            }
          >
            Send a new code
          </Button>
          {cooldown > 0 && !exhausted && (
            // aria-live so a screen-reader user hears when it becomes
            // available, but polite + the seconds only, so it isn't a
            // once-per-second interruption.
            <span className="tabular text-sm text-espresso/70" aria-live="polite">
              Available in {cooldown}s
            </span>
          )}
        </div>

        {showWayOut && (
          <p className="mt-5 rounded-input border border-taupe bg-cream-50 px-4 py-3 text-sm leading-relaxed text-espresso">
            Still nothing? Codes can be held up by spam filters — check your junk folder. If it still hasn't
            arrived,{' '}
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
            and we'll get you signed in.
          </p>
        )}

        {onCancel && (
          <p className="mt-5 text-sm text-espresso/80">
            Wrong address?{' '}
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={cancelling}
              className="rounded-sm font-medium text-bronze underline underline-offset-2 transition-colors duration-150 hover:text-bronze-700 disabled:opacity-60"
            >
              {cancelLabel}
            </button>
          </p>
        )}
      </div>
    </>
  );
}
