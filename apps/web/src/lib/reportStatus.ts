/**
 * ONE HUMAN GATE, AND IT IS A CLINICIAN (changed Aug 2026).
 *
 *   UPLOADED → PARSED → CLINICIAN_REVIEWED → RELEASED
 *
 * ADMIN_VERIFIED is gone. It caught transcription errors from a PDF, and results
 * arrive structured through the Randox API now.
 *
 * PARSED is "awaiting clinician review". Whether the parse was CLEAN is not a
 * status — it is `holdReasons` on the report, so every function here that has to
 * tell a ready report from a held one takes the holds as well as the status.
 * Passing only the status is how a report with a result missing from it would
 * read, on a work queue, as ready for a clinician.
 */
export type ReportStatus = 'UPLOADED' | 'PARSED' | 'CHANGES_REQUESTED' | 'CLINICIAN_REVIEWED' | 'RELEASED';

/** The four stages of the release pipeline. Was five; the verification stage is gone. */
export const PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: 'UPLOADED', label: 'Received' },
  { key: 'PARSED', label: 'Results in' },
  { key: 'CLINICIAN_REVIEWED', label: 'Clinician reviewed' },
  { key: 'RELEASED', label: 'Released' },
];

/** CHANGES_REQUESTED sits at the same position as PARSED — a step back, not a fifth stage. */
export function stageIndex(status: ReportStatus): number {
  switch (status) {
    case 'UPLOADED':
      return 0;
    case 'PARSED':
    case 'CHANGES_REQUESTED':
      return 1;
    case 'CLINICIAN_REVIEWED':
      return 2;
    case 'RELEASED':
      return 3;
  }
}

/**
 * What is blocking this report, in plain language — shown beside the progress
 * indicator and used to sort the clinician's work queue.
 *
 * `held` is the holds on the report. A PARSED report is waiting on the clinician
 * when nothing is held and waiting on a question when something is, and those are
 * two different sentences: the removed stage used to be the difference.
 */
export function whatsNext(status: ReportStatus, held = false): string {
  switch (status) {
    case 'UPLOADED':
      return 'Results have not been read from this yet.';
    case 'PARSED':
      return held
        ? 'Held: something in this delivery needs a decision before it is reviewed.'
        : 'Needs clinician review.';
    case 'CHANGES_REQUESTED':
      return 'Changes requested: needs correcting.';
    case 'CLINICIAN_REVIEWED':
      return 'Ready to release to the patient.';
    case 'RELEASED':
      return 'Visible to the patient.';
  }
}

/** Short label for compact contexts (list rows, badges) — human words, not the raw enum. */
export function statusLabel(status: ReportStatus, held = false): string {
  switch (status) {
    case 'UPLOADED':
      return 'Received';
    case 'PARSED':
      return held ? 'Held' : 'Awaiting review';
    case 'CHANGES_REQUESTED':
      return 'Changes requested';
    case 'CLINICIAN_REVIEWED':
      return 'Reviewed';
    case 'RELEASED':
      return 'Released';
  }
}

/**
 * The buckets a work queue is grouped into. Not the status enum: HELD is a
 * property of the data and AWAITING_REVIEW is the same status with nothing held,
 * so the queue's own vocabulary has to carry the distinction the pipeline no
 * longer does. Mirrors `queueState` in the server's lib/reportTransitions.ts.
 */
export type QueueState = 'HELD' | 'AWAITING_REVIEW' | 'AWAITING_RELEASE' | 'AWAITING_PARSE';

export function queueState(report: { status: string; holdReasons?: string[] }): QueueState | 'RELEASED' {
  const held = (report.holdReasons ?? []).length > 0;
  switch (report.status) {
    case 'UPLOADED':
      return 'AWAITING_PARSE';
    case 'CHANGES_REQUESTED':
      return 'HELD';
    case 'PARSED':
      return held ? 'HELD' : 'AWAITING_REVIEW';
    case 'CLINICIAN_REVIEWED':
      return 'AWAITING_RELEASE';
    default:
      return 'RELEASED';
  }
}

// Ordered by what a clinician should look at first, and HELD LEADS.
//
// It used to lead with CLINICIAN_REVIEWED, on the reasoning that a reviewed
// report is the one a patient has been waiting on longest. That is still true and
// is no longer the most urgent thing on the list: with the verification stage
// gone, a held report is the only thing standing between a bad parse and a
// clinician's screen, and it is the bucket nobody was looking at.
const ACTION_QUEUE_ORDER: QueueState[] = ['HELD', 'AWAITING_RELEASE', 'AWAITING_REVIEW', 'AWAITING_PARSE'];

const QUEUE_LABEL: Record<QueueState, string> = {
  HELD: 'Held: needs a decision before review',
  AWAITING_RELEASE: 'Reviewed, ready to release',
  AWAITING_REVIEW: 'Awaiting clinician review',
  AWAITING_PARSE: 'Results not read yet',
};

export interface AwaitingActionReport {
  id: string;
  status: string;
  voidedAt: string | null;
  /** Optional so an older payload still buckets; absent reads as nothing held. */
  holdReasons?: string[];
}

export interface AwaitingActionBucket {
  state: QueueState;
  label: string;
  count: number;
  reportIds: string[];
}

/** Groups open (non-released, non-voided) reports by what is blocking them, most urgent first. */
export function bucketAwaitingAction<T extends AwaitingActionReport>(reports: T[]): AwaitingActionBucket[] {
  const open = reports.filter((r) => !r.voidedAt && r.status !== 'RELEASED');
  return ACTION_QUEUE_ORDER.map((state) => {
    const matches = open.filter((r) => queueState(r) === state);
    return { state, label: QUEUE_LABEL[state], count: matches.length, reportIds: matches.map((r) => r.id) };
  }).filter((b) => b.count > 0);
}
