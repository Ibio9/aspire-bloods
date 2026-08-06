export type ReportStatus = 'UPLOADED' | 'PARSED' | 'ADMIN_VERIFIED' | 'CHANGES_REQUESTED' | 'CLINICIAN_REVIEWED' | 'RELEASED';

/** The five stages of the release pipeline (brief: "make the release pipeline obvious"). */
export const PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: 'UPLOADED', label: 'Uploaded' },
  { key: 'PARSED', label: 'Parsed' },
  { key: 'ADMIN_VERIFIED', label: 'Verified' },
  { key: 'CLINICIAN_REVIEWED', label: 'Reviewed' },
  { key: 'RELEASED', label: 'Released' },
];

/** CHANGES_REQUESTED sits at the same position as PARSED — it's a step back to re-verify, not a sixth stage. */
export function stageIndex(status: ReportStatus): number {
  switch (status) {
    case 'UPLOADED':
      return 0;
    case 'PARSED':
    case 'CHANGES_REQUESTED':
      return 1;
    case 'ADMIN_VERIFIED':
      return 2;
    case 'CLINICIAN_REVIEWED':
      return 3;
    case 'RELEASED':
      return 4;
  }
}

/** What's blocking this report, in plain language — shown next to the progress indicator and used to sort the admin's action queue. */
export function whatsNext(status: ReportStatus): string {
  switch (status) {
    case 'UPLOADED':
      return 'Needs parsing: extract the results from the PDF.';
    case 'PARSED':
      return 'Needs verification: check the extracted values before they go further.';
    case 'CHANGES_REQUESTED':
      return 'Changes requested: needs correcting and re-verifying.';
    case 'ADMIN_VERIFIED':
      return 'Needs clinician review.';
    case 'CLINICIAN_REVIEWED':
      return 'Ready to release to the patient.';
    case 'RELEASED':
      return 'Visible to the patient.';
  }
}

/** Short label for compact contexts (list rows, badges) — human words, not the raw enum. */
export function statusLabel(status: ReportStatus): string {
  switch (status) {
    case 'UPLOADED':
      return 'Uploaded';
    case 'PARSED':
      return 'Parsed';
    case 'ADMIN_VERIFIED':
      return 'Verified';
    case 'CHANGES_REQUESTED':
      return 'Changes requested';
    case 'CLINICIAN_REVIEWED':
      return 'Reviewed';
    case 'RELEASED':
      return 'Released';
  }
}

// Ordered with the most time-sensitive bucket first: reports already
// through clinical review are the ones a patient has been waiting on
// longest, so they lead the admin's "awaiting action" queue.
const ACTION_QUEUE_ORDER: ReportStatus[] = ['CLINICIAN_REVIEWED', 'ADMIN_VERIFIED', 'CHANGES_REQUESTED', 'PARSED', 'UPLOADED'];

export interface AwaitingActionReport {
  id: string;
  status: string;
  voidedAt: string | null;
}

export interface AwaitingActionBucket {
  status: ReportStatus;
  label: string;
  count: number;
  reportIds: string[];
}

/** Groups open (non-released, non-voided) reports by what's blocking them, sorted most time-sensitive first. */
export function bucketAwaitingAction<T extends AwaitingActionReport>(reports: T[]): AwaitingActionBucket[] {
  const open = reports.filter((r) => !r.voidedAt && r.status !== 'RELEASED');
  return ACTION_QUEUE_ORDER.map((status) => {
    const matches = open.filter((r) => r.status === status);
    return { status, label: whatsNext(status), count: matches.length, reportIds: matches.map((r) => r.id) };
  }).filter((b) => b.count > 0);
}
