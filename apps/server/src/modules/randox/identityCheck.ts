import { normaliseName, normaliseDob } from '../../lib/identityMatch.js';
import type { GetOrderResultDetailResponse } from './types.js';

/**
 * ---------------------------------------------------------------------------
 * May this result be attached to this account without anyone looking at it?
 * ---------------------------------------------------------------------------
 *
 * The link itself is not a match. We create every order ourselves, through
 * CreatePendingOrder, against a known patient record, and Randox return that
 * order number on the result. That is a direct reference — the same identifier
 * we wrote down at the time — and it is the only thing an automatic link is
 * ever made on. Nothing in this file compares names to find a patient. There
 * is no code path anywhere in this integration that links on name similarity,
 * on a partial match, or on a probability.
 *
 * What this file does is the second half: having found the account by
 * reference, CORROBORATE it before writing. Two independent statements of who
 * the sample belongs to are available:
 *
 *   1. What Randox echo back on the result payload. The strongest signal
 *      there is — it is the laboratory's own record of whose sample they
 *      analysed — and, per their published response example, not always
 *      supplied. When it is there it is checked. When it isn't, its absence
 *      is recorded as absence and never as agreement.
 *
 *   2. What we sent on CreatePendingOrder, snapshotted on the order row at
 *      the moment we sent it. This is what the laboratory holds against that
 *      order number, so comparing it to the account today catches the case
 *      that would otherwise be invisible: the account's name or date of birth
 *      has been changed since the order was placed, and the person the sample
 *      was taken from may no longer be the person the account describes.
 *
 * The verdict is AGREES only when at least one of those two corroborates, and
 * only when nothing available contradicts. Anything else — a disagreement, or
 * nothing to check against at all — goes to the exception queue with the
 * disagreement named. "Exact order reference plus corroborating identity, or
 * nothing" is enforced here, not in the UI.
 */

export type IdentityVerdict =
  /** Reference matched and identity corroborated. Safe to link automatically. */
  | 'AGREES'
  /** Something available contradicts. Never link; route to the queue. */
  | 'DISAGREES'
  /** Nothing to corroborate against. Never link; route to the queue. */
  | 'UNCORROBORATED';

export interface IdentityEvidence {
  /** Where each statement of identity came from, and whether it agreed. */
  labPayload: 'agrees' | 'disagrees' | 'not-supplied';
  orderSnapshot: 'agrees' | 'disagrees' | 'not-recorded';
  /** Which fields the lab actually supplied, so "agrees" can be read honestly. */
  labSuppliedFields: string[];
  /** Which fields the order snapshot held. */
  snapshotFields: string[];
}

export interface IdentityCheck {
  verdict: IdentityVerdict;
  evidence: IdentityEvidence;
  /** One line per disagreement, naming the field. Empty when it agrees. */
  disagreements: string[];
  /** Admin-facing summary. Always populated, including on AGREES. */
  summary: string;
}

export interface PersonIdentity {
  firstName: string | null;
  lastName: string | null;
  /** yyyy-mm-dd, or anything Date can parse. */
  dob: string | null;
}

/** The identity Randox echoed on the result, or nulls where they didn't. */
export function payloadIdentity(detail: GetOrderResultDetailResponse): PersonIdentity {
  return {
    firstName: detail.patientFirstName ?? null,
    lastName: detail.patientLastName ?? null,
    dob: detail.patientDateOfBirth ?? null,
  };
}

function suppliedFields(identity: PersonIdentity): string[] {
  const fields: string[] = [];
  if (normaliseName(identity.firstName) !== '') fields.push('first name');
  if (normaliseName(identity.lastName) !== '') fields.push('last name');
  if (normaliseDob(identity.dob) !== '') fields.push('date of birth');
  return fields;
}

/**
 * Compares one statement of identity against the account. Only fields the
 * statement actually carries are compared — a lab that sends a surname and no
 * date of birth is checked on the surname, and the fact that it sent no date
 * of birth is reported separately rather than being scored as a pass.
 */
function compare(
  claimed: PersonIdentity,
  account: PersonIdentity,
  sourceLabel: string,
): { checked: string[]; disagreements: string[] } {
  const checked: string[] = [];
  const disagreements: string[] = [];

  const claimedDob = normaliseDob(claimed.dob);
  if (claimedDob !== '') {
    checked.push('date of birth');
    if (claimedDob !== normaliseDob(account.dob)) {
      // The date of birth itself is deliberately NOT quoted into this string.
      // It travels into ingestion logs and the admin queue, which are read by
      // more people than the record is, and the fact of the disagreement is
      // what an admin acts on.
      disagreements.push(`the date of birth ${sourceLabel} does not match the date of birth on this account`);
    }
  }

  const claimedLast = normaliseName(claimed.lastName);
  if (claimedLast !== '') {
    checked.push('last name');
    if (claimedLast !== normaliseName(account.lastName)) {
      disagreements.push(`the last name ${sourceLabel} ("${claimed.lastName}") does not match the name on this account`);
    }
  }

  const claimedFirst = normaliseName(claimed.firstName);
  if (claimedFirst !== '') {
    checked.push('first name');
    if (claimedFirst !== normaliseName(account.firstName)) {
      disagreements.push(
        `the first name ${sourceLabel} ("${claimed.firstName}") does not match the name on this account`,
      );
    }
  }

  return { checked, disagreements };
}

/**
 * A statement corroborates only if it carries a date of birth AND at least
 * one name, and both agree.
 *
 * A surname on its own is not corroboration. Two siblings share one, and so
 * do the two Patel records the practice already has — which is exactly the
 * confusion this integration is required to make impossible. A date of birth
 * on its own is not corroboration either, for the same reason at a lower
 * rate. Together they are the same bar the manual linking flow applies (see
 * lib/identityMatch.ts assessMatch), which is the point: an automatic link
 * must never be permitted on evidence an admin would be refused on.
 */
function corroborates(checked: string[], disagreements: string[]): boolean {
  if (disagreements.length > 0) return false;
  const hasDob = checked.includes('date of birth');
  const hasName = checked.includes('last name') || checked.includes('first name');
  return hasDob && hasName;
}

export function verifyOrderIdentity(input: {
  /** What Randox returned on the result payload. All-null when they sent none. */
  lab: PersonIdentity;
  /** What we sent on CreatePendingOrder, as recorded at the time. */
  orderSnapshot: PersonIdentity;
  /** The account the order was placed against, as it stands now. */
  account: PersonIdentity;
}): IdentityCheck {
  const { lab, orderSnapshot, account } = input;

  const labFields = suppliedFields(lab);
  const snapshotFields = suppliedFields(orderSnapshot);

  const labResult = compare(lab, account, 'the laboratory returned');
  const snapshotResult = compare(orderSnapshot, account, 'this order was placed under');

  const labCorroborates = corroborates(labResult.checked, labResult.disagreements);
  const snapshotCorroborates = corroborates(snapshotResult.checked, snapshotResult.disagreements);

  const evidence: IdentityEvidence = {
    labPayload: labFields.length === 0 ? 'not-supplied' : labResult.disagreements.length > 0 ? 'disagrees' : 'agrees',
    orderSnapshot:
      snapshotFields.length === 0 ? 'not-recorded' : snapshotResult.disagreements.length > 0 ? 'disagrees' : 'agrees',
    labSuppliedFields: labFields,
    snapshotFields,
  };

  const disagreements = [...labResult.disagreements, ...snapshotResult.disagreements];

  // Any contradiction stops it, whichever statement produced it. A lab
  // payload that agrees does not license ignoring an order snapshot that
  // doesn't, and vice versa — two sources disagreeing with each other about
  // the same account is the loudest possible signal that something is wrong.
  if (disagreements.length > 0) {
    return {
      verdict: 'DISAGREES',
      evidence,
      disagreements,
      summary: `Identity did not agree: ${disagreements.join('; ')}.`,
    };
  }

  if (labCorroborates || snapshotCorroborates) {
    const sources = [
      labCorroborates ? 'the identity Randox returned on the result' : null,
      snapshotCorroborates ? 'the identity this order was placed under' : null,
    ].filter(Boolean);
    return {
      verdict: 'AGREES',
      evidence,
      disagreements: [],
      summary: `Order reference matched, and name and date of birth agree with ${sources.join(' and ')}.`,
    };
  }

  // Reference matched, but there is no full name-and-date-of-birth statement
  // to check it against from either source. Not an error and not a
  // disagreement — simply not enough to link on unwatched.
  const missing: string[] = [];
  if (labFields.length === 0) missing.push('Randox returned no patient name or date of birth on the result');
  else missing.push(`Randox returned only: ${labFields.join(', ')}`);
  if (snapshotFields.length === 0) {
    missing.push('and this order has no record of the identity it was placed under (it predates that being captured)');
  } else {
    missing.push(`and the order was placed with only: ${snapshotFields.join(', ')}`);
  }

  return {
    verdict: 'UNCORROBORATED',
    evidence,
    disagreements: [],
    summary: `Order reference matched, but there is nothing to corroborate it with — ${missing.join(', ')}. Held for an admin rather than linked on the reference alone.`,
  };
}
