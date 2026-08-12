import { prisma } from '../../db/client.js';
import { queueState, type ReportQueueState } from '../../lib/reportTransitions.js';

/**
 * ============================================================================
 *  THE CLINICIAN WORK QUEUE.
 * ============================================================================
 *
 * With the admin verification stage gone there is one human gate left, and the
 * question that matters is no longer "who has verified what" but the two the
 * console could not answer at all: WHAT IS WAITING FOR A CLINICIAN, and WHAT IS
 * STUCK.
 *
 * NOTHING HERE IS NEW TRACKING, and that is a constraint rather than an
 * accident. Every figure below is derived from state already on the report or
 * from audit entries already written by the pipeline:
 *
 *   · the report's own status and holdReasons     → which bucket it is in
 *   · receivedDate / heldAt / reviewedAt / releasedAt → how long it has sat
 *   · REPORT_PARSED / REPORT_VERIFIED / REPORT_CHANGES_REQUESTED audit entries
 *                                                 → when it entered a state
 *                                                   that has no column of its own
 *
 * Adding a `stateChangedAt` column would have been easier to query and is
 * exactly the thing not to do: a second record of when something happened is a
 * second record to drift, and the audit log is the one the practice is
 * accountable to.
 *
 * WHY TIME-IN-STATE NEEDS THE AUDIT LOG AT ALL. Three of the four states have a
 * timestamp on the report — UPLOADED has receivedDate, HELD has heldAt,
 * AWAITING_RELEASE has reviewedAt. AWAITING_REVIEW does not: a report becomes
 * "parsed with nothing held" through parse, through re-parse, through a
 * correction that cleared the last hold, or through a re-ingest, and none of
 * those writes a column. `updatedAt` is not that timestamp either — it moves
 * when anything at all on the row changes. So the entry time comes from the
 * latest of that report's own REPORT_PARSED / REPORT_VERIFIED entries, which is
 * precisely what the audit log is a record of.
 */

/** A report on the queue, with the one number the list is sorted by. */
export interface QueuedReport {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  state: ReportQueueState;
  status: string;
  holdReasons: string[];
  /** When it entered its current state. Null only if nothing in the record says. */
  inStateSince: string | null;
  /** Milliseconds in the current state, or null where `inStateSince` is. */
  inStateMs: number | null;
  sampleDate: string;
  receivedDate: string;
}

export interface QueueBucket {
  state: ReportQueueState;
  count: number;
  /** The oldest item in this bucket, which is the one the bucket is really about. */
  oldest: { reportId: string; inStateSince: string | null; inStateMs: number | null } | null;
}

export interface TurnaroundStats {
  /** How many released reports the figures are computed over. */
  sampleSize: number;
  /** Arrival to release, in milliseconds. Null when nothing was released in the window. */
  medianMs: number | null;
  worstMs: number | null;
  /** The report behind the worst figure, so it can be opened rather than just counted. */
  worstReportId: string | null;
  windowDays: number;
}

export interface ExceptionCounts {
  /** Reports held by the clean-parse assessment — the parse exception queue. */
  heldReports: number;
  /** Analyte spellings no marker answered to, still unresolved. */
  unmappedAnalytes: number;
  /** Results that arrived but could not be attached to a patient. */
  unplacedResults: number;
}

export interface WorkQueue {
  buckets: QueueBucket[];
  reports: QueuedReport[];
  turnaround: TurnaroundStats;
  exceptions: ExceptionCounts;
  generatedAt: string;
}

/** The window the turnaround figures are computed over. */
const TURNAROUND_WINDOW_DAYS = 30;

/**
 * The order the buckets are presented in — what a clinician should look at
 * first. HELD leads, for the reason recorded in lib/reportTransitions.ts: it is
 * now the only thing standing between a bad parse and a clinician's screen.
 */
const BUCKET_ORDER: ReportQueueState[] = ['HELD', 'AWAITING_RELEASE', 'AWAITING_REVIEW', 'AWAITING_PARSE'];

/**
 * The median of a sorted list, taking the LOWER of the two middles on an even
 * count rather than averaging them.
 *
 * Averaging would report a turnaround nobody experienced, which for a practice
 * of this size (single-figure releases in a week is normal) is a real
 * possibility rather than a pedantic one. Every figure on this screen should be
 * a duration that actually happened.
 */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function titleFor(report: { panel: { name: string } | null; sampleDate: Date }): string {
  return report.panel?.name ?? 'Individual markers';
}

export async function getWorkQueue(now = new Date()): Promise<WorkQueue> {
  const windowStart = new Date(now.getTime() - TURNAROUND_WINDOW_DAYS * 86_400_000);

  // Open work and the recent release history, in two reads rather than one
  // over-fetching read: the queue needs every open report and none of the
  // released ones, and the turnaround needs the opposite.
  const [open, released, unmappedAnalytes, unplacedResults] = await Promise.all([
    prisma.report.findMany({
      where: { voidedAt: null, status: { not: 'RELEASED' } },
      include: {
        panel: { select: { name: true } },
        patient: { select: { id: true, patientProfile: { select: { firstName: true, lastName: true } } } },
      },
    }),
    prisma.report.findMany({
      where: { voidedAt: null, status: 'RELEASED', releasedAt: { gte: windowStart } },
      select: { id: true, receivedDate: true, releasedAt: true },
    }),
    // The analyte exception queue, counted from the observations table rather
    // than recomputed: an UNMAPPED observation that has since been given an
    // admin mapping is stamped RESOLVED, so this is what is actually still open.
    prisma.randoxAnalyteObservation.count({ where: { status: 'UNMAPPED' } }),
    prisma.unmatchedResult.count({ where: { status: 'PENDING' } }),
  ]);

  // When each open report entered a state that has no column of its own. One
  // query for all of them — the alternative is a query per row, and this list
  // is a work queue that gets opened every morning.
  const entryEntries = await prisma.auditLogEntry.findMany({
    where: {
      targetType: 'Report',
      targetId: { in: open.map((r) => r.id) },
      action: { in: ['REPORT_PARSED', 'REPORT_VERIFIED', 'REPORT_CHANGES_REQUESTED'] },
    },
    select: { targetId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const latestEntryFor = new Map<string, Date>();
  for (const entry of entryEntries) {
    // Descending, so the first sighting of an id is its latest entry.
    if (entry.targetId && !latestEntryFor.has(entry.targetId)) latestEntryFor.set(entry.targetId, entry.createdAt);
  }

  const reports: QueuedReport[] = open.map((report) => {
    const state = queueState({ status: report.status, holdReasons: report.holdReasons });
    // Per state, the most specific record of when it got there. Falls back to
    // receivedDate rather than to null: a report that has been in the building
    // since Tuesday has been waiting since Tuesday whatever else is missing,
    // and that is a floor on the answer rather than a guess at it.
    const since =
      state === 'AWAITING_PARSE'
        ? report.receivedDate
        : state === 'AWAITING_RELEASE'
          ? (report.reviewedAt ?? report.receivedDate)
          : state === 'HELD'
            ? (report.heldAt ?? latestEntryFor.get(report.id) ?? report.receivedDate)
            : (latestEntryFor.get(report.id) ?? report.receivedDate);
    const profile = report.patient.patientProfile;
    return {
      id: report.id,
      patientId: report.patient.id,
      patientName: profile ? `${profile.firstName} ${profile.lastName}` : '(pending activation)',
      title: titleFor(report),
      state,
      status: report.status,
      holdReasons: report.holdReasons,
      inStateSince: since.toISOString(),
      inStateMs: Math.max(0, now.getTime() - since.getTime()),
      sampleDate: report.sampleDate.toISOString(),
      receivedDate: report.receivedDate.toISOString(),
    };
  });

  // OLDEST FIRST, ACROSS THE WHOLE LIST — this is what makes it a work list
  // rather than a dashboard. Bucketing is how it is READ; the order is how long
  // a patient has been waiting.
  reports.sort((a, b) => (b.inStateMs ?? 0) - (a.inStateMs ?? 0));

  const buckets: QueueBucket[] = BUCKET_ORDER.map((state) => {
    const inState = reports.filter((r) => r.state === state);
    const oldest = inState[0] ?? null;
    return {
      state,
      count: inState.length,
      oldest: oldest ? { reportId: oldest.id, inStateSince: oldest.inStateSince, inStateMs: oldest.inStateMs } : null,
    };
  });

  const durations = released
    .filter((r) => r.releasedAt)
    .map((r) => ({ id: r.id, ms: r.releasedAt!.getTime() - r.receivedDate.getTime() }))
    // A negative duration is a backdated receivedDate on seeded or migrated
    // data, not a report released before it arrived. Excluded rather than
    // clamped: a zero in a median is a claim that something took no time.
    .filter((d) => d.ms >= 0)
    .sort((a, b) => a.ms - b.ms);
  const worst = durations[durations.length - 1] ?? null;

  return {
    buckets,
    reports,
    turnaround: {
      sampleSize: durations.length,
      medianMs: median(durations.map((d) => d.ms)),
      worstMs: worst?.ms ?? null,
      worstReportId: worst?.id ?? null,
      windowDays: TURNAROUND_WINDOW_DAYS,
    },
    exceptions: {
      heldReports: reports.filter((r) => r.holdReasons.length > 0).length,
      unmappedAnalytes,
      unplacedResults,
    },
    generatedAt: now.toISOString(),
  };
}
