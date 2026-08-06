import { prisma } from '../../db/client.js';
import { decryptField } from '../../lib/crypto.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { sourceLabel } from '../../lib/sourceLabel.js';
import { convertToDisplayUnit, hasKnownConversion } from '../../lib/unitConversion.js';
import type { ConsentType } from '@aspire-bloods/shared';

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
      // Nullable by design (schema: Report.panelId is optional) — the client
      // composes the card title via formatReportTitle(), which falls back to
      // "12 markers · 4 August 2026" rather than rendering an empty heading.
      panelName: r.panel?.name ?? null,
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
      results: { include: { marker: { include: { explanation: true } }, referenceRange: true } },
    },
  });

  if (!report || report.patientId !== patientId || report.status !== 'RELEASED' || report.voidedAt) {
    throw new PatientAccessError();
  }

  return {
    reportId: report.id,
    panelName: report.panel?.name ?? null,
    markerCount: report.results.length,
    sampleDate: report.sampleDate.toISOString().slice(0, 10),
    sourceLabel: sourceLabel(report.source.key, report.source.name),
    markers: report.results.map((r) => ({
      markerId: r.markerId,
      name: r.marker.name,
      value: Number(decryptField(r.valueEncrypted)),
      unit: r.unit,
      referenceLow: r.referenceRange.low,
      referenceHigh: r.referenceRange.high,
      status: r.status,
      gloss: r.marker.explanation?.whatItIs ?? '',
      // A clinical record that silently changes is worse than no record —
      // the patient always sees the current value, but knows it changed.
      amendedAt: r.amendedAt,
    })),
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

  const trend = results.map((r) => {
    const rawValue = Number(decryptField(r.valueEncrypted));
    const valueConversion = convertToDisplayUnit(marker.key, rawValue, r.unit, displayUnit);
    const rangeConvertible = hasKnownConversion(marker.key, r.referenceRange.unit, displayUnit);
    if (r.unit !== displayUnit && !valueConversion.converted) allConvertible = false;
    if (r.referenceRange.unit !== displayUnit && !rangeConvertible) allConvertible = false;

    const lowConversion = convertToDisplayUnit(marker.key, r.referenceRange.low, r.referenceRange.unit, displayUnit);
    const highConversion = convertToDisplayUnit(marker.key, r.referenceRange.high, r.referenceRange.unit, displayUnit);

    return {
      reportId: r.reportId,
      sampleDate: r.report.sampleDate.toISOString().slice(0, 10),
      value: valueConversion.value,
      unit: valueConversion.unit,
      converted: valueConversion.converted,
      originalValue: valueConversion.originalValue,
      originalUnit: valueConversion.originalUnit,
      status: r.status,
      referenceLow: lowConversion.value,
      referenceHigh: highConversion.value,
      sourceKey: r.report.source.key,
      sourceLabel: sourceLabel(r.report.source.key, r.report.source.name),
      amendedAt: r.amendedAt,
    };
  });

  // Final flag: the admin/marker-config setting AND actual convertibility
  // both have to hold. A marker can be flagged comparable in principle but
  // still fail here if a specific pair of units has no registered rule —
  // we never draw a line across values we can't honestly relate.
  const crossSourceComparable = marker.crossSourceComparable && allConvertible;

  const latest = trend[trend.length - 1];

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
    latest: {
      markerId: marker.id,
      name: marker.name,
      value: latest.value,
      unit: latest.unit,
      referenceLow: latest.referenceLow,
      referenceHigh: latest.referenceHigh,
      status: latest.status,
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
