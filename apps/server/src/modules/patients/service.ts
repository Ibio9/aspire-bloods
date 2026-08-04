import { prisma } from '../../db/client.js';
import { decryptField } from '../../lib/crypto.js';
import { recordAuditLog } from '../../lib/auditLog.js';
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
  const reports = await prisma.report.findMany({
    where: { patientId },
    include: { panel: true, results: true },
    orderBy: { sampleDate: 'desc' },
  });

  return reports.map((r) => {
    const released = r.status === 'RELEASED';
    const attentionCount = r.results.filter((res) => res.status !== 'IN_RANGE').length;
    return {
      reportId: r.id,
      panelName: r.panel.name,
      sampleDate: r.sampleDate.toISOString().slice(0, 10),
      patientStatus: released ? ('RELEASED' as const) : ('PENDING' as const),
      markerCount: released ? r.results.length : undefined,
      inRangeCount: released ? r.results.length - attentionCount : undefined,
      attentionCount: released ? attentionCount : undefined,
    };
  });
}

export async function getReleasedReportForPatient(patientId: string, reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      panel: true,
      results: { include: { marker: { include: { explanation: true } }, referenceRange: true } },
    },
  });

  if (!report || report.patientId !== patientId || report.status !== 'RELEASED') {
    throw new PatientAccessError();
  }

  return {
    reportId: report.id,
    panelName: report.panel.name,
    sampleDate: report.sampleDate.toISOString().slice(0, 10),
    markers: report.results.map((r) => ({
      markerId: r.markerId,
      name: r.marker.name,
      value: Number(decryptField(r.valueEncrypted)),
      unit: r.unit,
      referenceLow: r.referenceRange.low,
      referenceHigh: r.referenceRange.high,
      status: r.status,
      gloss: r.marker.explanation?.whatItIs ?? '',
    })),
  };
}

export async function getMarkerTrendForPatient(patientId: string, markerId: string) {
  const marker = await prisma.marker.findUnique({ where: { id: markerId }, include: { explanation: true } });
  if (!marker) throw new PatientAccessError();

  const results = await prisma.reportResult.findMany({
    where: { markerId, report: { patientId, status: 'RELEASED' } },
    include: { report: true, referenceRange: true },
    orderBy: { report: { sampleDate: 'asc' } },
  });

  if (results.length === 0) throw new PatientAccessError();

  const explanationVisible = marker.explanation && ['REVIEWED', 'PUBLISHED'].includes(marker.explanation.reviewStatus);

  const trend = results.map((r) => ({
    reportId: r.reportId,
    sampleDate: r.report.sampleDate.toISOString().slice(0, 10),
    value: Number(decryptField(r.valueEncrypted)),
    status: r.status,
    referenceLow: r.referenceRange.low,
    referenceHigh: r.referenceRange.high,
  }));

  const latest = trend[trend.length - 1];

  let outOfRangeNotice: string | null = null;
  if (latest.status !== 'IN_RANGE') {
    const copy = await prisma.copyBlock.findUnique({ where: { slug: 'out_of_range_prompt' } });
    outOfRangeNotice = copy?.body ?? null;
  }

  return {
    markerId: marker.id,
    name: marker.name,
    unit: latest.referenceLow !== undefined ? results[results.length - 1].unit : marker.defaultUnit,
    latest: {
      markerId: marker.id,
      name: marker.name,
      value: latest.value,
      unit: results[results.length - 1].unit,
      referenceLow: latest.referenceLow,
      referenceHigh: latest.referenceHigh,
      status: latest.status,
      gloss: marker.explanation?.whatItIs ?? '',
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
