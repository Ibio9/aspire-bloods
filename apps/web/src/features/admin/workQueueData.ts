import type { QueueState } from '../../lib/reportStatus';

/**
 * THE WORK QUEUE PAYLOAD AND THE THREE HELPERS THAT READ IT.
 *
 * It all lived in `WorkQueuePage.tsx` when the queue was a screen. It is two
 * screens now — the Overview's work list and Settings' backup section — so the
 * types and the formatters are here rather than exported from one page into
 * another, which is how a page becomes a library nobody meant to write.
 */

export interface QueuedReport {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  state: QueueState | 'RELEASED';
  status: string;
  holdReasons: string[];
  inStateSince: string | null;
  inStateMs: number | null;
  sampleDate: string;
  receivedDate: string;
}

export interface BackupStatus {
  neverRun: boolean;
  lastSuccessAt: string | null;
  hoursSinceSuccess: number | null;
  overdue: boolean;
  overdueAfterHours: number;
  lastRun: {
    startedAt: string;
    finishedAt: string | null;
    outcome: 'SUCCEEDED' | 'FAILED';
    objectKey: string | null;
    failureStage: string | null;
    errorMessage: string | null;
  } | null;
}

export interface WorkQueue {
  backup: BackupStatus;
  buckets: {
    state: QueueState | 'RELEASED';
    count: number;
    oldest: { reportId: string; inStateSince: string | null; inStateMs: number | null } | null;
  }[];
  reports: QueuedReport[];
  turnaround: {
    sampleSize: number;
    medianMs: number | null;
    worstMs: number | null;
    worstReportId: string | null;
    windowDays: number;
  };
  exceptions: { heldReports: number; unmappedAnalytes: number; unplacedResults: number };
  generatedAt: string;
}

export const STATE_LABEL: Record<string, string> = {
  HELD: 'Held',
  NOT_RELEASED: 'Read, not released',
  AWAITING_PARSE: 'Results not read yet',
  RELEASED: 'Released',
};

/**
 * How long is too long, said as a weight rather than as a colour.
 *
 * Deliberately NOT a traffic-light: red, amber and green mean a clinical
 * finding everywhere else in this product, and reusing them for "this report is
 * old" would make the vocabulary mean two things. An overdue row is set in the
 * full text colour with its duration in medium weight; everything else is
 * quieter. The sort order is what actually carries urgency.
 */
export const OVERDUE_MS = 48 * 3_600_000;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE SPACE BETWEEN A NUMBER AND ITS UNIT (Aug 2026).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `36 h ago` was set with an ordinary space, and at the 2xl step that is about
 * 9px of nothing between a figure and the letter that gives it meaning — so it
 * read as three separate things rather than as one measurement. The complaint
 * was raised against the backup headline and it was true of every duration in
 * the console, because they all come out of two formatters.
 *
 * U+202F NARROW NO-BREAK SPACE is the character for exactly this. About a third
 * the width of a word space, and being no-break it cannot leave "36" at the end
 * of one line with "h" at the start of the next — which an ordinary space
 * permits and which is worse than the gap it fixes.
 *
 * ⚠ WRITTEN AS AN ESCAPE, NOT AS THE CHARACTER. ESLint's
 * `no-irregular-whitespace` refuses a literal U+202F in source, and it is right
 * to: a whitespace character nobody can see is a whitespace character nobody
 * can review. One named constant, interpolated, so the intent is legible at
 * every call site.
 */
export const UNIT = '\u202f';

/**
 * A duration in the largest unit that still says something useful.
 *
 * Days and hours, never "2.4 days": a queue is read at a glance and a decimal
 * in a duration is a number to parse rather than a fact to act on. Under an
 * hour reads in minutes, because on the day a report lands that is the
 * difference between "just arrived" and "sat there all morning".
 *
 * ── THE UNIT IS NOT A SEPARATE WORD (Aug 2026) ────────────────────────────
 *
 * It was `${hours} h` — a space between the number and its unit, so "36 h" read
 * as two things rather than as one measurement, and at the 2xl step the gap was
 * about 9px of nothing between a figure and the letter that gives it meaning.
 * A NARROW NO-BREAK SPACE (U+202F) instead: it is the typographic space for
 * exactly this, it is about a third the width, and being no-break it cannot
 * leave "36" at the end of one line and "h" at the start of the next. Every
 * unit in the console goes through a formatter that uses it — see
 * `formatDuration` in AnalyticsPage.tsx, which carries the same character.
 */
export function formatDuration(ms: number | null): string {
  // An EN dash, not an em dash. House style refuses the em dash in anything a
  // reader sees. The en dash is the conventional nil glyph in a table of
  // figures and is the same character a numeric range keeps.
  if (ms == null) return '–';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}${UNIT}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}${UNIT}h`;
  return `${Math.floor(hours / 24)}${UNIT}d`;
}

/**
 * "3h ago" — a relative REQUEST age, which is a different question from
 * `formatDuration`'s "how long has this been in this state", and the two read
 * differently on purpose.
 */
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}${UNIT}min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}${UNIT}h ago`;
  return `${Math.round(hours / 24)}${UNIT}d ago`;
}
