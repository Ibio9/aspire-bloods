import type { ReportStatus } from '@aspire-bloods/shared';

/**
 * The release pipeline, as data rather than as inline `if` statements spread
 * across service functions.
 *
 *   UPLOADED → PARSED → RELEASED
 *
 * with CHANGES_REQUESTED as a loop back to correction, not a fourth forward
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
 * RESULTS RELEASE AUTOMATICALLY (changed Aug 2026). THE GATE IS GONE.
 * ---------------------------------------------------------------------------
 *
 * There used to be two human gates, then one. There are now none, and the
 * reasoning is Richard's: a patient not seeing their own abnormal result is
 * worse than them seeing it, and a result sitting in a queue nobody opens is the
 * real risk. A clean parse reaches the patient with no human step, significantly
 * out-of-range results included.
 *
 * `CLINICIAN_REVIEWED` is gone from the enum, the same way `ADMIN_VERIFIED` went
 * before it. Reports sitting in it are migrated to RELEASED — a clinician had
 * already said yes, and the only thing between them and the patient was a second
 * press. Their state history is in AuditLogEntry and is untouched.
 *
 * WHAT REPLACED THE GATE, AND IT IS NOT NOTHING. Automation releases CLEAN work
 * and never pushes a problem through. Two things enforce that, and both are here
 * rather than on a screen somebody has to open:
 *
 *   1. `release` is permitted only from PARSED — so a report still has to have
 *      been read before it can go out, and an UPLOADED file cannot reach anybody.
 *   2. `releaseBlockedByHolds()` below. A report carrying `holdReasons`
 *      (lib/cleanParse.ts) CANNOT be released, by automation or by a human
 *      pressing a button, until those reasons are acknowledged in the same
 *      action. That is the only checkpoint left and it is now load-bearing:
 *      before, a hold slowed a report down on its way to a gate; now it is the
 *      gate, and it is the one a machine cannot open for itself.
 *
 * `review` SURVIVES AND IS NO LONGER A STAGE. It is how a person deals with a
 * HELD report — acknowledge the reasons and let it go, or send it back for
 * correction — and how a clinician releases something automation left standing.
 * Approving lands on RELEASED directly, because there is no longer an
 * intermediate state for it to land in, and inventing one would be the gate
 * coming back under another name.
 */
export type ReportAction = 'parse' | 'verify' | 'review' | 'release';

/** For each action, the exact set of statuses it may be performed from. */
const ALLOWED_FROM: Record<ReportAction, readonly ReportStatus[]> = {
  // Re-parsing an already-parsed report is allowed (a re-upload or a parser
  // fix), as is parsing again after changes were requested. Parsing a RELEASED
  // report is not — that would silently replace data a patient has already read.
  parse: ['UPLOADED', 'PARSED', 'CHANGES_REQUESTED'],

  // A CORRECTION, NOT A STAGE. This is the form a clinician uses to fix a value
  // or to key in a report that never came through the API, and it may repeat as
  // many times as the data needs. Never from RELEASED — amending a released
  // value goes through the versioned amendment path (editReleasedReportResult),
  // which preserves the previous value.
  //
  // UPLOADED is included so a report that never parsed can be keyed in by hand,
  // which is the manual-entry route.
  verify: ['UPLOADED', 'PARSED', 'CHANGES_REQUESTED'],

  // Not a gate any more: the action a person takes on a HELD report, or on one
  // automation left at PARSED. Only from PARSED, so it cannot be used to review
  // a file nobody has read.
  review: ['PARSED'],

  // AND RELEASE IS FROM PARSED, which is what automatic release means: the
  // results are in, and nothing stands between them and the patient except the
  // holds — see releaseBlockedByHolds. Never from UPLOADED (nothing has been
  // read yet) and never from CHANGES_REQUESTED (somebody has said this is wrong).
  release: ['PARSED'],
};

export function canPerform(action: ReportAction, from: ReportStatus): boolean {
  return ALLOWED_FROM[action].includes(from);
}

/**
 * The status an action lands on. `review` depends on the reviewer's decision.
 *
 * `verify` lands on PARSED and not on a stage of its own — it is a correction to
 * the data, and correcting the data is not by itself a decision to publish it.
 */
export function resultingStatus(action: ReportAction, approve = true): ReportStatus {
  switch (action) {
    case 'parse':
      return 'PARSED';
    case 'verify':
      return 'PARSED';
    case 'review':
      return approve ? 'RELEASED' : 'CHANGES_REQUESTED';
    case 'release':
      return 'RELEASED';
  }
}

/**
 * ============================================================================
 *  THE ONE CHECKPOINT LEFT, AND IT IS NOT A HUMAN STEP — IT IS A REFUSAL.
 * ============================================================================
 *
 * A report carrying hold reasons may not be released until somebody
 * acknowledges them. This is the whole of the safety property in the automatic
 * pipeline, so it is one function with one caller shape rather than a condition
 * copied into the release path and the publish path and the review path.
 *
 * It applies to AUTOMATION IDENTICALLY: `materialiseParsedReport` releases what
 * it wrote only when the parse was clean, and if it were ever changed to pass an
 * acknowledgement it would be a machine acknowledging its own question. Nothing
 * in the automatic path may set `acknowledged`.
 */
export function releaseBlockedByHolds(
  report: { holdReasons: readonly string[] },
  acknowledged: boolean,
): boolean {
  return report.holdReasons.length > 0 && !acknowledged;
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
 *
 * AWAITING_REVIEW IS GONE WITH THE GATE. A clean parsed report is released by
 * the same call that wrote it, so it has no queue to wait in. What is left at
 * PARSED with nothing held is either a PDF nobody has keyed in yet or an
 * automatic release that failed — both of which need a person, and neither of
 * which is "awaiting review". NOT_RELEASED says the true thing about both.
 */
export type ReportQueueState = 'AWAITING_PARSE' | 'HELD' | 'NOT_RELEASED' | 'RELEASED';

export function queueState(report: { status: ReportStatus; holdReasons: string[] }): ReportQueueState {
  switch (report.status) {
    case 'UPLOADED':
      return 'AWAITING_PARSE';
    case 'CHANGES_REQUESTED':
      return 'HELD';
    case 'PARSED':
      // The distinction the removed stages used to carry, now carried by the data.
      return report.holdReasons.length > 0 ? 'HELD' : 'NOT_RELEASED';
    case 'RELEASED':
      return 'RELEASED';
  }
}
