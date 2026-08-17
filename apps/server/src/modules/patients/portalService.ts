import { prisma } from '../../db/client.js';
import { decryptField } from '../../lib/crypto.js';
import { decodeResultValue } from '../../lib/resultValue.js';
import { convertToDisplayUnit, hasKnownConversion } from '../../lib/unitConversion.js';
import { optimalContextForPatient, optimalFor } from '../../lib/optimalRange.js';
import { classifyMovement, isMeaningfulChange, movementMagnitude } from './markerMovement.js';
import { formatReportTitle, hasResultValue, type MarkerStatus } from '@aspire-bloods/shared';

export type { MarkerMovement } from './markerMovement.js';

/**
 * Read models for the patient portal's cross-report screens (Overview, All
 * markers, Trends, Library, Documents). Everything here answers a question
 * the per-report endpoints in ./service.ts structurally can't — "how is my
 * vitamin D doing" spans reports, so it can't be served by a report-scoped
 * query.
 *
 * Two rules hold throughout, same as ./service.ts:
 *  - Only RELEASED, non-voided reports are ever visible. Voiding is a state
 *    change, not a delete, so the filter is explicit on every query.
 *  - Values are normalised to the marker's own default unit through the
 *    named-conversion registry, never coerced. A series that needs a
 *    conversion we don't have is marked not-comparable rather than guessed.
 *
 * NO `sourceLabel` ANYWHERE IN THIS FILE, and it is not merely unused (Aug
 * 2026). "Analysed by Randox Health" was removed from every patient-facing
 * render months ago and the field went on being computed and sent on six
 * payloads — a string one autocomplete away from being printed again, on the
 * screens it was specifically taken off. It is deleted from the DTOs, the way
 * `nextSteps` was deleted with the Overview section that rendered it.
 *
 * The clinician console still shows provenance and still should: on a card
 * beside somebody's own result the laboratory's name says something about the
 * practice's commercial arrangements and nothing about the number, and in the
 * console it says which feed a row came from. It is computed for the ADMIN read
 * models (patients/service.ts, reports/service.ts) and for the GP handover PDF,
 * where a reference interval being assay-specific makes it load-bearing.
 */

/** One released result, decrypted and normalised to its marker's display unit. */
interface NormalisedPoint {
  markerId: string;
  markerKey: string;
  markerName: string;
  /** See the ResultType enum. Only MEASURED points belong in a trend or a count. */
  resultType: string;
  /** Abbreviations and alternate spellings, so search finds "ALT" as well as "Alanine Aminotransferase". */
  aliases: string[];
  /** Health areas this marker belongs to, for the category filter. */
  categoryKeys: string[];
  displayUnit: string;
  reportId: string;
  /** Null on an ad-hoc report with no catalogue panel — use reportTitle to label it. */
  panelName: string | null;
  reportTitle: string;
  sampleDate: string;
  /** Null when the lab reported text rather than a number — see valueText. */
  value: number | null;
  /** The verbatim lab text ("< 0.6", "Not detected"); null for numeric results. */
  valueText: string | null;
  unit: string;
  converted: boolean;
  originalValue: number | null;
  originalUnit: string;
  /**
   * Null when this result has no position on its reference range. Null is not
   * a state — it is the absence of a comparison, and it must never be counted
   * as in range, listed as needing attention, tinted, or plotted.
   */
  status: MarkerStatus | null;
  referenceLow: number;
  referenceHigh: number;
  /**
   * How far past a reference bound this marker has to sit before it counts as
   * significantly out, in display units. Sent because the portal draws it —
   * the sparkline's and trend chart's yellow bands end and their red bands
   * begin exactly here. See severityThreshold in ./service.ts.
   */
  severityThreshold: number;
  amendedAt: Date | null;
  /** False when this point needed a conversion the registry doesn't define. */
  convertible: boolean;
}

/**
 * Every released result the patient has, oldest first, normalised. One query
 * for the whole portal — the screens below all slice the same array rather
 * than each re-reading (and re-decrypting) the result table.
 */
async function loadReleasedPoints(patientId: string): Promise<NormalisedPoint[]> {
  // `select`, not `include`, and the difference is not stylistic.
  //
  // The previous shape was `include: { marker: { include: { categories: {
  // include: { category: true } } } } }`, which materialises a full
  // MarkerCategory row — name, resultType, sortOrder and the `note` prose —
  // once per membership per result. On a patient with four panels behind them
  // that is several thousand redundant category objects, and it measured at
  // 679ms against 208ms for the same query with categories dropped entirely.
  //
  // Only the key is ever read from those rows. Asking for only the key brings
  // it back to 234ms — near the cost of not joining at all — and this query is
  // the whole of what Overview and All markers spend their time on, so it is
  // most of half a second off the patient's landing screen.
  const results = await prisma.reportResult.findMany({
    where: { report: { patientId, status: 'RELEASED', voidedAt: null } },
    select: {
      markerId: true,
      reportId: true,
      valueEncrypted: true,
      unit: true,
      status: true,
      amendedAt: true,
      marker: {
        select: {
          key: true,
          name: true,
          defaultUnit: true,
          resultType: true,
          aliases: true,
          severityMultiplier: true,
          severityAbsoluteDelta: true,
          categories: { select: { category: { select: { key: true } } } },
        },
      },
      referenceRange: { select: { low: true, high: true, unit: true } },
      report: {
        select: {
          sampleDate: true,
          panel: { select: { name: true } },
          source: { select: { key: true, name: true } },
        },
      },
    },
    orderBy: [{ report: { sampleDate: 'asc' } }, { createdAt: 'asc' }],
  });

  return results
    // Nothing measured, nothing to normalise, nothing to show. Dropped once,
    // here, so every screen this array feeds — Overview, the marker list, the
    // comparison chart, the sparklines — inherits the rule rather than each
    // one having to remember it. See the same filter in ./service.ts.
    .filter((r) => hasResultValue(decodeResultValue(decryptField(r.valueEncrypted))))
    .map((r) => {
    const displayUnit = r.marker.defaultUnit;
    const decoded = decodeResultValue(decryptField(r.valueEncrypted));
    // Textual results ("< 0.6", "Not detected") have nothing to convert;
    // they carry their text through and never join a numeric comparison.
    const valueConversion =
      decoded.value !== null ? convertToDisplayUnit(r.marker.key, decoded.value, r.unit, displayUnit) : null;
    const low = convertToDisplayUnit(r.marker.key, r.referenceRange.low, r.referenceRange.unit, displayUnit);
    const high = convertToDisplayUnit(r.marker.key, r.referenceRange.high, r.referenceRange.unit, displayUnit);

    // Asked of the conversion registry, not of a raw string compare — see the
    // same note in ./service.ts. "mmol/l" and "mmol/L" are one unit.
    const valueOk = decoded.value === null || hasKnownConversion(r.marker.key, r.unit, displayUnit);
    const rangeOk = hasKnownConversion(r.marker.key, r.referenceRange.unit, displayUnit);

    return {
      markerId: r.markerId,
      markerKey: r.marker.key,
      markerName: r.marker.name,
      resultType: r.marker.resultType,
      aliases: r.marker.aliases,
      categoryKeys: r.marker.categories.map((m) => m.category.key),
      displayUnit,
      reportId: r.reportId,
      panelName: r.report.panel?.name ?? null,
      // A report needn't come from a catalogue panel; fall back to what it contains.
      reportTitle: formatReportTitle(r.report.panel?.name, null, r.report.sampleDate),
      sampleDate: r.report.sampleDate.toISOString().slice(0, 10),
      value: valueConversion ? round(valueConversion.value) : null,
      valueText: decoded.valueText,
      unit: valueConversion ? valueConversion.unit : r.unit,
      converted: valueConversion?.converted ?? false,
      originalValue: valueConversion ? valueConversion.originalValue : null,
      originalUnit: valueConversion ? valueConversion.originalUnit : r.unit,
      status: r.status,
      referenceLow: round(low.value),
      referenceHigh: round(high.value),
      severityThreshold: round(
        r.marker.severityAbsoluteDelta ?? (high.value - low.value) * r.marker.severityMultiplier,
      ),
      amendedAt: r.amendedAt,
      convertible: valueOk && rangeOk,
    };
    });
}

/** Converted values carry float noise (18.0182 factors); nobody wants to read 4.400000000000001. */
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/** How long after a sample we start suggesting a retest. Annual is the private-screening norm. */
const RETEST_INTERVAL_MONTHS = 12;

export async function getPatientOverview(patientId: string) {
  const [profile, points, allReports] = await Promise.all([
    prisma.patientProfile.findUnique({ where: { userId: patientId }, select: { firstName: true } }),
    loadReleasedPoints(patientId),
    prisma.report.findMany({
      where: { patientId, voidedAt: null },
      include: { panel: true, source: true },
      orderBy: { sampleDate: 'desc' },
    }),
  ]);

  const releasedReports = allReports.filter((r) => r.status === 'RELEASED');
  const pendingReports = allReports.filter((r) => r.status !== 'RELEASED');
  const latestReport = releasedReports[0] ?? null;

  const latestPoints = latestReport ? points.filter((p) => p.reportId === latestReport.id) : [];
  // Both counted from what they are. A result with no status is neither in
  // range nor needing attention, and the summary line below must not reach it
  // by subtracting one from the total.
  const attentionPoints = latestPoints.filter((p) => p.status !== null && p.status !== 'IN_RANGE');
  const inRangePoints = latestPoints.filter((p) => p.status === 'IN_RANGE');

  // Anything out of range at all — including on an older report whose marker
  // wasn't repeated in the latest one. A flagged result doesn't stop mattering
  // because the next panel didn't happen to include that marker.
  const latestByMarker = new Map<string, NormalisedPoint>();
  for (const p of points) latestByMarker.set(p.markerId, p); // points are oldest-first, so this lands on the newest

  const attention = [...latestByMarker.values()]
    .filter((p) => p.status !== null && p.status !== 'IN_RANGE')
    .sort((a, b) => (a.sampleDate < b.sampleDate ? 1 : -1))
    .map((p) => ({
      markerId: p.markerId,
      name: p.markerName,
      value: p.value,
      unit: p.unit,
      status: p.status,
      referenceLow: p.referenceLow,
      referenceHigh: p.referenceHigh,
      severityThreshold: p.severityThreshold,
      reportId: p.reportId,
      // Both, because they answer different questions. panelName is null on an
      // ad-hoc report with no catalogue panel behind it (panels are optional),
      // so a caller that prints it raw prints nothing; reportTitle is the
      // composed, always-present house title — see formatReportTitle.
      panelName: p.panelName,
      reportTitle: p.reportTitle,
      sampleDate: p.sampleDate,
      /** True when this came from an earlier report than the most recent one. */
      fromEarlierReport: latestReport ? p.reportId !== latestReport.id : false,
    }));

  // What's changed — each marker in the latest report against that marker's
  // own previous result, whichever report it came from. Improvements and
  // declines are both reported; the caller decides how to phrase them.
  // One index rather than a full scan per marker. This used to be
  // `points.filter(...)` inside a map over the latest report's markers — for a
  // 436-marker Signature panel against several years of history that is a
  // sweep of every result the patient has ever had, 436 times over, each one
  // allocating an array it throws away. `points` is already oldest-first, so
  // the last entry strictly before the current sample date is the previous
  // result, whichever report it came from.
  const historyByMarker = new Map<string, NormalisedPoint[]>();
  for (const p of points) {
    const list = historyByMarker.get(p.markerId);
    if (list) list.push(p);
    else historyByMarker.set(p.markerId, [p]);
  }

  const changes = latestPoints
    .map((current) => {
      const series = historyByMarker.get(current.markerId) ?? [];
      let previous: NormalisedPoint | undefined;
      for (const p of series) {
        if (p.sampleDate < current.sampleDate) previous = p;
        else break; // oldest-first, so nothing after this point qualifies either
      }
      if (!previous) return null;
      if (!current.convertible || !previous.convertible) return null; // never compare across units we can't relate
      // A textual result ("< 0.6") has no magnitude — nothing to compare.
      if (current.value === null || previous.value === null) return null;
      // And a result with no status has no side of the range to have moved
      // toward or away from. "Moved into the usual range" about a comparison
      // that was never made is a sentence with no fact under it.
      if (current.status === null || previous.status === null) return null;
      const cur = { value: current.value, status: current.status, referenceLow: current.referenceLow, referenceHigh: current.referenceHigh };
      const prev = { value: previous.value, status: previous.status, referenceLow: previous.referenceLow, referenceHigh: previous.referenceHigh };
      if (!isMeaningfulChange(cur, prev)) return null;

      const delta = current.value - previous.value;

      // Magnitude rides alongside rather than inside the payload — it exists
      // only to order the list and means nothing to the client.
      return {
        magnitude: movementMagnitude(cur, prev),
        change: {
          markerId: current.markerId,
          name: current.markerName,
          unit: current.unit,
          currentValue: current.value,
          currentStatus: current.status,
          currentDate: current.sampleDate,
          previousValue: previous.value,
          previousStatus: previous.status,
          previousDate: previous.sampleDate,
          delta: round(delta),
          direction: delta > 0 ? ('UP' as const) : ('DOWN' as const),
          movement: classifyMovement(cur, prev),
        },
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    // Biggest mover first, in reference-band widths so markers on wildly
    // different scales sort against each other honestly. This used to divide
    // by the current value instead of the band, which ranked any marker with
    // a small absolute value above everything else regardless of whether it
    // had actually moved much for that marker.
    .sort((a, b) => b.magnitude - a.magnitude)
    .map((c) => c.change);

  const lastSampleDate = latestReport?.sampleDate ?? null;
  const retestDueDate = lastSampleDate
    ? new Date(new Date(lastSampleDate).setMonth(new Date(lastSampleDate).getMonth() + RETEST_INTERVAL_MONTHS))
    : null;

  /**
   * ── "NEXT STEPS" AND `outOfRangeNotice` ARE BOTH GONE FROM THIS PAYLOAD ──
   *
   * `nextSteps` was three cards, and the load-bearing one was titled "Worth a
   * conversation" and said in a paragraph what the SECTION of that name says
   * with the reader's actual results in it. The other two were a "results are
   * on their way" notice, which the empty state and the reports list both
   * carry, and a retest prompt, which is a booking affordance on a portal whose
   * booking flow is deliberately off.
   *
   * `outOfRangeNotice` was the seeded `out_of_range_prompt` block, rendered on
   * the Overview in a card below the list — where its opening sentence restated
   * the count line above it and the contact details under it were the third
   * copy of the same four lines on one screen. The framing it carried moved
   * into the section as two sentences and, in Aug 2026, came off the Overview
   * altogether — see the note where `ATTENTION_FRAMING` used to be in
   * PatientOverview.tsx.
   *
   * THE COPY BLOCK ITSELF IS UNTOUCHED and is still read, in full, by the two
   * surfaces where nothing else on the page says it — the marker detail page
   * (patients/service.ts) and the "Next steps" block of both PDFs
   * (export/pdfSummary.ts). It is not shortened for them: there it is the only
   * framing there is.
   *
   * Both are removed from the DTO rather than left computed and unrendered. A
   * field nothing reads is one autocomplete away from a section somebody
   * removed on purpose coming back, and this one costs a database round trip
   * per overview load to produce.
   */
  return {
    firstName: profile?.firstName ?? null,
    lastTestedDate: latestReport ? latestReport.sampleDate.toISOString().slice(0, 10) : null,
    retestDueDate: retestDueDate ? retestDueDate.toISOString().slice(0, 10) : null,
    releasedReportCount: releasedReports.length,
    pendingReportCount: pendingReports.length,
    trackedMarkerCount: latestByMarker.size,
    latest: latestReport
      ? {
          reportId: latestReport.id,
          panelName: latestReport.panel?.name ?? null,
          title: formatReportTitle(latestReport.panel?.name, latestPoints.length, latestReport.sampleDate),
          sampleDate: latestReport.sampleDate.toISOString().slice(0, 10),
          markerCount: latestPoints.length,
          inRangeCount: inRangePoints.length,
          attentionCount: attentionPoints.length,
        }
      : null,
    attention,
    changes,
  };
}

// ---------------------------------------------------------------------------
// All markers
// ---------------------------------------------------------------------------

/**
 * Every marker the patient has ever had tested, latest-first by test date,
 * each with a short value series for a sparkline. Report-independent by
 * design — this is the answer to "how is my vitamin D doing" from someone who
 * has no idea which report it was on.
 */
export async function listAllMarkersForPatient(patientId: string) {
  const [points, optimalCtx] = await Promise.all([
    loadReleasedPoints(patientId),
    optimalContextForPatient(patientId),
  ]);

  const byMarker = new Map<string, NormalisedPoint[]>();
  for (const p of points) {
    const list = byMarker.get(p.markerId);
    if (list) list.push(p);
    else byMarker.set(p.markerId, [p]);
  }

  return [...byMarker.values()]
    .map((series) => {
      const latest = series[series.length - 1];
      const previous = series.length > 1 ? series[series.length - 2] : null;
      // A sparkline across values we can't relate to each other would be a
      // lie in chart form — those render as a value with no line at all.
      const comparable = series.every((p) => p.convertible);
      const delta =
        previous && comparable && latest.value !== null && previous.value !== null
          ? latest.value - previous.value
          : null;

      return {
        markerId: latest.markerId,
        name: latest.markerName,
        // Search matches these as well as the name, so "ALT" finds Alanine
        // Aminotransferase and "TSH" finds Thyroid Stimulating Hormone.
        aliases: latest.aliases,
        categoryKeys: latest.categoryKeys,
        resultType: latest.resultType,
        unit: latest.unit,
        value: latest.value,
        valueText: latest.valueText,
        status: latest.status,
        referenceLow: latest.referenceLow,
        referenceHigh: latest.referenceHigh,
        severityThreshold: latest.severityThreshold,
        // Advisory only, and null for most markers. Never folded into
        // `status` above — that stays the lab reference range's answer alone.
        optimal: optimalFor(latest.markerKey, latest.unit, latest.value, optimalCtx),
        sampleDate: latest.sampleDate,
        reportId: latest.reportId,
        // See the same pair on the overview's attention list: panelName is
        // nullable by design, reportTitle is the composed fallback.
        panelName: latest.panelName,
        reportTitle: latest.reportTitle,
        amendedAt: latest.amendedAt,
        resultCount: series.length,
        comparable,
        delta: delta === null ? null : round(delta),
        direction: delta === null || delta === 0 ? null : delta > 0 ? ('UP' as const) : ('DOWN' as const),
        // Textual results can't be a point on a line — the spark simply
        // skips them, same as the full trend chart does.
        // A point needs both a number to plot and a status to take its shape
        // and colour from. In practice the two go together, since a numeric
        // value against a resolved range always derives one.
        spark: comparable
          ? series
              .filter(
                (p): p is typeof p & { value: number; status: MarkerStatus } =>
                  p.value !== null && p.status !== null,
              )
              .map((p) => ({ sampleDate: p.sampleDate, value: p.value, status: p.status }))
          : [],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Trends — several markers, one timeline
// ---------------------------------------------------------------------------

/** Comparing more than a few series on one chart stops being a comparison and starts being a mess. */
export const MAX_TREND_MARKERS = 3;

export async function getMultiMarkerTrends(patientId: string, markerIds: string[]) {
  const points = await loadReleasedPoints(patientId);
  const wanted = markerIds.slice(0, MAX_TREND_MARKERS);

  return wanted
    .map((markerId) => {
      const series = points.filter((p) => p.markerId === markerId);
      if (series.length === 0) return null;
      // A genome does not change between tests, a food-sensitivity level has no
      // reference range, and a relative abundance is not an amount. None of the
      // three is plottable, so none of them is offered a line — refused here
      // rather than in the UI so a hand-built URL can't produce one either.
      if (series[0].resultType !== 'MEASURED') return null;
      const comparable = series.every((p) => p.convertible);
      const plottable = series.filter(
        (p): p is typeof p & { value: number; status: MarkerStatus } => p.value !== null && p.status !== null,
      );
      // A marker whose every released result is textual ("< 0.6", "Not
      // detected") has nothing to put on an axis. It used to come back as a
      // series with an empty points array, and the comparison chart reads
      // points[0] and points[length - 1] to build its legend and its
      // accessible summary — so the whole Trends screen threw and rendered
      // white. Refused here rather than guarded there: a series with no
      // points is not a series.
      if (plottable.length === 0) return null;
      return {
        markerId,
        name: series[0].markerName,
        unit: series[0].displayUnit,
        comparable,
        points: plottable
          .map((p) => ({
            sampleDate: p.sampleDate,
            value: p.value,
            status: p.status,
            referenceLow: p.referenceLow,
            referenceHigh: p.referenceHigh,
            severityThreshold: p.severityThreshold,
            reportId: p.reportId,
          })),
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
}

// ---------------------------------------------------------------------------
// Marker library — browsable plain-English explanations
// ---------------------------------------------------------------------------

/**
 * The explanation library as a destination, not a leaf node. Someone who wants
 * to read what ferritin measures should not first have to find a ferritin
 * result.
 *
 * Every active marker that has copy written against it, whatever its review
 * status. This used to be gated on REVIEWED/PUBLISHED, with anything else
 * carrying a "being finalised" line; the gate is gone, because a library whose
 * entries say the library is not ready yet is not a library. reviewStatus is
 * still recorded and still drives the admin review queue, and it is
 * deliberately not on this payload at all: the surest way not to leak an
 * internal editorial state to a patient is not to send it.
 *
 * A marker with no copy is not listed. It is still reachable from the
 * patient's own report and from its own marker page, and an entry that expands
 * to nothing would be the placeholder in another costume.
 */
export async function getMarkerLibraryForPatient(patientId: string) {
  const [markers, ownResults] = await Promise.all([
    prisma.marker.findMany({
      where: { isActive: true, explanation: { isNot: null } },
      include: { explanation: true, panels: { include: { panel: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.reportResult.findMany({
      where: { report: { patientId, status: 'RELEASED', voidedAt: null } },
      select: { markerId: true },
      distinct: ['markerId'],
    }),
  ]);

  const ownMarkerIds = new Set(ownResults.map((r) => r.markerId));

  return markers.map((m) => ({
    markerId: m.id,
    name: m.name,
    // Empty for everything that is not a blood measurement, and for the
    // qualitative measured ones (a UTI organism, an ECG). The web decides what
    // to say about a marker from resultType rather than guessing from a blank.
    unit: m.defaultUnit,
    resultType: m.resultType,
    hasResults: ownMarkerIds.has(m.id),
    panels: [...new Set(m.panels.map((pm) => pm.panel.name))].sort(),
    explanation: {
      whatItIs: m.explanation!.whatItIs,
      highMeans: m.explanation!.highMeans,
      lowMeans: m.explanation!.lowMeans,
      lifestyleContext: m.explanation!.lifestyleContext,
    },
  }));
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * One list of every downloadable file, so nobody has to open six reports to
 * find the PDF they were emailed about. The Aspire summary is always
 * available for a released report (it's generated on demand — see the
 * summary-pdf-link route); the lab's original PDF only exists for reports
 * that arrived as one, which manual entry never does.
 */
export async function listDocumentsForPatient(patientId: string) {
  const reports = await prisma.report.findMany({
    where: { patientId, status: 'RELEASED', voidedAt: null },
    include: {
      panel: true,
      source: true,
      originalPdfFile: true,
      _count: { select: { results: true, exclusions: true } },
      // Only the marker name — never the code, the lab's reason, or any
      // hint of what the value would have been.
      exclusions: { select: { rawMarkerName: true, marker: { select: { name: true } } } },
    },
    orderBy: { sampleDate: 'desc' },
  });

  return reports.map((r) => ({
    reportId: r.id,
    panelName: r.panel?.name ?? null,
    title: formatReportTitle(r.panel?.name, r._count.results, r.sampleDate),
    sampleDate: r.sampleDate.toISOString().slice(0, 10),
    releasedAt: r.releasedAt?.toISOString() ?? null,
    markerCount: r._count.results,
    hasOriginalPdf: !!r.originalPdfFileId,
    originalFilename: r.originalPdfFile?.originalFilename ?? null,
    // A test that was ordered but couldn't be reported. The patient is told
    // plainly that it wasn't reported, and nothing else — no value, no
    // greyed-out number, no lab code, no clinical interpretation of why.
    // Silence would be worse: they paid for the test and would otherwise
    // just find it missing.
    unreportedMarkers: r.exclusions.map((x) => x.marker?.name ?? x.rawMarkerName),
    unreportedNote:
      r._count.exclusions > 0
        ? r._count.exclusions === 1
          ? 'One test on this panel could not be reported. Contact the clinic if you would like it repeated.'
          : `${r._count.exclusions} tests on this panel could not be reported. Contact the clinic if you would like them repeated.`
        : null,
  }));
}
