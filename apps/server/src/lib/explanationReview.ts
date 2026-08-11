/**
 * ---------------------------------------------------------------------------
 * WHAT COUNTS AS A REVIEW OF PATIENT-FACING CLINICAL COPY.
 * ---------------------------------------------------------------------------
 *
 * One definition, in one place, used by the seed's retraction sweep, by the
 * delegated-approval script and by the tests over both — because the failure
 * this exists to prevent is a definition that drifts. The product reported 72
 * explanations as checked when the honest number was zero: 69 attributed to a
 * seeded demo clinician, one to an administrator, two to nobody at all. Every
 * one of them read, from the review queue, exactly like a clinician had signed
 * it off.
 *
 * A REVIEW IS A NAMED PERSON WHO READ IT. That is the whole rule, and the two
 * halves are separate:
 *
 *  · NAMED. A status with no `reviewedById` is a row somebody clicked. There
 *    is nobody to ask what was checked, so it is not a review however
 *    emphatically the column says REVIEWED.
 *  · A PERSON. An account a seed creates is a fixture. It has a first name, a
 *    surname, post-nominals and a role title, and none of that makes it
 *    somebody who read a sentence about ferritin.
 *
 * WHAT IS DELIBERATELY NOT IN THE RULE: whether the reviewer is clinical. An
 * administrator approving clinical wording is a real person's real act, and it
 * is the audit's job to report that it is not a clinical sign-off — not this
 * module's job to erase it. Retracting a real person's decision because we
 * disagree with their job title would be a worse defect than the one being
 * fixed.
 */

/** The stored review states, as the schema spells them. */
export type ReviewStatus = 'DRAFT' | 'REVIEWED' | 'PUBLISHED';

export interface ReviewRecord {
  reviewStatus: ReviewStatus;
  reviewedById: string | null;
}

/**
 * Whether this row's review status was written by something that is not a
 * person, and should therefore be taken back.
 *
 * `fixtureUserIds` is every account any seed in the repository creates. It is
 * passed in rather than looked up here so this stays pure and so the seed and
 * the test cannot disagree about the list.
 */
export function isRetractableApproval(row: ReviewRecord, fixtureUserIds: ReadonlySet<string>): boolean {
  if (row.reviewStatus === 'DRAFT') return false;
  if (!row.reviewedById) return true;
  return fixtureUserIds.has(row.reviewedById);
}

/** The sentence recorded in the audit entry when one is taken back. */
export function retractionReason(row: ReviewRecord, attributedTo: string | null): string {
  return attributedTo
    ? `Marked ${row.reviewStatus} by ${attributedTo}, which is an account created by the seed. A fixture is not a reviewer, so the status was never a clinical sign-off.`
    : `Marked ${row.reviewStatus} with no reviewer recorded. A review is a named person who read the copy; there is nobody to ask what was checked.`;
}

/**
 * Whether an account may be recorded as having reviewed clinical copy.
 *
 * Used by scripts/recordDelegatedApproval.ts, which is the ONLY non-interactive
 * path allowed to write a review status — and it refuses a fixture, so the
 * defect above cannot be reintroduced by the same mechanism that cleaned it up.
 */
export function mayBeRecordedAsReviewer(
  user: { id: string; email: string } | null,
  fixtureEmails: readonly string[],
): { ok: true } | { ok: false; why: string } {
  if (!user) {
    return {
      ok: false,
      why: 'No such account. A review is attributed to a person who exists, so this refuses rather than creating one.',
    };
  }
  if (fixtureEmails.map((e) => e.toLowerCase()).includes(user.email.toLowerCase())) {
    return {
      ok: false,
      why: `${user.email} is an account the seed creates. Attributing a clinical sign-off to a fixture is the exact defect this path exists to prevent.`,
    };
  }
  return { ok: true };
}
