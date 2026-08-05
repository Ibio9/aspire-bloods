import { useCallback, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { OtpInput } from '../../components/ui/OtpInput';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { apiFetch } from '../../lib/api';
import { authErrorMessage } from '../../lib/authErrors';
import { useAuth } from '../../lib/AuthContext';
import { RegistrationForm } from './RegistrationForm';
import { AuthSplitLayout } from './AuthSplitLayout';

type Step = { kind: 'registration' } | { kind: 'otp'; challengeId: string };

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
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  if (step.kind === 'otp') {
    return (
      <AuthSplitLayout eyebrow={STAFF_EYEBROW} headline={STAFF_HEADLINE} supporting={STAFF_SUPPORTING}>
        <p className="eyebrow mb-2">One more step</p>
        <h2 className="font-display text-4xl leading-tight text-espresso">Verify it's you</h2>
        <p className="mt-3 text-sm text-espresso/80">
          We've sent a 6-digit verification code to your email. Enter it below to finish creating your account —
          this step can't be skipped.
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
            Verify and finish
          </Button>
        </form>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout eyebrow={STAFF_EYEBROW} headline={STAFF_HEADLINE} supporting={STAFF_SUPPORTING} wide>
      <p className="eyebrow mb-2">Practice staff</p>
      <h2 className="font-display text-4xl leading-tight text-espresso">Create an account</h2>
      <p className="mt-3 max-w-prose text-sm text-espresso/80">
        A few details for our records, then set a password. You'll verify your email with a one-time code before
        your account is ready to use.
      </p>

      <div className="mt-8">
        <RegistrationForm
          showEmailField
          submitLabel="Create account"
          onSubmit={async ({ email, password, profile, consents }) => {
            const result = await apiFetch<{ status: string; challengeId?: string }>('/auth/signup', {
              method: 'POST',
              body: JSON.stringify({ email, password, profile, consents }),
            });
            if (result.status === 'otp_required' && result.challengeId) {
              setStep({ kind: 'otp', challengeId: result.challengeId });
            }
          }}
        />
      </div>
    </AuthSplitLayout>
  );
}
