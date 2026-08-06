import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { RegistrationForm } from './RegistrationForm';
import { AuthSplitLayout } from './AuthSplitLayout';
import { OtpStep, type OtpChallenge } from './OtpStep';

type Step = { kind: 'registration' } | { kind: 'otp'; challenge: OtpChallenge };

const STAFF_EYEBROW = 'Practice staff';
const STAFF_HEADLINE = 'Set up your practice account.';
const STAFF_SUPPORTING =
  "This is for Aspire Clinic staff only. Patients don't register here — they're sent an email invitation to activate their own account.";

/**
 * Registration is admin-only (ADMIN_EMAILS-gated server-side — see
 * auth/service.ts signup()). The rejection for a non-admin email is
 * generic on purpose (this must never leak who's on the admin list), so
 * this page doesn't otherwise hint at that gate — but it is upfront that
 * the flow itself is a staff one, and that patients arrive by invite.
 *
 * 2FA enrolment is not a separate optional step — this flow structurally
 * cannot end in a session without it: signup() itself returns the same
 * otp_required shape as login(), verified through the same endpoint.
 */
export function SignupPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>({ kind: 'registration' });

  const handleVerified = useCallback(async () => {
    await refresh();
    navigate('/');
  }, [refresh, navigate]);

  if (step.kind === 'otp') {
    return (
      <AuthSplitLayout eyebrow={STAFF_EYEBROW} headline={STAFF_HEADLINE} supporting={STAFF_SUPPORTING}>
        <OtpStep
          challenge={step.challenge}
          onVerified={handleVerified}
          eyebrow="One more step"
          heading="Verify it's you"
          // First sign-in on a brand new account — "trust this device for 30
          // days" is a decision for someone who already knows the account is
          // theirs and working, not a checkbox to tick during enrolment.
          allowTrustDevice={false}
        />
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout eyebrow={STAFF_EYEBROW} headline={STAFF_HEADLINE} supporting={STAFF_SUPPORTING} wide>
      <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Practice staff</p>
      <h2 className="auth-heading">Create an account</h2>
      <p className="mt-[var(--auth-step)] max-w-prose text-sm leading-relaxed text-espresso/80">
        A few details for our records, then set a password. You'll verify your email with a one-time code before
        your account is ready to use.
      </p>

      <div className="mt-[calc(var(--auth-step)*1.6)]">
        <RegistrationForm
          showEmailField
          submitLabel="Create account"
          onSubmit={async ({ email, password, profile, consents }) => {
            const result = await apiFetch<{ status: string } & Partial<OtpChallenge>>('/auth/signup', {
              method: 'POST',
              body: JSON.stringify({ email, password, profile, consents }),
            });
            if (result.status === 'otp_required' && result.challengeId) {
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
          }}
        />
      </div>
    </AuthSplitLayout>
  );
}
