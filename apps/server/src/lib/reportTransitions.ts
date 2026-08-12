import type { ReportStatus } from '@aspire-bloods/shared';

/**
 * The release pipeline, as data rather than as four separate inline `if`
 * statements spread across service functions.
 *
 *   UPLOADED → PARSED → CLINICIAN_REVIEWED → RELEASED
 *
 * with CHANGES_REQUESTED as a loop back to correction, not a fifth forward
 * stage.
 *
 * Stating it once, here, is what makes "no state can be skipped or improperly
 * reversed" a property you can actually test, instead of a claim about code that
 * has to be re-read every time it changes. Every mutation in reports/service.ts
 * checks against this table, so the enforcement is server-side by construction —
 * the UI's stage indicator is a rendering of this state, never the thing that
 * guards it.
 *
 * ---------------------------------------------------------------------------
 * ONE HUMAN GATE, AND IT IS A CLINICIAN (changed Aug 2026)
 * ---------------------------------------------------------------------------
 *
 * There used to be two: ADMIN_VERIFIED and then CLINICIAN_REVIEWED.
 *
 * ADMIN_VERIFIED is gone. It existed to catch transcription errors from a PDF,
 * and results now arrive structured through the Randox API — so there is nothing
 * being transcribed and nothing for that step to catch. A person retyping what
 * the laboratory already sent adds a delay and a typo risk without adding a
 * check.
 *
 * CLINICIAN_REVIEWED stays and is the only gate. It is one click, and it is a
 * clinician deciding a patient can see this — which is a different question from
 * whether the numbers copied across correctly. There is no bypass, no setting
 * that skips it, and nothing auto-publishes: `release` may only be performed
 * from CLINICIAN_REVIEWED, and CLINICIAN_REVIEWED is only reachable through
 * `review`, which is only ever called by a human request handler.
 *
 * WHAT REPLACED THE VERIFY GATE, AND WHY IT IS NOT A SECOND ONE. `verify` still
 * exists as an ACTION — it is how a clinician corrects a value or enters a
 * report that did not arrive through the API — but it no longer advances a
 * status, so it cannot be a gate. It lands back on PARSED, which is where the
 * report already was.
 *
 * And whether a parse was CLEAN is not a status either. It is `holdReasons` on
 * the report (lib/cleanParse.ts). A four-state pipeline has no state left to
 * park a problem in, and the failure that has to be impossible is a report with
 * an unmapped analyte in it looking identical, on a clinician's queue, to one
 * with nothing wrong. So the hold travels with the report rather than with its
 * position in the pipeline, and `review` requires it to have been acknowledged.
 */
export type ReportAction = 'parse' | 'verify' | 'review' | 'release';

/** For each action, the exact set of statuses it may be performed from. */
const ALLOWED_FROM: Record<ReportAction, readonly ReportStatus[]> = {
  // Re-parsing an already-parsed report is allowed (a re-upload or a parser
  // fix), as is parsing again after changes were requested. Parsing a report
  // that a clinician has already reviewed is not — that would silently
  // replace data underneath a completed review.
  parse: ['UPLOADED', 'PARSED', 'CHANGES_REQUESTED'],

  // A CORRECTION, NOT A STAGE. This is the form a clinician uses to fix a value
  // or to key in a report that never came through the API, and it may repeat as
  // many times as the data needs. Never from CLINICIAN_REVIEWED (that would
  // change data underneath a completed review) or RELEASED — amending a released
  // value goes through the versioned amendment path
  // (editReleasedReportResult), which preserves the previous value.
  //
  // UPLOADED is included so a report that never parsed can be keyed in by hand,
  // which is the manual-entry route and used to be reachable only because
  // manual entry synthesised a PARSED status first.
  verify: ['UPLOADED', 'PARSED', 'CHANGES_REQUESTED'],

  // THE ONE HUMAN GATE. Only from PARSED, which is what makes it unskippable:
  // there is no other route into CLINICIAN_REVIEWED, and `release` accepts
  // nothing else.
  review: ['PARSED'],

  // And only a clinician-reviewed report can be released. Nothing reaches a
  // patient without a clinician having said so.
  release: ['CLINICIAN_REVIEWED'],
};

export function canPerform(action: ReportAction, from: ReportStatus): boolean {
  return ALLOWED_FROM[action].includes(from);
}

/**
 * The status an action lands on. `review` depends on the reviewer's decision.
 *
 * `verify` lands on PARSED and not on a stage of its own — it is a correction to
 * the data, and correcting the data does not move the report closer to a
 * patient. That is the whole of the "one gate" change in one line.
 */
export function resultingStatus(action: ReportAction, approve = true): ReportStatus {
  switch (action) {
    case 'parse':
      return 'PARSED';
    case 'verify':
      return 'PARSED';
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

/**
 * The state a report is in as far as a WORK QUEUE is concerned: who is it
 * waiting on, and is anything wrong with it.
 *
 * Derived rather than stored, from the status and the holds together, because
 * those are the two independent facts and combining them into a stored field is
 * how they would drift apart.
 */
export type ReportQueueState = 'AWAITING_PARSE' | 'HELD' | 'AWAITING_REVIEW' | 'AWAITING_RELEASE' | 'RELEASED';

export function queueState(report: { status: ReportStatus; holdReasons: string[] }): ReportQueueState {
  switch (report.status) {
    case 'UPLOADED':
      return 'AWAITING_PARSE';
    case 'CHANGES_REQUESTED':
      return 'HELD';
    case 'PARSED':
      // The distinction the removed stage used to carry, now carried by the data.
      return report.holdReasons.length > 0 ? 'HELD' : 'AWAITING_REVIEW';
    case 'CLINICIAN_REVIEWED':
      return 'AWAITING_RELEASE';
    case 'RELEASED':
      return 'RELEASED';
  }
}
