import { useState, type FormEvent } from 'react';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { ApiError } from '../../lib/api';

export interface ProfileFormData {
  title?: string;
  firstName: string;
  lastName: string;
  sex?: string;
  dob: string;
  contactNumber: string;
  address: string;
  postcode: string;
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
  submitLabel: string;
  onSubmit: (data: { email?: string; password: string; profile: ProfileFormData; consents: ConsentsData }) => Promise<void>;
}

const required = (fieldLabel: string) => (value: string) => (value.trim() ? undefined : `${fieldLabel} is required.`);

/**
 * Shared by both the admin-invite activation flow and self-service signup
 * — same registration-form field set (brief §1/§2) either way; only how
 * the account gets created differs, which the caller handles via onSubmit.
 */
export function RegistrationForm({ showEmailField, submitLabel, onSubmit }: RegistrationFormProps) {
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
          address: form.address,
          postcode: form.postcode,
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
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-10">
      <Card className="flex flex-col gap-5">
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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Input
            label="Date of birth"
            name="dob"
            type="date"
            value={form.dob}
            onChange={(e) => set('dob', e.target.value)}
            validate={required('Date of birth')}
          />
          <Select label="Sex" name="sex" optional value={form.sex} onChange={(e) => set('sex', e.target.value)}>
            <option value="">Prefer not to say</option>
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
        />
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
      </Card>

      <Card className="flex flex-col gap-5">
        <p className="eyebrow">GP &amp; medical details</p>
        <p className="text-sm text-espresso -mt-2">
          If any of your results come back outside the expected range, we'll ask you to contact your GP — having
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

      <Card className="flex flex-col gap-5">
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

      <Card className="flex flex-col gap-5">
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

      <Card className="flex flex-col gap-1">
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
