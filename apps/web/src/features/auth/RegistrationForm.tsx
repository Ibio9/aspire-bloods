import { useState, type FormEvent } from 'react';
import { BIOLOGICAL_SEX_PURPOSE } from '@aspire-bloods/shared';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { DateField } from '../../components/ui/DateField';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { authErrorMessage } from '../../lib/authErrors';

export interface ProfileFormData {
  title?: string;
  firstName: string;
  lastName: string;
  sex?: string;
  dob: string;
  contactNumber: string;
  // Optional in the 'signup' variant — a self-registering patient is only
  // asked for what safe result-linking actually needs.
  address?: string;
  postcode?: string;
  gpName?: string;
  gpAddress?: string;
  medication?: string;
  allergies?: string;
  emergencyContactName?: string;
  emergencyContactNumber?: string;
}

export interface ConsentsData {
  dataProcessing: boolean;
  resultsStorage: boolean;
  commsEmail: boolean;
  commsSms: boolean;
}

interface RegistrationFormProps {
  /** Signup needs an email field; activation doesn't (the invited email is already fixed). */
  showEmailField?: boolean;
  /**
   * 'full' — the practice's whole registration form (brief §1/§2), used when
   * the clinic invited someone and is onboarding them properly.
   *
   * 'signup' — the four things a self-registering patient actually has to
   * give us: who they are, when they were born, how to reach them, and a
   * password. Date of birth and contact number aren't there for the file;
   * they're what an admin matches an incoming result against before
   * attaching it to this person, which is why they're the two optional-
   * looking fields that aren't optional. Address, GP and emergency contact
   * are all things the clinic collects at the appointment, and asking for
   * them here just makes an empty account feel like a gate.
   */
  variant?: 'full' | 'signup';
  submitLabel: string;
  onSubmit: (data: { email?: string; password: string; profile: ProfileFormData; consents: ConsentsData }) => Promise<void>;
}

const required = (fieldLabel: string) => (value: string) => (value.trim() ? undefined : `${fieldLabel} is required.`);

/**
 * Shared by both the admin-invite activation flow and self-service signup
 * — same underlying field set either way; the variant decides how much of
 * it is asked for, and the caller handles how the account gets created via
 * onSubmit.
 */
export function RegistrationForm({ showEmailField, variant = 'full', submitLabel, onSubmit }: RegistrationFormProps) {
  const full = variant === 'full';
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({
    title: '',
    firstName: '',
    lastName: '',
    sex: '',
    dob: '',
    contactNumber: '',
    address: '',
    postcode: '',
    gpName: '',
    gpAddress: '',
    medication: '',
    allergies: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
  });
  const [password, setPassword] = useState('');
  const [consents, setConsents] = useState<ConsentsData>({
    dataProcessing: false,
    resultsStorage: false,
    commsEmail: false,
    commsSms: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.dob) {
      setError('Date of birth is required.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        email: showEmailField ? email : undefined,
        password,
        profile: {
          title: form.title || undefined,
          firstName: form.firstName,
          lastName: form.lastName,
          sex: form.sex || undefined,
          dob: form.dob,
          contactNumber: form.contactNumber,
          address: form.address || undefined,
          postcode: form.postcode || undefined,
          gpName: form.gpName || undefined,
          gpAddress: form.gpAddress || undefined,
          medication: form.medication || undefined,
          allergies: form.allergies || undefined,
          emergencyContactName: form.emergencyContactName || undefined,
          emergencyContactNumber: form.emergencyContactNumber || undefined,
        },
        consents,
      });
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  // Spacing here is driven by the auth vertical rhythm (--auth-step) and the
  // section cards drop to tight padding: this form is nested inside the auth
  // card, so its own generous padding was compounding with the card's and
  // making the tallest screen in the product taller still.
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[calc(var(--auth-step)*1.4)]" noValidate>
      <Card padding="tight" className="flex flex-col gap-[calc(var(--auth-step)*0.9)]">
        <p className="eyebrow">Your details</p>
        {showEmailField && (
          <Input
            label="Email address"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            validate={(v) => (!v ? 'Email address is required.' : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Enter a valid email address.')}
          />
        )}
        <div className="grid grid-cols-1 gap-[calc(var(--auth-step)*0.9)] sm:grid-cols-3">
          <Input label="Title" name="title" optional value={form.title} onChange={(e) => set('title', e.target.value)} />
          <Input
            label="First name"
            name="firstName"
            className="sm:col-span-1"
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            validate={required('First name')}
          />
          <Input
            label="Last name"
            name="lastName"
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            validate={required('Last name')}
          />
        </div>
        <div className="grid grid-cols-1 gap-[calc(var(--auth-step)*0.9)] sm:grid-cols-2">
          {/* preset carries the range and the opening view — no future
              dates, nothing implausibly old, and the calendar opens on a
              plausible birth year instead of this month. */}
          <DateField label="Date of birth" name="dob" preset="birthdate" value={form.dob} onChange={(v) => set('dob', v)} />
          {/* Optional here on purpose — registration stays frictionless, and
              a brand-new account holds no results for a range to apply to.
              But it isn't decoration either, so the label says what it's
              actually for; it's asked for again later at the two points it
              genuinely matters (before a test is ordered, and on the account
              page), rather than being made mandatory here. */}
          <Select
            label="Biological sex"
            name="sex"
            optional
            hint={BIOLOGICAL_SEX_PURPOSE}
            value={form.sex}
            onChange={(e) => set('sex', e.target.value)}
          >
            <option value="">Prefer not to say for now</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
          </Select>
        </div>
        <Input
          label="Contact number"
          name="contactNumber"
          value={form.contactNumber}
          onChange={(e) => set('contactNumber', e.target.value)}
          validate={required('Contact number')}
          hint={
            full
              ? undefined
              : 'Along with your date of birth, this is how the clinic confirms a result is yours before attaching it to your account.'
          }
        />
        {full && (
          <>
            <Input
              label="Home address"
              name="address"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              validate={required('Home address')}
            />
            <Input
              label="Postcode"
              name="postcode"
              value={form.postcode}
              onChange={(e) => set('postcode', e.target.value)}
              validate={required('Postcode')}
            />
          </>
        )}
      </Card>

      {full && (
      <Card padding="tight" className="flex flex-col gap-[calc(var(--auth-step)*0.9)]">
        <p className="eyebrow">GP &amp; medical details</p>
        <p className="text-sm text-espresso -mt-2">
          If any of your results come back outside the expected range, we'll ask you to contact your GP. Having
          these details on file helps us point you in the right direction.
        </p>
        <Input label="GP name" name="gpName" optional value={form.gpName} onChange={(e) => set('gpName', e.target.value)} />
        <Input
          label="GP address"
          name="gpAddress"
          optional
          value={form.gpAddress}
          onChange={(e) => set('gpAddress', e.target.value)}
        />
        <Input
          label="Current medication"
          name="medication"
          optional
          value={form.medication}
          onChange={(e) => set('medication', e.target.value)}
        />
        <Input
          label="Allergies"
          name="allergies"
          optional
          value={form.allergies}
          onChange={(e) => set('allergies', e.target.value)}
        />
      </Card>
      )}

      {full && (
      <Card padding="tight" className="flex flex-col gap-[calc(var(--auth-step)*0.9)]">
        <p className="eyebrow">Emergency contact</p>
        <Input
          label="Name"
          name="emergencyContactName"
          optional
          value={form.emergencyContactName}
          onChange={(e) => set('emergencyContactName', e.target.value)}
        />
        <Input
          label="Contact number"
          name="emergencyContactNumber"
          optional
          value={form.emergencyContactNumber}
          onChange={(e) => set('emergencyContactNumber', e.target.value)}
        />
      </Card>
      )}

      <Card padding="tight" className="flex flex-col gap-[calc(var(--auth-step)*0.9)]">
        <p className="eyebrow">Set your password</p>
        <Input
          label="Password"
          name="password"
          type="password"
          minLength={12}
          hint="At least 12 characters."
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          validate={(v) => (v.length >= 12 ? undefined : 'Password must be at least 12 characters.')}
        />
      </Card>

      <Card padding="tight" className="flex flex-col gap-1">
        <p className="eyebrow mb-2">Consent</p>
        <Checkbox
          name="consentDataProcessing"
          required
          checked={consents.dataProcessing}
          onChange={(e) => setConsents((c) => ({ ...c, dataProcessing: e.target.checked }))}
          label="I consent to Aspire Clinic processing my personal and health data to provide blood test results through this portal."
        />
        <Checkbox
          name="consentResultsStorage"
          required
          checked={consents.resultsStorage}
          onChange={(e) => setConsents((c) => ({ ...c, resultsStorage: e.target.checked }))}
          label="I consent to my blood test results being stored securely and made available to me through this portal."
        />
        <Checkbox
          name="consentCommsEmail"
          checked={consents.commsEmail}
          onChange={(e) => setConsents((c) => ({ ...c, commsEmail: e.target.checked }))}
          label="I'm happy to receive email communications about my results and account."
        />
        <Checkbox
          name="consentCommsSms"
          checked={consents.commsSms}
          onChange={(e) => setConsents((c) => ({ ...c, commsSms: e.target.checked }))}
          label="I'm happy to receive SMS communications about my results and account."
        />
      </Card>

      {error && <p className="text-sm text-status-significantHigh">{error}</p>}

      <Button type="submit" loading={submitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
