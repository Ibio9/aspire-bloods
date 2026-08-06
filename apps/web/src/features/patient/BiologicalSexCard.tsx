import { useState } from 'react';
import { BIOLOGICAL_SEX_PURPOSE, biologicalSexLabel, type PatientBiologicalSex } from '@aspire-bloods/shared';
import { Card } from '../../components/ui/Card';
import { Radio } from '../../components/ui/Radio';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ApiError } from '../../lib/api';
import { useBiologicalSex, type BiologicalSexState } from '../../lib/biologicalSex';

/**
 * Asks for biological sex at the two points it actually matters, and explains
 * why rather than nagging.
 *
 * The distinction that makes this not-a-nag: it appears where the answer
 * changes what happens next. On the booking flow it's a genuine blocker and
 * says so plainly (Randox will not accept an order without it). On the
 * account page it's a gap in a record with an explanation attached, and
 * dismissing it is fine — it isn't a modal, it doesn't reappear on every
 * screen, and there is nothing here that repeats an ask the patient already
 * answered.
 *
 * `variant` controls tone only. Both render the same explanation, because
 * two different explanations of the same clinical reason would read as two
 * different reasons (the sentence itself lives in shared/biologicalSex.ts).
 */
interface Props {
  variant: 'account' | 'blocking';
  /** Called after a successful save — the booking flow uses it to unblock. */
  onSaved?: (state: BiologicalSexState) => void;
}

const HEADING = {
  account: 'Biological sex',
  blocking: 'One thing first',
} as const;

export function BiologicalSexCard({ variant, onSaved }: Props) {
  const { state, failed, save } = useBiologicalSex();
  const [choice, setChoice] = useState<PatientBiologicalSex | ''>('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A prompt that can't load its own state must not render an ask it can't
  // honour, and must never block the page it sits on.
  if (failed) return null;

  if (!state) {
    return (
      <Card>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-2/3" />
      </Card>
    );
  }

  // Staff accounts with no patient profile have nothing to record this against.
  if (!state.hasProfile) return null;

  // Recorded, and not being changed — on the booking flow there is nothing
  // left to say, so the card removes itself rather than confirming a fact
  // nobody asked about mid-flow.
  if (state.sex && !editing) {
    if (variant === 'blocking') return null;
    return (
      <Card>
        <p className="eyebrow mb-3">{HEADING.account}</p>
        <p className="text-espresso">
          <span className="font-medium">{biologicalSexLabel(state.sex)}</span>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-espresso/80">{BIOLOGICAL_SEX_PURPOSE}</p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => {
            setChoice(state.sex ?? '');
            setEditing(true);
          }}
        >
          Change
        </Button>
      </Card>
    );
  }

  async function handleSave() {
    if (!choice) {
      setError('Choose one to continue.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const next = await save(choice);
      setEditing(false);
      onSaved?.(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'We could not save that. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const blocking = variant === 'blocking';

  return (
    <Card className={blocking ? 'border-bronze/60' : undefined}>
      <p className="eyebrow mb-3">{blocking ? HEADING.blocking : HEADING.account}</p>

      <p className="text-[15px] leading-relaxed text-espresso">
        {editing
          ? 'Update the biological sex recorded on your account.'
          : blocking
            ? "We don't have your biological sex on file, and the laboratory can't accept an order without it."
            : "We don't have your biological sex on file. It's optional when you register, but it's worth adding."}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-espresso/80">{BIOLOGICAL_SEX_PURPOSE}</p>
      {!editing && !blocking && (
        <p className="mt-2 text-sm leading-relaxed text-espresso/70">
          Without it, any result whose range differs by sex will show its range as unavailable rather than showing
          you one that might not be yours.
        </p>
      )}

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-espresso">Biological sex</legend>
        {/* Radios, not a picker: two options, and both should be visible
            without an interaction. The values are Randox's own reference
            list (GET /BiologicalSex/GetBiologicalSex) — not a set we chose. */}
        <div className="mt-1 flex flex-col">
          <Radio
            name="biologicalSex"
            value="FEMALE"
            checked={choice === 'FEMALE'}
            onChange={() => setChoice('FEMALE')}
            label="Female"
          />
          <Radio
            name="biologicalSex"
            value="MALE"
            checked={choice === 'MALE'}
            onChange={() => setChoice('MALE')}
            label="Male"
          />
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="mt-3 text-sm text-status-significantHigh">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={() => void handleSave()} loading={saving} disabled={!choice}>
          {editing ? 'Save change' : 'Save'}
        </Button>
        {editing && (
          <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-espresso/70">
        This is the biological sex your results are interpreted against. If neither option fits, or your record
        needs to say something different, call the clinic and we'll handle it with you.
      </p>
    </Card>
  );
}
