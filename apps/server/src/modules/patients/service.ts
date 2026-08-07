import { prisma } from '../../db/client.js';
import { decryptField } from '../../lib/crypto.js';
import { decodeResultValue } from '../../lib/resultValue.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { sourceLabel } from '../../lib/sourceLabel.js';
import { convertToDisplayUnit, hasKnownConversion } from '../../lib/unitConversion.js';
import { optimalContextForPatient, optimalFor } from '../../lib/optimalRange.js';
import type { ConsentType } from '@aspire-bloods/shared';
import { formatReportTitle } from '@aspire-bloods/shared';

export class PatientAccessError extends Error {
  constructor(
    message = 'Not found',
    public status = 404,
  ) {
    super(message);
  }
}

export async function listReportsForPatient(patientId: string) {
  // Voided is a state change, not a deletion — it disappears from every
  // patient-facing query but stays fully intact (and visible, marked) for
  // admins. See reports/service.ts voidReport().
  const reports = await prisma.report.findMany({
    where: { patientId, voidedAt: null },
    include: { panel: true, source: true, results: true },
    orderBy: { sampleDate: 'desc' },
  });

  return reports.map((r) => {
    const released = r.status === 'RELEASED';
    const attentionCount = r.results.filter((res) => res.status !== 'IN_RANGE').length;
    return {
      reportId: r.id,
      // Nullable by design (schema: Report.panelId is optional). The title is
      // composed here rather than on the client so the portal, the PDF and the
      // escalation email cannot drift apart — formatReportTitle falls back to
      // "12 markers · 4 August 2026" rather than an empty heading. panelName
      // and markerCount stay on the payload for callers that need the parts
      // rather than the composed string.
      panelName: r.panel?.name ?? null,
      title: formatReportTitle(r.panel?.name, r.results.length, r.sampleDate),
      sampleDate: r.sampleDate.toISOString().slice(0, 10),
      patientStatus: released ? ('RELEASED' as const) : ('PENDING' as const),
      // Sent regardless of release state: it's the fallback title's raw
      // material, and a count of markers is not itself a clinical value.
      markerCount: r.results.length,
      inRangeCount: released ? r.results.length - attentionCount : undefined,
      attentionCount: released ? attentionCount : undefined,
      sourceLabel: released ? sourceLabel(r.source.key, r.source.name) : undefined,
    };
  });
}

export async function getReleasedReportForPatient(patientId: string, reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      panel: true,
      source: true,
      results: {
        include: {
          // Health areas ride along with each result so the report can group by
          // them without a second round trip, and so the category summary bars
          // are computed from the same rows the grid renders — two queries
          // would eventually disagree with each other about a count.
          marker: { include: { explanation: true, categories: { include: { category: true } } } },
          referenceRange: true,
        },
      },
    },
  });

  if (!report || report.patientId !== patientId || report.status !== 'RELEASED' || report.voidedAt) {
    throw new PatientAccessError();
  }

  // Age and sex, once, for the whole report. Personalises the advisory optimal
  // band only — the lab's reference range on each result is untouched by it
  // and remains the sole authority for every marker's status.
  const optimalCtx = await optimalContextForPatient(patientId);

  // Every health area this report actually touches, in the catalogue's own
  // order. Derived from the results rather than from the panel: a report can
  // be a handful of individual markers with no panel behind it at all, and a
  // panel's full category list would then promise sections that aren't there.
  const categoryById = new Map<
    string,
    { key: string; name: string; resultType: string; note: string | null; sortOrder: number }
  >();
  for (const r of report.results) {
    for (const m of r.marker.categories) {
      categoryById.set(m.category.id, {
        key: m.category.key,
        name: m.category.name,
        resultType: m.category.resultType,
        note: m.category.note,
        sortOrder: m.category.sortOrder,
      });
    }
  }

  return {
    reportId: report.id,
    panelName: report.panel?.name ?? null,
    markerCount: report.results.length,
    title: formatReportTitle(report.panel?.name, report.results.length, report.sampleDate),
    sampleDate: report.sampleDate.toISOString().slice(0, 10),
    sourceLabel: sourceLabel(report.source.key, report.source.name),
    // Panels state a turnaround; a released report has already arrived, so this
    // is only carried for the repeat-programme note on the page.
    repeatIntervalMonths: report.panel?.repeatIntervalMonths ?? null,
    categories: [...categoryById.values()].sort((a, b) => a.sortOrder - b.sortOrder),
    markers: report.results.map((r) => {
      const decoded = decodeResultValue(decryptField(r.valueEncrypted));
      const measured = r.marker.resultType === 'MEASURED';
      return {
        markerId: r.markerId,
        name: r.marker.name,
        // value/valueText — exactly one is set; textual lab results ("< 0.6",
        // "Not detected") are shown verbatim rather than coerced to NaN.
        ...decoded,
        unit: r.unit,
        referenceLow: r.referenceRange.low,
        referenceHigh: r.referenceRange.high,
        status: r.status,
        // What KIND of result this is. Only MEASURED reaches the main grid, the
        // counts strip, the category bars and Trends; the other three types get
        // their own sections with their own framing, because a genetic risk
        // category and a potassium are not the same kind of statement about a
        // person and must not be laid out as though they were.
        resultType: r.marker.resultType,
        // Health areas, for grouping and for the category filter.
        categoryKeys: r.marker.categories.map((m) => m.category.key),
        // Abbreviations, so a search for "ALT" finds Alanine Aminotransferase.
        aliases: r.marker.aliases,
        // Null for the majority of markers — most have no established optimal,
        // and those show the lab range alone with nothing said about optimal.
        // Never resolved at all for a non-MEASURED marker: a genetic risk
        // category has no units to compare a band against.
        optimal: measured ? optimalFor(r.marker.key, r.unit, decoded.value, optimalCtx) : null,
        gloss: r.marker.explanation?.whatItIs ?? '',
        // A clinical record that silently changes is worse than no record —
        // the patient always sees the current value, but knows it changed.
        amendedAt: r.amendedAt,
      };
    }),
  };
}

export async function getMarkerTrendForPatient(patientId: string, markerId: string) {
  const marker = await prisma.marker.findUnique({ where: { id: markerId }, include: { explanation: true } });
  if (!marker) throw new PatientAccessError();

  const results = await prisma.reportResult.findMany({
    where: { markerId, report: { patientId, status: 'RELEASED', voidedAt: null } },
    include: { report: { include: { source: true } }, referenceRange: true },
    orderBy: { report: { sampleDate: 'asc' } },
  });

  if (results.length === 0) throw new PatientAccessError();

  const explanationVisible = marker.explanation && ['REVIEWED', 'PUBLISHED'].includes(marker.explanation.reviewStatus);

  // Phase 2 §2.3/§2.4: normalise to one display unit (the marker's own
  // default) for plotting, via an explicit, named conversion — never a
  // silent coercion. Every point keeps its original value/unit alongside
  // the converted one. If any point can't be converted (no known rule),
  // the whole series is downgraded to not-comparable rather than mixing
  // units on one axis.
  const displayUnit = marker.defaultUnit;
  let allConvertible = true;

  const allPoints = results.map((r) => {
    const decoded = decodeResultValue(decryptField(r.valueEncrypted));
    // A textual result has nothing to convert and nothing to plot — it is
    // carried through verbatim and excluded from the chart series below.
    const valueConversion =
      decoded.value !== null ? convertToDisplayUnit(marker.key, decoded.value, r.unit, displayUnit) : null;
    // Convertibility is asked of the registry rather than tested with a raw
    // string compare: the lab prints "mmol/l" where the catalogue holds
    // "mmol/L", and treating those as two units with no rule between them
    // marked ordinary same-source series as not comparable — which showed the
    // patient unconnected points and a note about sources, for a series where
    // every value came from one source and nothing was converted at all.
    const valueConvertible = decoded.value === null || hasKnownConversion(marker.key, r.unit, displayUnit);
    const rangeConvertible = hasKnownConversion(marker.key, r.referenceRange.unit, displayUnit);
    if (!valueConvertible || !rangeConvertible) allConvertible = false;

    const lowConversion = convertToDisplayUnit(marker.key, r.referenceRange.low, r.referenceRange.unit, displayUnit);
    const highConversion = convertToDisplayUnit(marker.key, r.referenceRange.high, r.referenceRange.unit, displayUnit);

    return {
      reportId: r.reportId,
      sampleDate: r.report.sampleDate.toISOString().slice(0, 10),
      value: valueConversion ? valueConversion.value : null,
      valueText: decoded.valueText,
      unit: valueConversion ? valueConversion.unit : r.unit,
      converted: valueConversion?.converted ?? false,
      originalValue: valueConversion ? valueConversion.originalValue : null,
      originalUnit: valueConversion ? valueConversion.originalUnit : r.unit,
      status: r.status,
      referenceLow: lowConversion.value,
      referenceHigh: highConversion.value,
      sourceKey: r.report.source.key,
      sourceLabel: sourceLabel(r.report.source.key, r.report.source.name),
      amendedAt: r.amendedAt,
    };
  });

  // The chart plots numbers; textual results stay visible on the report page
  // and in `latest` below but can't be a point on a line.
  const trend = allPoints.filter((p) => p.value !== null);

  // Final flag: the admin/marker-config setting AND actual convertibility
  // both have to hold. A marker can be flagged comparable in principle but
  // still fail here if a specific pair of units has no registered rule —
  // we never draw a line across values we can't honestly relate.
  const crossSourceComparable = marker.crossSourceComparable && allConvertible;

  const latest = allPoints[allPoints.length - 1];

  // One band for the whole marker: it depends on age and sex, not on the
  // report a given point came from, so it is resolved once and applies to the
  // latest result, the range bar and every point on the chart alike.
  const optimalCtx = await optimalContextForPatient(patientId);
  const optimal = optimalFor(marker.key, displayUnit, latest.value, optimalCtx);

  let outOfRangeNotice: string | null = null;
  if (latest.status !== 'IN_RANGE') {
    const copy = await prisma.copyBlock.findUnique({ where: { slug: 'out_of_range_prompt' } });
    outOfRangeNotice = copy?.body ?? null;
  }

  return {
    markerId: marker.id,
    name: marker.name,
    unit: displayUnit,
    crossSourceComparable,
    /** Null when this marker has no established optimal range. Nothing is then said about optimal anywhere on the page. */
    optimal,
    latest: {
      markerId: marker.id,
      name: marker.name,
      value: latest.value,
      valueText: latest.valueText,
      unit: latest.unit,
      referenceLow: latest.referenceLow,
      referenceHigh: latest.referenceHigh,
      status: latest.status,
      optimal,
      sourceLabel: latest.sourceLabel,
      gloss: marker.explanation?.whatItIs ?? '',
      amendedAt: latest.amendedAt,
    },
    trend,
    outOfRangeNotice,
    explanation: explanationVisible
      ? {
          whatItIs: marker.explanation!.whatItIs,
          highMeans: marker.explanation!.highMeans,
          lowMeans: marker.explanation!.lowMeans,
          lifestyleContext: marker.explanation!.lifestyleContext,
          reviewStatus: marker.explanation!.reviewStatus,
        }
      : {
          whatItIs: 'A full explanation for this marker is being finalised by our clinical team and will appear here soon.',
          highMeans: null,
          lowMeans: null,
          lifestyleContext: null,
          reviewStatus: marker.explanation?.reviewStatus ?? 'DRAFT',
        },
  };
}

export async function getConsentStatus(patientId: string) {
  const types: ConsentType[] = ['DATA_PROCESSING', 'RESULTS_STORAGE', 'COMMS_EMAIL', 'COMMS_SMS'];
  const statuses = await Promise.all(
    types.map(async (type) => {
      const latest = await prisma.consentRecord.findFirst({
        where: { userId: patientId, consentVersion: { type } },
        include: { consentVersion: true },
        orderBy: { createdAt: 'desc' },
      });
      return {
        type,
        granted: latest?.granted ?? false,
        withdrawn: !!latest?.withdrawnAt,
        version: latest?.consentVersion.version ?? null,
        bodyText: latest?.consentVersion.bodyText ?? null,
        grantedAt: latest?.createdAt ?? null,
        withdrawnAt: latest?.withdrawnAt ?? null,
      };
    }),
  );
  return statuses;
}

export async function withdrawConsent(patientId: string, type: ConsentType, ip: string | null) {
  const latest = await prisma.consentRecord.findFirst({
    where: { userId: patientId, consentVersion: { type }, granted: true, withdrawnAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!latest) throw new PatientAccessError('No active consent of this type to withdraw', 400);

  await prisma.consentRecord.update({ where: { id: latest.id }, data: { withdrawnAt: new Date() } });

  await recordAuditLog({
    actorUserId: patientId,
    action: 'CONSENT_WITHDRAWN',
    targetType: 'ConsentRecord',
    targetId: latest.id,
    ipAddress: ip,
    metadata: { type },
  });
}

export async function requestErasure(patientId: string) {
  const existing = await prisma.erasureRequest.findFirst({
    where: { userId: patientId, status: { in: ['REQUESTED', 'SCHEDULED'] } },
  });
  if (existing) return existing;

  const request = await prisma.erasureRequest.create({ data: { userId: patientId } });

  await recordAuditLog({
    actorUserId: patientId,
    action: 'ERASURE_REQUESTED',
    targetType: 'ErasureRequest',
    targetId: request.id,
  });

  return request;
}
