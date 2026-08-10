import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { RegistrationForm } from './RegistrationForm';
import { AuthSplitLayout, AuthWideBody } from './AuthSplitLayout';
import { AuthCrossLink } from './AuthCrossLink';
import { EmailCodeStep } from './EmailCodeStep';

const EYEBROW = 'Aspire Clinic';
const HEADLINE = 'Create your account.';
const SUPPORTING =
  'Results appear here once the clinic has matched them to you, and only after a clinician has reviewed them.';

interface SignupResponse {
  status: string;
  sentTo?: string;
  expiresInMinutes?: number;
  cooldownSeconds?: number;
}

/**
 * Open registration. Invitation-only was the wrong shape for this practice,
 * so anyone can create an account here — and it deliberately does not feel
 * guarded, because there is nothing to guard: a new account is an empty
 * account, holding no clinical data at all until the clinic links results to
 * it. No approval, no queue, no "we'll be in touch".
 *
 * Invites still work in parallel for patients the practice adds directly —
 * those land on /activate with the fuller registration form.
 *
 * The flow is registration → confirm your email → 2FA → signed in, and this
 * page owns only the first two screens. Verification is what moves the
 * account out of PENDING_VERIFICATION, and entering the emailed code is what
 * starts 2FA enrolment (see EmailCodeStep) — so there is no way to end up
 * with a working account that skipped either step.
 */
export function SignupPage() {
  const [sent, setSent] = useState<SignupResponse | null>(null);
  const [email, setEmail] = useState('');

  if (sent) {
    return (
      <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING}>
        <EmailCodeStep
          email={email}
          sentTo={sent.sentTo}
          expiresInMinutes={sent.expiresInMinutes}
          cooldownSeconds={sent.cooldownSeconds}
          footer={
            <p className="mt-[calc(var(--auth-step)*1.4)] text-sm text-espresso/80">
              Already confirmed?{' '}
              <Link to="/login" className="rounded-sm font-medium text-bronze underline underline-offset-2 hover:text-bronze-700">
                Sign in
              </Link>
            </p>
          }
        />
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING} wide>
      {/* Introduction beside the form rather than above it at md+ — see
          AuthWideBody. Same copy, same order on a phone, half the height on a
          laptop, and no scrollbar inside the card. */}
      <AuthWideBody
        intro={
          <>
            <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Patient portal</p>
            <h2 className="auth-heading">Create an account</h2>
            {/* Why the clinic needs a date of birth and a contact number is
                said once, on the field that asks for them (see
                RegistrationForm) rather than again here. */}
            <p className="mt-[var(--auth-step)] max-w-prose text-sm leading-relaxed text-espresso/80">
              No invitation needed. We'll confirm your email address, then set up two-factor sign-in.
            </p>

            {/* The exact mirror of the band on the sign-in screen — same component,
                same weight, reversed direction. Someone who lands on the wrong one
                of these two screens should find the other in the same place. */}
            <AuthCrossLink prompt="Already have an account?" to="/login" label="Sign in" />
          </>
        }
      >
        <RegistrationForm
          showEmailField
          variant="signup"
          submitLabel="Create account"
          onSubmit={async ({ email: submittedEmail, password, profile, consents }) => {
            const result = await apiFetch<SignupResponse>('/auth/signup', {
              method: 'POST',
              body: JSON.stringify({ email: submittedEmail, password, profile, consents }),
            });
            setEmail(submittedEmail ?? '');
            setSent(result);
          }}
        />
      </AuthWideBody>
    </AuthSplitLayout>
  );
}
