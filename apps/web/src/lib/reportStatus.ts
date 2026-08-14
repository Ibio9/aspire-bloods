/**
 * RESULTS RELEASE AUTOMATICALLY (changed Aug 2026). THERE IS NO HUMAN GATE.
 *
 *   UPLOADED → PARSED → RELEASED
 *
 * ADMIN_VERIFIED went first, then CLINICIAN_REVIEWED. A patient not seeing their
 * own abnormal result is worse than them seeing it, and a result sitting in a
 * queue nobody opens is the real risk.
 *
 * PARSED is "read, not released". Whether the parse was CLEAN is not a status —
 * it is `holdReasons` on the report — and it is now the only thing that stops a
 * release, so every function here that has to tell a released-able report from a
 * held one takes the holds as well as the status. Passing only the status is how
 * a report with a result missing from it would read, on a work queue, as
 * something automation simply had not got round to.
 */
export type ReportStatus = 'UPLOADED' | 'PARSED' | 'CHANGES_REQUESTED' | 'RELEASED';

/** The three stages of the release pipeline. Was five, then four. */
export const PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: 'UPLOADED', label: 'Received' },
  { key: 'PARSED', label: 'Results in' },
  { key: 'RELEASED', label: 'Released' },
];

/** CHANGES_REQUESTED sits at the same position as PARSED — a step back, not a fourth stage. */
export function stageIndex(status: ReportStatus): number {
  switch (status) {
    case 'UPLOADED':
      return 0;
    case 'PARSED':
    case 'CHANGES_REQUESTED':
      return 1;
    case 'RELEASED':
      return 2;
  }
}

/**
 * What is blocking this report, in plain language — shown beside the progress
 * indicator and used to sort the clinician's work queue.
 *
 * `held` is the holds on the report. A PARSED report with nothing held is one
 * automation did not release (a PDF nobody has keyed in, or a release that
 * failed); with something held it is waiting on a decision. Those are two
 * different sentences and the removed stages used to be the difference.
 */
export function whatsNext(status: ReportStatus, held = false): string {
  switch (status) {
    case 'UPLOADED':
      return 'Results have not been read from this yet.';
    case 'PARSED':
      return held
        ? 'Held: something in this delivery needs a decision before it can go to the patient.'
        : 'Read, but not released. Automation releases a clean delivery on its own, so this one needs a person.';
    case 'CHANGES_REQUESTED':
      return 'Changes requested: needs correcting.';
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
      return held ? 'Held' : 'Not released';
    case 'CHANGES_REQUESTED':
      return 'Changes requested';
    case 'RELEASED':
      return 'Released';
  }
}

/**
 * The buckets a work queue is grouped into. Not the status enum: HELD is a
 * property of the data and NOT_RELEASED is the same status with nothing held, so
 * the queue's own vocabulary has to carry the distinction the pipeline no longer
 * does. Mirrors `queueState` in the server's lib/reportTransitions.ts.
 *
 * AWAITING_REVIEW went with the gate. Nothing is awaiting review — a clean
 * report is released by the call that wrote it.
 */
export type QueueState = 'HELD' | 'NOT_RELEASED' | 'AWAITING_PARSE';

export function queueState(report: { status: string; holdReasons?: string[] }): QueueState | 'RELEASED' {
  const held = (report.holdReasons ?? []).length > 0;
  switch (report.status) {
    case 'UPLOADED':
      return 'AWAITING_PARSE';
    case 'CHANGES_REQUESTED':
      return 'HELD';
    case 'PARSED':
      return held ? 'HELD' : 'NOT_RELEASED';
    default:
      return 'RELEASED';
  }
}

// Ordered by what a clinician should look at first, and HELD LEADS.
//
// With no gate in the pipeline, HELD is the only thing between a bad parse and a
// patient's screen — automation releases everything else on its own — so it is
// both the most urgent bucket and the only one that represents a decision
// somebody has to make. NOT_RELEASED comes next: a patient is waiting and
// nothing is wrong, which is a smaller problem than a question nobody has
// answered but is still somebody waiting.
const ACTION_QUEUE_ORDER: QueueState[] = ['HELD', 'NOT_RELEASED', 'AWAITING_PARSE'];

const QUEUE_LABEL: Record<QueueState, string> = {
  HELD: 'Held: needs a decision before the patient sees it',
  NOT_RELEASED: 'Read, not released',
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
