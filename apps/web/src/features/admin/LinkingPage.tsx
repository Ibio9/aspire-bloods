import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '@aspire-bloods/shared';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { apiFetch } from '../../lib/api';

interface Agreement {
  dob: boolean;
  firstName: boolean;
  lastName: boolean;
  contactNumber: boolean;
  linkable: boolean;
  blockedReason: string | null;
}

interface Candidate {
  patientId: string;
  displayName: string;
  email: string;
  dob: string | null;
  contactNumber: string | null;
  agreement: Agreement;
}

interface UnmatchedResult {
  id: string;
  sourceKey: string;
  externalId: string | null;
  sampleDate: string | null;
  markerCount: number;
  createdAt: string;
  claimed: { firstName: string | null; lastName: string | null; dob: string | null; contactNumber: string | null };
  candidates: Candidate[];
}

interface UnlinkedAccount {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  displayName: string;
  dob: string | null;
  contactNumber: string | null;
}

interface RecentLink {
  id: string;
  sourceKey: string;
  externalId: string | null;
  sampleDate: string | null;
  markerCount: number;
  linkedAt: string | null;
  reportId: string | null;
  patientId: string | null;
  patientName: string | null;
}

interface Queue {
  unlinkedAccounts: UnlinkedAccount[];
  unmatchedResults: UnmatchedResult[];
  recentLinks: RecentLink[];
}

const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  PENDING_VERIFICATION: 'Email not confirmed',
  INVITED: 'Invited, not activated',
};

function TickIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Whether a field agreed is carried by the word AND the icon shape — a tick
 * versus a cross, "matches" versus "does not match". Colour is the last of
 * the three signals, never the only one. This is the screen where a
 * misread is most expensive, so it's the last place to lean on green/red.
 */
function AgreementChip({ label, agreed }: { label: string; agreed: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        agreed ? 'border-bronze/40 bg-bronze-50 text-bronze-700' : 'border-taupe bg-cream-50 text-espresso/80'
      }`}
    >
      {agreed ? <TickIcon /> : <CrossIcon />}
      {label} {agreed ? 'matches' : 'does not match'}
    </span>
  );
}

/**
 * DD/MM/YYYY (or D-M-YYYY) to an ISO date. Day-first only — this is a UK
 * practice, and quietly accepting an American ordering here would turn
 * 03/04/1985 into a silent match against the wrong person.
 */
function parseTypedDate(input: string): string | null {
  const match = input.trim().match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Round-trips only for a real calendar date — 31/02 fails here rather than
  // silently rolling into March.
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function IdentityRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="eyebrow mb-1">{label}</dt>
      <dd className={`text-sm ${value ? 'text-espresso' : 'text-espresso/80'} ${label.includes('birth') || label.includes('number') ? 'tabular' : ''}`}>
        {value ?? 'Not supplied'}
      </dd>
    </div>
  );
}

/**
 * The confirm step. Deliberately not a one-click "link" button on the
 * candidate row: the admin has to re-enter the date of birth they matched
 * on, and the server checks it against its own copy of the account before
 * it will accept the link. Ticking a box beside a pre-filled value is not
 * the same act as reading two records and finding they agree, and this is
 * the one decision in the product where that difference is worth a few
 * seconds of friction.
 */
function LinkConfirmModal({
  result,
  candidate,
  onClose,
  onLinked,
}: {
  result: UnmatchedResult;
  candidate: Candidate;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [typedDob, setTypedDob] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function handleLink() {
    const confirmedDob = parseTypedDate(typedDob);
    if (!confirmedDob) {
      setError('Enter the date of birth as DD/MM/YYYY.');
      return;
    }
    if (!acknowledged) {
      setError('Please confirm you have checked both records.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/admin/linking/${result.id}/link`, {
        method: 'POST',
        body: JSON.stringify({ patientId: candidate.patientId, confirmedDob, confirm: true }),
      });
      toast.show(`Result linked to ${candidate.displayName}.`);
      onLinked();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Link this result to a patient"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={submitting} onClick={handleLink}>
            Link to {candidate.displayName}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-espresso">
        You are about to attach {result.markerCount} result{result.markerCount === 1 ? '' : 's'}
        {result.sampleDate ? `, sampled ${formatDate(result.sampleDate)},` : ''} to{' '}
        <span className="font-medium">{candidate.displayName}</span> ({candidate.email}). They will see it once a
        clinician has reviewed and released it.
      </p>

      <div className="mt-5 flex flex-col gap-4">
        <Card padding="tight">
          <p className="eyebrow mb-3">On the result</p>
          <dl className="flex flex-col gap-3">
            <IdentityRow label="Name" value={[result.claimed.firstName, result.claimed.lastName].filter(Boolean).join(' ') || null} />
            <IdentityRow label="Date of birth" value={result.claimed.dob ? formatDate(result.claimed.dob) : null} />
            <IdentityRow label="Contact number" value={result.claimed.contactNumber} />
          </dl>
        </Card>
        <Card padding="tight">
          <p className="eyebrow mb-3">On the account</p>
          <dl className="flex flex-col gap-3">
            <IdentityRow label="Name" value={candidate.displayName} />
            <IdentityRow label="Date of birth" value={candidate.dob ? formatDate(candidate.dob) : null} />
            <IdentityRow label="Contact number" value={candidate.contactNumber} />
          </dl>
        </Card>
      </div>

      {/* A typed field, not a picker: the point is that the admin reads the
          date off the records and writes it out, which is what catches a
          mis-selected patient. A calendar popover would just be another
          thing to click past. */}
      <div className="mt-5">
        <Input
          label="Re-type the patient's date of birth"
          name="confirmedDob"
          inputMode="numeric"
          placeholder="DD/MM/YYYY"
          autoComplete="off"
          value={typedDob}
          onChange={(e) => setTypedDob(e.target.value)}
          hint="Type it out rather than copying it across. This is the check that catches the wrong patient being selected."
        />
      </div>

      <label className="mt-4 flex items-start gap-3 text-sm leading-relaxed text-espresso">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-bronze"
        />
        <span>
          I have compared both records above and I am satisfied this result belongs to this patient.
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-4 text-sm text-status-significantHigh">
          {error}
        </p>
      )}
    </Modal>
  );
}

function UnmatchedResultCard({ result, onChanged }: { result: UnmatchedResult; onChanged: () => void }) {
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const toast = useToast();

  const claimedName = [result.claimed.firstName, result.claimed.lastName].filter(Boolean).join(' ');
  const linkable = result.candidates.filter((c) => c.agreement.linkable);
  const nearMisses = result.candidates.filter((c) => !c.agreement.linkable);

  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-1.5">
            {result.sourceKey} {result.externalId ? `· ${result.externalId}` : ''}
          </p>
          <p className="font-display text-2xl leading-tight text-espresso">{claimedName || 'No name supplied'}</p>
        </div>
        <p className="tabular text-xs text-espresso/80">
          {result.markerCount} marker{result.markerCount === 1 ? '' : 's'}
          {result.sampleDate ? ` · sampled ${formatDate(result.sampleDate)}` : ''}
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-taupe pt-4">
        <IdentityRow label="Date of birth" value={result.claimed.dob ? formatDate(result.claimed.dob) : null} />
        <IdentityRow label="Contact number" value={result.claimed.contactNumber} />
      </dl>

      <div className="mt-6 border-t border-taupe pt-4">
        <p className="eyebrow mb-3">Possible accounts</p>

        {result.candidates.length === 0 && (
          <p className="text-sm leading-relaxed text-espresso/80">
            Nothing on file resembles this patient. It keeps waiting here, and is rechecked against new accounts
            every time you open the queue.
          </p>
        )}

        {linkable.length > 0 && (
          <ul className="flex flex-col gap-3">
            {linkable.map((c) => (
              <li key={c.patientId} className="rounded-input border border-taupe bg-cream-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link to={`/admin/patients/${c.patientId}`} className="font-medium text-bronze-600 underline underline-offset-2">
                      {c.displayName}
                    </Link>
                    <p className="text-xs text-espresso/80">{c.email}</p>
                  </div>
                  <Button variant="secondary" onClick={() => setChosen(c)}>
                    Review and link
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <AgreementChip label="Date of birth" agreed={c.agreement.dob} />
                  <AgreementChip label="Surname" agreed={c.agreement.lastName} />
                  <AgreementChip label="First name" agreed={c.agreement.firstName} />
                  <AgreementChip label="Contact number" agreed={c.agreement.contactNumber} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Near misses are shown rather than hidden. An admin who can't see
            the account that nearly matched has no way to tell "nobody has
            registered" from "the date of birth is a digit out" — and those
            call for completely different actions. */}
        {nearMisses.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-espresso/80">
              {nearMisses.length} account{nearMisses.length === 1 ? '' : 's'} partly resemble{nearMisses.length === 1 ? 's' : ''} this
              patient but cannot be linked
            </summary>
            <ul className="mt-3 flex flex-col gap-3">
              {nearMisses.map((c) => (
                <li key={c.patientId} className="rounded-input border border-taupe p-3">
                  <Link to={`/admin/patients/${c.patientId}`} className="font-medium text-bronze-600 underline underline-offset-2">
                    {c.displayName}
                  </Link>
                  <p className="text-xs text-espresso/80">{c.email}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <AgreementChip label="Date of birth" agreed={c.agreement.dob} />
                    <AgreementChip label="Surname" agreed={c.agreement.lastName} />
                    <AgreementChip label="First name" agreed={c.agreement.firstName} />
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-espresso/80">{c.agreement.blockedReason}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="mt-6 flex justify-end border-t border-taupe pt-4">
        <Button variant="secondary" onClick={() => setDismissing(true)}>
          Dismiss
        </Button>
      </div>

      {chosen && (
        <LinkConfirmModal
          result={result}
          candidate={chosen}
          onClose={() => setChosen(null)}
          onLinked={() => {
            setChosen(null);
            onChanged();
          }}
        />
      )}

      <ConfirmModal
        open={dismissing}
        onClose={() => setDismissing(false)}
        title="Dismiss this result"
        confirmLabel="Dismiss"
        requireReason
        reasonLabel="Why is this being dismissed?"
        onConfirm={async (reason) => {
          await apiFetch(`/admin/linking/${result.id}/dismiss`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
          });
          toast.show('Result dismissed.');
          setDismissing(false);
          onChanged();
        }}
      >
        <p className="text-sm leading-relaxed text-espresso">
          The result stays on record with your reason attached (nothing is deleted), but it stops appearing in
          this queue. Use this for duplicates and results that were never ours, not for ones you simply can't
          place yet.
        </p>
      </ConfirmModal>
    </Card>
  );
}

function RecentLinkRow({ link, onChanged }: { link: RecentLink; onChanged: () => void }) {
  const [unlinking, setUnlinking] = useState(false);
  const toast = useToast();

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-taupe py-3 first:border-t-0">
      <div>
        <p className="text-sm font-medium text-espresso">{link.patientName ?? 'Unknown patient'}</p>
        <p className="tabular text-xs text-espresso/80">
          {link.markerCount} marker{link.markerCount === 1 ? '' : 's'}
          {link.sampleDate ? ` · sampled ${formatDate(link.sampleDate)}` : ''}
          {link.linkedAt ? ` · linked ${formatDate(link.linkedAt)}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {link.reportId && (
          <Link to={`/admin/reports/${link.reportId}`} className="text-sm font-medium text-bronze-600 underline underline-offset-2">
            Open report
          </Link>
        )}
        <Button variant="secondary" onClick={() => setUnlinking(true)}>
          Unlink
        </Button>
      </div>

      <ConfirmModal
        open={unlinking}
        onClose={() => setUnlinking(false)}
        title="Unlink this result"
        confirmLabel="Unlink"
        requireReason
        reasonLabel="Why is this being unlinked?"
        onConfirm={async (reason) => {
          await apiFetch(`/admin/linking/${link.id}/unlink`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
          });
          toast.show('Result unlinked and returned to the queue.');
          setUnlinking(false);
          onChanged();
        }}
      >
        <p className="text-sm leading-relaxed text-espresso">
          The report is voided. It disappears from {link.patientName ?? 'the patient'}'s portal immediately, even
          if it was already released, and the result goes back into the unmatched queue so it can be linked to the
          right person. Nothing is deleted, and your reason is recorded against both.
        </p>
      </ConfirmModal>
    </li>
  );
}

/**
 * Unlinked accounts and unmatched results, side by side, because the whole
 * job is a comparison. Registration is open and unguarded — this is where
 * the care lives instead, and it's the one screen in the admin console
 * built to slow someone down rather than speed them up.
 */
export function LinkingPage() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [failed, setFailed] = useState(false);
  const [accountQuery, setAccountQuery] = useState('');

  const load = useCallback(() => {
    apiFetch<Queue>('/admin/linking')
      .then(setQueue)
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  const filteredAccounts = useMemo(() => {
    if (!queue) return [];
    const q = accountQuery.trim().toLowerCase();
    if (!q) return queue.unlinkedAccounts;
    return queue.unlinkedAccounts.filter(
      (a) => a.displayName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q),
    );
  }, [queue, accountQuery]);

  if (failed) {
    return (
      <>
        <TwoTierHeading eyebrow="Aspire Clinic · Admin console" title="Result linking" />
        <Card className="mt-10 max-w-xl">
          <p className="font-display text-2xl text-espresso">We couldn't load the linking queue</p>
          <p className="mt-2 text-sm text-espresso/80">Please refresh the page.</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Admin console" title="Result linking" />
      <p className="mt-5 max-w-3xl text-lg leading-relaxed text-espresso">
        Results that arrived without an account, beside accounts with nothing attached. Nothing is matched
        automatically: a name alone is never enough, and the date of birth must agree before a link can be made.
      </p>

      {queue === null ? (
        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2" aria-busy="true" aria-label="Loading the linking queue">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-12 grid grid-cols-1 items-start gap-10 lg:grid-cols-2">
            {/* ------------------------- Results ------------------------- */}
            <section aria-labelledby="unmatched-heading">
              <h2 id="unmatched-heading" className="font-display text-3xl text-espresso">
                Results waiting
                {queue.unmatchedResults.length > 0 && (
                  <span className="tabular ml-3 align-middle text-lg text-espresso/80">{queue.unmatchedResults.length}</span>
                )}
              </h2>
              {queue.unmatchedResults.length === 0 ? (
                <div className="mt-6">
                  <EmptyState
                    title="Nothing waiting"
                    description="Every result that's come in has been attached to someone. New arrivals that can't be placed automatically will show up here."
                  />
                </div>
              ) : (
                <div className="mt-6 flex flex-col gap-6">
                  {queue.unmatchedResults.map((r) => (
                    <UnmatchedResultCard key={r.id} result={r} onChanged={load} />
                  ))}
                </div>
              )}
            </section>

            {/* ------------------------- Accounts ------------------------- */}
            <section aria-labelledby="unlinked-heading">
              <h2 id="unlinked-heading" className="font-display text-3xl text-espresso">
                Accounts with no results
                {queue.unlinkedAccounts.length > 0 && (
                  <span className="tabular ml-3 align-middle text-lg text-espresso/80">{queue.unlinkedAccounts.length}</span>
                )}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-espresso/80">
                An account here is not a problem to solve — most are simply patients who haven't been tested yet.
              </p>

              {queue.unlinkedAccounts.length > 0 && (
                <div className="mt-5 max-w-sm">
                  <Input
                    label="Search accounts"
                    name="accountQuery"
                    optional
                    placeholder="Name or email…"
                    value={accountQuery}
                    onChange={(e) => setAccountQuery(e.target.value)}
                  />
                </div>
              )}

              {queue.unlinkedAccounts.length === 0 ? (
                <div className="mt-6">
                  <EmptyState
                    title="Every account has results"
                    description="Nobody is registered and waiting. New self-registered patients will appear here until their first result is linked."
                  />
                </div>
              ) : (
                <ul className="mt-5 flex flex-col gap-3">
                  {filteredAccounts.map((a) => (
                    <li key={a.id} className="rounded-input border border-taupe bg-cream-50 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link to={`/admin/patients/${a.id}`} className="font-medium text-bronze-600 underline underline-offset-2">
                          {a.displayName}
                        </Link>
                        <span className="text-xs text-espresso/80">{ACCOUNT_STATUS_LABEL[a.status] ?? a.status}</span>
                      </div>
                      <p className="text-xs text-espresso/80">{a.email}</p>
                      <dl className="mt-3 grid grid-cols-2 gap-3">
                        <IdentityRow label="Date of birth" value={a.dob ? formatDate(a.dob) : null} />
                        <IdentityRow label="Contact number" value={a.contactNumber} />
                      </dl>
                    </li>
                  ))}
                  {filteredAccounts.length === 0 && (
                    <li className="text-sm text-espresso/80">No account matches that search.</li>
                  )}
                </ul>
              )}
            </section>
          </div>

          {queue.recentLinks.length > 0 && (
            <section aria-labelledby="recent-heading" className="mt-16">
              <h2 id="recent-heading" className="font-display text-3xl text-espresso">
                Recently linked
              </h2>
              {/* The section exists because a wrong link is usually spotted
                  within minutes — the Unlink control says that by being here. */}
              <Card className="mt-6">
                <ul className="flex flex-col">
                  {queue.recentLinks.map((l) => (
                    <RecentLinkRow key={l.id} link={l} onChanged={load} />
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </>
      )}
    </>
  );
}
