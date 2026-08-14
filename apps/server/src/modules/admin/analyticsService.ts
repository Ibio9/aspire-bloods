import { prisma } from '../../db/client.js';

/**
 * ============================================================================
 *  PRACTICE ANALYTICS — AGGREGATE ONLY, AND DERIVED FROM WHAT IS ALREADY THERE.
 * ============================================================================
 *
 * Five questions a practice can act on: what is ordered, how much is coming
 * through, how long it takes, what comes back out of range, and how many
 * patients there are.
 *
 * ── THE THREE RULES THIS FILE IS BUILT ON ──────────────────────────────────
 *
 * 1. NOTHING NEW IS TRACKED. Every figure is computed from columns the pipeline
 *    already writes — `Report.receivedDate` / `releasedAt` / `status`,
 *    `ReportResult.status`, `Panel`, `User.createdAt`, `User.status`. No event
 *    table, no counter, no analytics column. The same constraint the work queue
 *    runs on, and for the same reason: a second record of what happened is a
 *    second record to drift, and this one would be drifting about the practice's
 *    own numbers.
 *
 * 2. AGGREGATE ONLY, AND SMALL CELLS ARE SUPPRESSED. No row here names a
 *    patient or carries a value. A count is still identifying when it is small
 *    enough — "1 patient had an out-of-range Free T3 in the week of the 4th" is
 *    a sentence about a person on a screen that is not allowed to be about one.
 *    See `SUPPRESS_BELOW`.
 *
 * 3. IT COUNTS RELEASED REPORTS. A report a clinician has not released is not
 *    yet a fact about the practice's output, and counting it would make the
 *    volume figure move backwards whenever somebody sent one back for changes.
 *    The one deliberate exception is `received`, which is the arrival count and
 *    is the whole point of comparing the two.
 */

/**
 * THE SMALL-CELL THRESHOLD.
 *
 * A per-marker or per-panel breakdown with a count of 1 or 2 in it is, on a
 * practice of this size, a pointer at an individual — especially crossed with a
 * week. Anything under this is reported as a suppressed row rather than
 * silently dropped, because a table that quietly omits its own tail reads as
 * complete and is not.
 *
 * 5 is the convention for published health statistics and is what this follows.
 * It is a FLOOR on what is shown, not on what is counted: the totals are exact
 * and only the breakdown is suppressed, so the figures still add up and the
 * suppressed rows are accounted for by name.
 */
export const SUPPRESS_BELOW = 5;

export interface CountedRow {
  key: string;
  label: string;
  count: number;
}

export interface SuppressibleBreakdown {
  rows: CountedRow[];
  /** How many rows fell under the threshold, and how many observations they held between them. */
  suppressedRows: number;
  suppressedCount: number;
}

export interface PeriodPoint {
  /** ISO date of the period's first day. Weeks start on Monday. */
  start: string;
  received: number;
  released: number;
}

export interface AnalyticsWindow {
  /** Inclusive ISO date the window opens on. */
  from: string;
  /** Exclusive ISO date it closes on — "now", to the day. */
  to: string;
  days: number;
}

export interface PracticeAnalytics {
  window: AnalyticsWindow;
  generatedAt: string;
  suppressBelow: number;
  panels: SuppressibleBreakdown;
  markersOutOfRange: SuppressibleBreakdown;
  markerCoverage: { measuredMarkers: number; markersEverReported: number; markersNeverReported: number };
  weekly: PeriodPoint[];
  monthly: PeriodPoint[];
  turnaround: { released: number; medianMs: number | null; worstMs: number | null };
  outOfRange: { results: number; outOfRange: number; ratePerThousand: number | null };
  patients: { registered: number; active: number; withReleasedReport: number };
}

/** Midnight UTC on the Monday of this date's week. */
function weekStart(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // getUTCDay is 0 for Sunday; a Sunday belongs to the week that began six days
  // earlier, not to the one starting tomorrow.
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

/** Midnight UTC on the first of this date's month. */
function monthStart(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/**
 * THE LOWER of the two middles, never their average.
 *
 * The same rule the work queue's turnaround uses, and the same reason: every
 * duration on the screen should be one a real report actually took. An average
 * of two middles is a number no report has ever produced.
 */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Apply the small-cell rule to a counted breakdown, accounting for what it removes. */
function suppress(rows: CountedRow[]): SuppressibleBreakdown {
  const kept = rows.filter((r) => r.count >= SUPPRESS_BELOW).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const dropped = rows.filter((r) => r.count < SUPPRESS_BELOW);
  return {
    rows: kept,
    suppressedRows: dropped.length,
    suppressedCount: dropped.reduce((sum, r) => sum + r.count, 0),
  };
}

/**
 * A window's worth of practice figures.
 *
 * `days` is the only parameter, because every question on this screen is "over
 * what period" and asking it once is what keeps the numbers on one screen
 * comparable with one another.
 */
export async function getPracticeAnalytics(days: number): Promise<PracticeAnalytics> {
  const now = new Date();
  const from = new Date(now.getTime() - days * 86_400_000);

  const [reports, resultRows, patients, activePatients, measuredMarkerCount, markersEverReported] = await Promise.all([
    prisma.report.findMany({
      where: { receivedDate: { gte: from } },
      select: {
        id: true,
        status: true,
        receivedDate: true,
        releasedAt: true,
        voidedAt: true,
        panel: { select: { id: true, name: true } },
      },
    }),
    /**
     * GROUPED IN THE DATABASE, not fetched and counted here. A Signature report
     * is 433 results and a busy quarter is tens of thousands of rows; pulling
     * them into node to run a tally is a query that gets slower every month the
     * practice succeeds.
     */
    prisma.reportResult.groupBy({
      by: ['markerId', 'status'],
      where: { report: { status: 'RELEASED', releasedAt: { gte: from } } },
      _count: { _all: true },
    }),
    prisma.user.count({ where: { role: 'PATIENT' } }),
    prisma.user.count({ where: { role: 'PATIENT', status: 'ACTIVE' } }),
    prisma.marker.count({ where: { resultType: 'MEASURED', isActive: true } }),
    /**
     * MEASURED MARKERS ON BOTH SIDES, and the filter is the whole point.
     *
     * Without it this counted every marker ever reported — including the 207
     * food sensitivities, the genetic indicators and the microbiome panel —
     * and reported **437 ever reported against 171 in the catalogue**, with
     * "never reported" clamped to 0 to stop it printing a negative. Two
     * populations under one heading, and the clamp hiding it.
     *
     * `isActive` is deliberately NOT on this side: a marker retired after
     * being reported on is still a marker the practice has reported on, and
     * excluding it would push the coverage figure back below zero for the
     * opposite reason.
     */
    prisma.reportResult.findMany({
      where: { report: { status: 'RELEASED' }, marker: { resultType: 'MEASURED' } },
      select: { markerId: true },
      distinct: ['markerId'],
    }),
  ]);

  // A patient with at least one released report. Counted through the reports
  // rather than through a flag, because there is no flag and there should not
  // be one — see rule 1.
  const withReleasedReport = (
    await prisma.report.findMany({
      where: { status: 'RELEASED' },
      select: { patientId: true },
      distinct: ['patientId'],
    })
  ).length;

  // Voided reports are excluded from every count below. A voided report is a
  // report the practice has withdrawn, and counting one as output would make
  // the volume figure a record of what was attempted rather than of what was
  // issued.
  const live = reports.filter((r) => r.voidedAt === null);
  const released = live.filter((r) => r.status === 'RELEASED' && r.releasedAt !== null);

  // ── What is ordered ───────────────────────────────────────────────────────
  const panelCounts = new Map<string, CountedRow>();
  for (const r of released) {
    // A report with no catalogue panel behind it is a real thing (manual entry,
    // an ad-hoc draw) and is counted under its own name rather than dropped —
    // a breakdown whose rows do not add to the total is a breakdown nobody can
    // check.
    const key = r.panel?.id ?? '__none';
    const label = r.panel?.name ?? 'No catalogue panel';
    const row = panelCounts.get(key) ?? { key, label, count: 0 };
    row.count += 1;
    panelCounts.set(key, row);
  }

  // ── What comes back out of range ──────────────────────────────────────────
  const markerIds = [...new Set(resultRows.map((r) => r.markerId))];
  const markerNames = new Map(
    (await prisma.marker.findMany({ where: { id: { in: markerIds } }, select: { id: true, name: true } })).map((m) => [
      m.id,
      m.name,
    ]),
  );

  const outOfRangeByMarker = new Map<string, CountedRow>();
  let totalResults = 0;
  let totalOutOfRange = 0;
  for (const row of resultRows) {
    const n = row._count._all;
    totalResults += n;
    // NOT `!== 'IN_RANGE'`. A result with no status was never compared against
    // a range, and counting one as out of range is the same false claim the
    // patient-facing tallies refuse to make (see countable() in shared).
    const out =
      row.status === 'HIGH' ||
      row.status === 'LOW' ||
      row.status === 'SIGNIFICANT_HIGH' ||
      row.status === 'SIGNIFICANT_LOW';
    if (!out) continue;
    totalOutOfRange += n;
    const key = row.markerId;
    const existing = outOfRangeByMarker.get(key) ?? { key, label: markerNames.get(key) ?? 'Unknown marker', count: 0 };
    existing.count += n;
    outOfRangeByMarker.set(key, existing);
  }

  // ── Volume over time ──────────────────────────────────────────────────────
  const bucket = (start: (d: Date) => string): PeriodPoint[] => {
    const points = new Map<string, PeriodPoint>();
    const touch = (key: string): PeriodPoint => {
      const p = points.get(key) ?? { start: key, received: 0, released: 0 };
      points.set(key, p);
      return p;
    };
    for (const r of live) touch(start(r.receivedDate)).received += 1;
    for (const r of released) touch(start(r.releasedAt!)).released += 1;
    return [...points.values()].sort((a, b) => a.start.localeCompare(b.start));
  };

  // ── Turnaround ────────────────────────────────────────────────────────────
  // Arrival to release, which is the figure the practice is accountable for —
  // not parse-to-release, which measures how fast a clinician cleared a queue
  // they did not choose the length of.
  const durations = released
    .map((r) => r.releasedAt!.getTime() - r.receivedDate.getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= 0);

  return {
    window: { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10), days },
    generatedAt: now.toISOString(),
    suppressBelow: SUPPRESS_BELOW,
    panels: suppress([...panelCounts.values()]),
    markersOutOfRange: suppress([...outOfRangeByMarker.values()]),
    markerCoverage: {
      measuredMarkers: measuredMarkerCount,
      markersEverReported: markersEverReported.length,
      // Can go negative on a catalogue that has retired a marker somebody was
      // once reported on, which is a real state and not a bug — clamped,
      // because "-3 markers never reported" is a figure nobody can act on.
      markersNeverReported: Math.max(0, measuredMarkerCount - markersEverReported.length),
    },
    weekly: bucket(weekStart),
    monthly: bucket(monthStart),
    turnaround: {
      released: released.length,
      medianMs: median(durations),
      worstMs: durations.length > 0 ? Math.max(...durations) : null,
    },
    outOfRange: {
      results: totalResults,
      outOfRange: totalOutOfRange,
      // PER THOUSAND rather than a percentage to one decimal place: a rate of
      // "2.4%" invites a comparison with last month's "2.3%" that the sample
      // size does not support, and an integer per mille is honest about its own
      // precision.
      ratePerThousand: totalResults > 0 ? Math.round((totalOutOfRange / totalResults) * 1000) : null,
    },
    patients: { registered: patients, active: activePatients, withReleasedReport },
  };
}

/**
 * THE SAME NUMBERS AS CSV, and it is the same object rather than a second
 * query.
 *
 * Raheel wants this in a spreadsheet, and a spreadsheet that disagrees with the
 * screen is worse than no spreadsheet — so the export is a RENDERING of
 * `PracticeAnalytics`, taken from one call, and cannot report a different
 * figure from the one somebody is looking at.
 *
 * ONE FILE, SEVERAL SECTIONS. A blank line and a new header row between them:
 * every spreadsheet in existence reads that as separate tables, and the
 * alternative is either seven downloads or one table whose columns mean
 * different things on different rows.
 *
 * Suppressed rows are stated IN the file, not omitted from it — the same rule
 * as the screen.
 */
export function analyticsToCsv(a: PracticeAnalytics): string {
  const lines: string[] = [];
  // Quote everything and double any internal quote. A marker called
  // `Microalbumin/Creatinine Ratio` is fine unquoted and `Cabbage (Savoy/White)
  // (IgG)` is not, and deciding per cell is how a CSV ends up with one broken
  // row nobody notices until the totals are wrong.
  const row = (...cells: (string | number | null)[]) =>
    lines.push(cells.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));

  row('Aspire Clinic — practice analytics');
  row('Window', `${a.window.from} to ${a.window.to}`, `${a.window.days} days`);
  row('Generated', a.generatedAt);
  row('Small-cell suppression', `rows under ${a.suppressBelow} are withheld`);
  lines.push('');

  row('Patients');
  row('Registered', a.patients.registered);
  row('Active', a.patients.active);
  row('With at least one released report', a.patients.withReleasedReport);
  lines.push('');

  row('Turnaround (arrival to release)');
  row('Reports released in window', a.turnaround.released);
  row('Median hours', a.turnaround.medianMs === null ? '' : (a.turnaround.medianMs / 3_600_000).toFixed(1));
  row('Worst hours', a.turnaround.worstMs === null ? '' : (a.turnaround.worstMs / 3_600_000).toFixed(1));
  lines.push('');

  row('Out of range');
  row('Results on released reports', a.outOfRange.results);
  row('Outside the reference range', a.outOfRange.outOfRange);
  row('Rate per 1,000 results', a.outOfRange.ratePerThousand ?? '');
  lines.push('');

  row('Panels ordered');
  row('Panel', 'Reports released');
  for (const r of a.panels.rows) row(r.label, r.count);
  if (a.panels.suppressedRows > 0) {
    row(`${a.panels.suppressedRows} panels withheld (under ${a.suppressBelow})`, a.panels.suppressedCount);
  }
  lines.push('');

  row('Markers most often outside the reference range');
  row('Marker', 'Out-of-range results');
  for (const r of a.markersOutOfRange.rows) row(r.label, r.count);
  if (a.markersOutOfRange.suppressedRows > 0) {
    row(
      `${a.markersOutOfRange.suppressedRows} markers withheld (under ${a.suppressBelow})`,
      a.markersOutOfRange.suppressedCount,
    );
  }
  lines.push('');

  row('Catalogue coverage');
  row('Measured markers in the catalogue', a.markerCoverage.measuredMarkers);
  row('Ever reported on a released report', a.markerCoverage.markersEverReported);
  row('Never reported', a.markerCoverage.markersNeverReported);
  lines.push('');

  row('Weekly volume');
  row('Week beginning', 'Received', 'Released');
  for (const p of a.weekly) row(p.start, p.received, p.released);
  lines.push('');

  row('Monthly volume');
  row('Month beginning', 'Received', 'Released');
  for (const p of a.monthly) row(p.start, p.received, p.released);

  // CRLF: Excel on Windows is what this is opened in, and a bare LF makes it
  // one long row in older versions.
  return lines.join('\r\n');
}
