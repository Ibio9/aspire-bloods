import type { ReportStatus } from '@aspire-bloods/shared';

/**
 * The release pipeline, as data rather than as four separate inline `if`
 * statements spread across service functions.
 *
 *   UPLOADED → PARSED → ADMIN_VERIFIED → CLINICIAN_REVIEWED → RELEASED
 *
 * with CHANGES_REQUESTED as a loop back to re-verification, not a sixth
 * forward stage.
 *
 * Stating it once, here, is what makes "no state can be skipped or
 * improperly reversed" a property you can actually test, instead of a claim
 * about code that has to be re-read every time it changes. Every mutation in
 * reports/service.ts checks against this table, so the enforcement is
 * server-side by construction — the UI's stage indicator is a rendering of
 * this state, never the thing that guards it.
 */
export type ReportAction = 'parse' | 'verify' | 'review' | 'release';

/** For each action, the exact set of statuses it may be performed from. */
const ALLOWED_FROM: Record<ReportAction, readonly ReportStatus[]> = {
  // Re-parsing an already-parsed report is allowed (a re-upload or a parser
  // fix), as is parsing again after changes were requested. Parsing a report
  // that a clinician has already reviewed is not — that would silently
  // replace data underneath a completed review.
  parse: ['UPLOADED', 'PARSED', 'CHANGES_REQUESTED'],

  // Verification is the one step that can legitimately repeat: an admin
  // correcting their own entry before review, or re-verifying after a
  // clinician sent it back. Never from CLINICIAN_REVIEWED or RELEASED —
  // amending a released value goes through the versioned amendment path
  // (editReleasedReportResult), which preserves the previous value.
  verify: ['PARSED', 'ADMIN_VERIFIED', 'CHANGES_REQUESTED'],

  // Only an admin-verified report can be reviewed. This is what makes
  // ADMIN_VERIFIED unskippable: there is no other route into
  // CLINICIAN_REVIEWED.
  review: ['ADMIN_VERIFIED'],

  // And only a clinician-reviewed report can be released. Nothing reaches a
  // patient without having passed through every prior stage, because each
  // stage is the sole entry condition for the next.
  release: ['CLINICIAN_REVIEWED'],
};

export function canPerform(action: ReportAction, from: ReportStatus): boolean {
  return ALLOWED_FROM[action].includes(from);
}

/** The status an action lands on. `review` depends on the reviewer's decision. */
export function resultingStatus(action: ReportAction, approve = true): ReportStatus {
  switch (action) {
    case 'parse':
      return 'PARSED';
    case 'verify':
      return 'ADMIN_VERIFIED';
    case 'review':
      return approve ? 'CLINICIAN_REVIEWED' : 'CHANGES_REQUESTED';
    case 'release':
      return 'RELEASED';
  }
}

/** Statuses a patient may see. Exactly one — the guarantee the whole pipeline exists to make. */
export const PATIENT_VISIBLE_STATUSES: readonly ReportStatus[] = ['RELEASED'];

export function isPatientVisible(status: ReportStatus): boolean {
  return PATIENT_VISIBLE_STATUSES.includes(status);
}
