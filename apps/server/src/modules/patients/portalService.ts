import { prisma } from '../../db/client.js';
import { decryptField } from '../../lib/crypto.js';
import { sourceLabel } from '../../lib/sourceLabel.js';
import { convertToDisplayUnit, hasKnownConversion } from '../../lib/unitConversion.js';
import { classifyMovement, isMeaningfulChange, movementMagnitude } from './markerMovement.js';
import type { MarkerStatus } from '@aspire-bloods/shared';

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
 */

/** One released result, decrypted and normalised to its marker's display unit. */
interface NormalisedPoint {
  markerId: string;
  markerKey: string;
  markerName: string;
  displayUnit: string;
  reportId: string;
  panelName: string;
  sampleDate: string;
  value: number;
  unit: string;
  converted: boolean;
  originalValue: number;
  originalUnit: string;
  status: MarkerStatus;
  referenceLow: number;
  referenceHigh: number;
  sourceLabel: string;
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
  const results = await prisma.reportResult.findMany({
    where: { report: { patientId, status: 'RELEASED', voidedAt: null } },
    include: {
      report: { include: { panel: true, source: true } },
      marker: true,
      referenceRange: true,
    },
    orderBy: [{ report: { sampleDate: 'asc' } }, { createdAt: 'asc' }],
  });

  return results.map((r) => {
    const displayUnit = r.marker.defaultUnit;
    const rawValue = Number(decryptField(r.valueEncrypted));
    const valueConversion = convertToDisplayUnit(r.marker.key, rawValue, r.unit, displayUnit);
    const low = convertToDisplayUnit(r.marker.key, r.referenceRange.low, r.referenceRange.unit, displayUnit);
    const high = convertToDisplayUnit(r.marker.key, r.referenceRange.high, r.referenceRange.unit, displayUnit);

    const valueOk = r.unit === displayUnit || valueConversion.converted;
    const rangeOk = r.referenceRange.unit === displayUnit || hasKnownConversion(r.marker.key, r.referenceRange.unit, displayUnit);

    return {
      markerId: r.markerId,
      markerKey: r.marker.key,
      markerName: r.marker.name,
      displayUnit,
      reportId: r.reportId,
      panelName: r.report.panel.name,
      sampleDate: r.report.sampleDate.toISOString().slice(0, 10),
      value: round(valueConversion.value),
      unit: valueConversion.unit,
      converted: valueConversion.converted,
      originalValue: valueConversion.originalValue,
      originalUnit: valueConversion.originalUnit,
      status: r.status,
      referenceLow: round(low.value),
      referenceHigh: round(high.value),
      sourceLabel: sourceLabel(r.report.source.key, r.report.source.name),
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
  const attentionPoints = latestPoints.filter((p) => p.status !== 'IN_RANGE');

  // Anything out of range at all — including on an older report whose marker
  // wasn't repeated in the latest one. A flagged result doesn't stop mattering
  // because the next panel didn't happen to include that marker.
  const latestByMarker = new Map<string, NormalisedPoint>();
  for (const p of points) latestByMarker.set(p.markerId, p); // points are oldest-first, so this lands on the newest

  const attention = [...latestByMarker.values()]
    .filter((p) => p.status !== 'IN_RANGE')
    .sort((a, b) => (a.sampleDate < b.sampleDate ? 1 : -1))
    .map((p) => ({
      markerId: p.markerId,
      name: p.markerName,
      value: p.value,
      unit: p.unit,
      status: p.status,
      referenceLow: p.referenceLow,
      referenceHigh: p.referenceHigh,
      reportId: p.reportId,
      panelName: p.panelName,
      sampleDate: p.sampleDate,
      /** True when this came from an earlier report than the most recent one. */
      fromEarlierReport: latestReport ? p.reportId !== latestReport.id : false,
    }));

  // What's changed — each marker in the latest report against that marker's
  // own previous result, whichever report it came from. Improvements and
  // declines are both reported; the caller decides how to phrase them.
  const changes = latestPoints
    .map((current) => {
      const history = points.filter((p) => p.markerId === current.markerId && p.sampleDate < current.sampleDate);
      const previous = history[history.length - 1];
      if (!previous) return null;
      if (!current.convertible || !previous.convertible) return null; // never compare across units we can't relate
      if (!isMeaningfulChange(current, previous)) return null;

      const delta = current.value - previous.value;

      // Magnitude rides alongside rather than inside the payload — it exists
      // only to order the list and means nothing to the client.
      return {
        magnitude: movementMagnitude(current, previous),
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
          movement: classifyMovement(current, previous),
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

  const nextSteps: { kind: string; title: string; body: string }[] = [];
  if (pendingReports.length > 0) {
    nextSteps.push({
      kind: 'RESULTS_PENDING',
      title: pendingReports.length === 1 ? 'A result is on its way' : `${pendingReports.length} results are on their way`,
      body: 'Your sample is with the clinical team. We’ll email you as soon as it has been reviewed and released.',
    });
  }
  if (attention.length > 0) {
    nextSteps.push({
      kind: 'DISCUSS_RESULTS',
      title: 'Worth a conversation',
      body: 'Some of your results sit outside the usual reference range. Your GP or the Aspire clinical team can talk you through what they mean in the context of your own history.',
    });
  }
  if (retestDueDate && retestDueDate <= new Date()) {
    nextSteps.push({
      kind: 'RETEST_DUE',
      title: 'A repeat test is due',
      body: `It has been over ${RETEST_INTERVAL_MONTHS} months since your last sample. Get in touch when you’d like to book the next one.`,
    });
  }

  const outOfRangeNotice =
    attention.length > 0 ? (await prisma.copyBlock.findUnique({ where: { slug: 'out_of_range_prompt' } }))?.body ?? null : null;

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
          panelName: latestReport.panel.name,
          sampleDate: latestReport.sampleDate.toISOString().slice(0, 10),
          sourceLabel: sourceLabel(latestReport.source.key, latestReport.source.name),
          markerCount: latestPoints.length,
          inRangeCount: latestPoints.length - attentionPoints.length,
          attentionCount: attentionPoints.length,
        }
      : null,
    attention,
    changes,
    nextSteps,
    outOfRangeNotice,
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
  const points = await loadReleasedPoints(patientId);

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
      const delta = previous && comparable ? latest.value - previous.value : null;

      return {
        markerId: latest.markerId,
        name: latest.markerName,
        unit: latest.unit,
        value: latest.value,
        status: latest.status,
        referenceLow: latest.referenceLow,
        referenceHigh: latest.referenceHigh,
        sampleDate: latest.sampleDate,
        reportId: latest.reportId,
        panelName: latest.panelName,
        sourceLabel: latest.sourceLabel,
        amendedAt: latest.amendedAt,
        resultCount: series.length,
        comparable,
        delta: delta === null ? null : round(delta),
        direction: delta === null || delta === 0 ? null : delta > 0 ? ('UP' as const) : ('DOWN' as const),
        spark: comparable ? series.map((p) => ({ sampleDate: p.sampleDate, value: p.value, status: p.status })) : [],
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
      const comparable = series.every((p) => p.convertible);
      return {
        markerId,
        name: series[0].markerName,
        unit: series[0].displayUnit,
        comparable,
        points: series.map((p) => ({
          sampleDate: p.sampleDate,
          value: p.value,
          status: p.status,
          referenceLow: p.referenceLow,
          referenceHigh: p.referenceHigh,
          sourceLabel: p.sourceLabel,
          reportId: p.reportId,
        })),
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
}

// ---------------------------------------------------------------------------
// Marker library — browsable plain-English explanations
// ---------------------------------------------------------------------------

const EXPLANATION_PENDING =
  'A full explanation for this marker is being finalised by our clinical team and will appear here soon.';

/**
 * The explanation library as a destination, not a leaf node. Shows every
 * marker with clinician-approved copy, plus any marker the patient actually
 * has a result for (even if its copy is still in draft — they can already
 * reach that marker from their report, so hiding it here would just be a
 * dead end). Draft copy is never shown; those entries carry the same
 * pending line the marker detail page uses.
 */
export async function getMarkerLibraryForPatient(patientId: string) {
  const [markers, ownResults] = await Promise.all([
    prisma.marker.findMany({
      where: { isActive: true },
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

  return markers
    .filter((m) => {
      const visible = m.explanation && ['REVIEWED', 'PUBLISHED'].includes(m.explanation.reviewStatus);
      return visible || ownMarkerIds.has(m.id);
    })
    .map((m) => {
      const visible = m.explanation && ['REVIEWED', 'PUBLISHED'].includes(m.explanation.reviewStatus);
      return {
        markerId: m.id,
        name: m.name,
        unit: m.defaultUnit,
        hasResults: ownMarkerIds.has(m.id),
        panels: [...new Set(m.panels.map((pm) => pm.panel.name))].sort(),
        explanation: visible
          ? {
              whatItIs: m.explanation!.whatItIs,
              highMeans: m.explanation!.highMeans,
              lowMeans: m.explanation!.lowMeans,
              lifestyleContext: m.explanation!.lifestyleContext,
              pending: false,
            }
          : { whatItIs: EXPLANATION_PENDING, highMeans: null, lowMeans: null, lifestyleContext: null, pending: true },
      };
    });
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
    include: { panel: true, source: true, originalPdfFile: true, _count: { select: { results: true } } },
    orderBy: { sampleDate: 'desc' },
  });

  return reports.map((r) => ({
    reportId: r.id,
    panelName: r.panel.name,
    sampleDate: r.sampleDate.toISOString().slice(0, 10),
    releasedAt: r.releasedAt?.toISOString() ?? null,
    sourceLabel: sourceLabel(r.source.key, r.source.name),
    markerCount: r._count.results,
    hasOriginalPdf: !!r.originalPdfFileId,
    originalFilename: r.originalPdfFile?.originalFilename ?? null,
  }));
}
