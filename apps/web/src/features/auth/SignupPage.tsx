import { useCallback, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { OtpInput } from '../../components/ui/OtpInput';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { apiFetch, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { RegistrationForm } from './RegistrationForm';

type Step = { kind: 'registration' } | { kind: 'otp'; challengeId: string };

/**
 * Registration is admin-only (ADMIN_EMAILS-gated server-side — see
 * auth/service.ts signup()). This page doesn't say so: the rejection for a
 * non-admin email is generic on purpose, so this form deliberately doesn't
 * hint who it's for either. Patients still arrive by invite only.
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
        setError(e instanceof ApiError ? e.message : 'Something went wrong');
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
      <main className="min-h-screen flex items-center justify-center px-6 py-16 bg-cream">
        <Card className="w-full max-w-md">
          <p className="eyebrow mb-2">One more step</p>
          <h2 className="font-display text-3xl leading-tight text-espresso">Verify it's you</h2>
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
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-16 md:px-16 bg-cream">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10">
          <TwoTierHeading eyebrow="Aspire Clinic" title="Create an account" />
          <p className="mt-4 max-w-prose text-espresso">
            A few details for our records, then set a password. You'll verify your email with a one-time code before
            your account is ready to use.
          </p>
        </div>

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
    </main>
  );
}
