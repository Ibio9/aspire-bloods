import { prisma } from '../../db/client.js';
import { encryptField, decryptField } from '../../lib/crypto.js';
import { computeMarkerStatus } from '../../lib/markerStatus.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { sourceLabel } from '../../lib/sourceLabel.js';
import { storageAdapter } from '../storage/LocalDiskStorageAdapter.js';
import { resultSourceAdapter } from '../result-sources/index.js';
import { findBestMarkerMatch } from './matchMarker.js';
import type { VerifyReportRequest } from '@aspire-bloods/shared';

export class ReportError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function uploadReport(input: {
  patientId: string;
  panelId: string;
  sourceId: string;
  sampleDate: string;
  fileBuffer: Buffer;
  originalFilename: string;
  mimeType: string;
  uploadedById: string;
  ip: string | null;
}) {
  const patient = await prisma.user.findUnique({ where: { id: input.patientId } });
  if (!patient || patient.role !== 'PATIENT') {
    throw new ReportError('Patient not found', 404);
  }
  const panel = await prisma.panel.findUnique({ where: { id: input.panelId } });
  if (!panel) {
    throw new ReportError('Panel not found', 404);
  }
  const source = await prisma.source.findUnique({ where: { id: input.sourceId } });
  if (!source || !source.isActive) {
    throw new ReportError('Source not found', 404);
  }

  const { storageKey, sizeBytes } = await storageAdapter.save(input.fileBuffer, {
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
  });

  const file = await prisma.storedFile.create({
    data: {
      kind: 'RANDOX_PDF',
      storageKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes,
    },
  });

  const report = await prisma.report.create({
    data: {
      patientId: input.patientId,
      panelId: input.panelId,
      sourceId: input.sourceId,
      sampleDate: new Date(input.sampleDate),
      status: 'UPLOADED',
      uploadedById: input.uploadedById,
      originalPdfFileId: file.id,
    },
  });

  await recordAuditLog({
    actorUserId: input.uploadedById,
    action: 'REPORT_UPLOADED',
    targetType: 'Report',
    targetId: report.id,
    ipAddress: input.ip,
    metadata: { sourceKey: source.key },
  });

  return report;
}

export async function parseReport(reportId: string, actorUserId: string, ip: string | null) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { originalPdfFile: true, panel: { include: { markers: { include: { marker: true } } } } },
  });
  if (!report || !report.originalPdfFile) throw new ReportError('Report not found', 404);
  if (report.voidedAt) throw new ReportError('This report has been voided and cannot be progressed', 409);
  if (!['UPLOADED', 'PARSED', 'CHANGES_REQUESTED'].includes(report.status)) {
    throw new ReportError(`Cannot parse a report in status ${report.status}`, 409);
  }

  const buffer = await storageAdapter.read(report.originalPdfFile.storageKey);
  const parsed = await resultSourceAdapter.normaliseReport(buffer);

  const panelMarkers = report.panel.markers.map((pm) => pm.marker);
  const allMarkers = await prisma.marker.findMany();

  const rows = parsed.rows.map((row) => {
    const match = findBestMarkerMatch(row.rawName, panelMarkers) ?? findBestMarkerMatch(row.rawName, allMarkers);
    return {
      rawLine: row.rawLine,
      rawName: row.rawName,
      matchedMarkerId: match?.id ?? null,
      matchedMarkerName: match?.name ?? null,
      value: row.value,
      unit: row.unit ?? match?.defaultUnit ?? null,
      referenceLow: row.referenceLow,
      referenceHigh: row.referenceHigh,
    };
  });

  if (report.status === 'UPLOADED') {
    await prisma.report.update({ where: { id: reportId }, data: { status: 'PARSED' } });
  }

  await recordAuditLog({
    actorUserId,
    action: 'REPORT_PARSED',
    targetType: 'Report',
    targetId: reportId,
    ipAddress: ip,
    metadata: { rowCount: rows.length },
  });

  return {
    sampleDate: parsed.sampleDate ?? report.sampleDate.toISOString().slice(0, 10),
    rows,
  };
}

export async function verifyReport(
  reportId: string,
  input: VerifyReportRequest,
  actorUserId: string,
  ip: string | null,
) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { patient: { include: { patientProfile: true } }, source: true },
  });
  if (!report) throw new ReportError('Report not found', 404);
  if (report.voidedAt) throw new ReportError('This report has been voided and cannot be progressed', 409);
  if (!['PARSED', 'ADMIN_VERIFIED', 'CHANGES_REQUESTED'].includes(report.status)) {
    throw new ReportError(`Cannot verify a report in status ${report.status}`, 409);
  }
  if (input.results.length === 0) {
    throw new ReportError('At least one result is required', 400);
  }

  const markerIds = input.results.map((r) => r.markerId);
  const markers = await prisma.marker.findMany({ where: { id: { in: markerIds } } });
  const markerById = new Map(markers.map((m) => [m.id, m]));
  const patientSex = report.patient.patientProfile?.sex ?? 'ANY';

  await prisma.$transaction(async (tx) => {
    await tx.reportResult.deleteMany({ where: { reportId } });

    for (const row of input.results) {
      const marker = markerById.get(row.markerId);
      if (!marker) throw new ReportError(`Unknown marker ${row.markerId}`, 400);

      // Phase 2 §2.3: the range is sourced from THIS report/source, never
      // assumed from the marker's fallback — recorded per verification,
      // every time, even on re-verify after changes are requested.
      const referenceRange = await tx.referenceRange.create({
        data: {
          markerId: marker.id,
          sex: patientSex,
          unit: row.unit,
          low: row.referenceLow,
          high: row.referenceHigh,
          source: `${report.source.name}, verified ${new Date().toISOString().slice(0, 10)} (report ${reportId})`,
        },
      });

      const status = computeMarkerStatus(
        row.value,
        row.referenceLow,
        row.referenceHigh,
        marker.severityMultiplier,
        marker.severityAbsoluteDelta,
      );

      await tx.reportResult.create({
        data: {
          reportId,
          markerId: marker.id,
          valueEncrypted: encryptField(String(row.value)),
          unit: row.unit,
          referenceRangeId: referenceRange.id,
          status,
        },
      });
    }

    await tx.report.update({
      where: { id: reportId },
      data: {
        status: 'ADMIN_VERIFIED',
        sampleDate: new Date(input.sampleDate),
        verifiedById: actorUserId,
        verifiedAt: new Date(),
      },
    });
  });

  await recordAuditLog({
    actorUserId,
    action: 'REPORT_VERIFIED',
    targetType: 'Report',
    targetId: reportId,
    ipAddress: ip,
    metadata: { resultCount: input.results.length },
  });
}

export async function reviewReport(
  reportId: string,
  approve: boolean,
  note: string | undefined,
  actorUserId: string,
  ip: string | null,
) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new ReportError('Report not found', 404);
  if (report.voidedAt) throw new ReportError('This report has been voided and cannot be progressed', 409);
  if (report.status !== 'ADMIN_VERIFIED') {
    throw new ReportError(`Cannot review a report in status ${report.status}`, 409);
  }

  await prisma.report.update({
    where: { id: reportId },
    data: approve
      ? { status: 'CLINICIAN_REVIEWED', reviewedById: actorUserId, reviewedAt: new Date() }
      : { status: 'CHANGES_REQUESTED' },
  });

  await recordAuditLog({
    actorUserId,
    action: approve ? 'REPORT_REVIEWED_APPROVED' : 'REPORT_CHANGES_REQUESTED',
    targetType: 'Report',
    targetId: reportId,
    ipAddress: ip,
    metadata: note ? { note } : undefined,
  });
}

export async function releaseReport(reportId: string, actorUserId: string, ip: string | null) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new ReportError('Report not found', 404);
  if (report.voidedAt) throw new ReportError('This report has been voided and cannot be progressed', 409);
  if (report.status !== 'CLINICIAN_REVIEWED') {
    throw new ReportError(`Cannot release a report in status ${report.status}`, 409);
  }

  await prisma.report.update({
    where: { id: reportId },
    data: { status: 'RELEASED', releasedAt: new Date() },
  });

  await recordAuditLog({
    actorUserId,
    action: 'REPORT_RELEASED',
    targetType: 'Report',
    targetId: reportId,
    ipAddress: ip,
  });

  return prisma.report.findUniqueOrThrow({ where: { id: reportId } });
}

/**
 * Void — a state change, not a deletion. The report row, every ReportResult,
 * and the full audit trail all stay exactly as they were; voidedAt is what
 * every patient-facing query filters on to make it disappear from the
 * patient's view, while admin queries keep showing it (marked voided).
 * Allowed from any non-voided status — a report can be voided even before
 * release (e.g. uploaded against the wrong patient entirely).
 */
export async function voidReport(reportId: string, reason: string, actorUserId: string, ip: string | null) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new ReportError('Report not found', 404);
  if (report.voidedAt) {
    throw new ReportError('This report is already voided', 409);
  }

  await prisma.report.update({
    where: { id: reportId },
    data: { voidedAt: new Date(), voidedById: actorUserId, voidReason: reason },
  });

  await recordAuditLog({
    actorUserId,
    action: 'REPORT_VOIDED',
    targetType: 'Report',
    targetId: reportId,
    ipAddress: ip,
    metadata: { reason, statusAtVoid: report.status },
  });
}

/**
 * Editing a value on an already-RELEASED report versions, never overwrites.
 * The ReportResult itself still holds only the current value (so every
 * other read path doesn't need to know about history) but the prior value,
 * who changed it, when, and why are preserved in ReportResultEdit — a
 * clinical record that silently changes is worse than no record at all.
 * The pre-release path (verifyReport, re-verify) is deliberately separate
 * and still overwrites — nothing has been shown to the patient yet there.
 */
export async function editReleasedReportResult(
  resultId: string,
  newValue: number,
  newUnit: string,
  reason: string,
  actorUserId: string,
  ip: string | null,
) {
  if (!reason.trim()) {
    throw new ReportError('A reason is required to edit a released result', 400);
  }

  const result = await prisma.reportResult.findUnique({
    where: { id: resultId },
    include: { report: true, marker: true, referenceRange: true },
  });
  if (!result) throw new ReportError('Result not found', 404);
  if (result.report.status !== 'RELEASED') {
    throw new ReportError('Can only amend a value on a released report — use verify for anything not yet released', 409);
  }
  if (result.report.voidedAt) {
    throw new ReportError('Cannot amend a value on a voided report', 409);
  }

  const newStatus = computeMarkerStatus(
    newValue,
    result.referenceRange.low,
    result.referenceRange.high,
    result.marker.severityMultiplier,
    result.marker.severityAbsoluteDelta,
  );
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.reportResultEdit.create({
      data: {
        reportResultId: result.id,
        previousValueEncrypted: result.valueEncrypted,
        previousUnit: result.unit,
        previousStatus: result.status,
        newValueEncrypted: encryptField(String(newValue)),
        newUnit,
        newStatus,
        reason,
        changedById: actorUserId,
        changedAt: now,
      },
    });

    await tx.reportResult.update({
      where: { id: result.id },
      data: {
        valueEncrypted: encryptField(String(newValue)),
        unit: newUnit,
        status: newStatus,
        amendedAt: now,
      },
    });
  });

  await recordAuditLog({
    actorUserId,
    action: 'REPORT_RESULT_AMENDED',
    targetType: 'ReportResult',
    targetId: result.id,
    ipAddress: ip,
    metadata: {
      reportId: result.reportId,
      markerId: result.markerId,
      previousValue: decryptField(result.valueEncrypted),
      previousUnit: result.unit,
      newValue,
      newUnit,
      reason,
    },
  });
}

export async function getReportDetail(reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      panel: true,
      source: true,
      patient: { include: { patientProfile: true } },
      voidedBy: { include: { staffProfile: true } },
      results: {
        include: {
          marker: true,
          referenceRange: true,
          edits: { include: { changedBy: { include: { staffProfile: true } } }, orderBy: { changedAt: 'desc' } },
        },
      },
      originalPdfFile: true,
    },
  });
  if (!report) throw new ReportError('Report not found', 404);

  return {
    ...report,
    sourceLabel: sourceLabel(report.source.key, report.source.name),
    results: report.results.map((r) => ({
      ...r,
      value: Number(decryptField(r.valueEncrypted)),
      edits: r.edits.map((e) => ({
        id: e.id,
        previousValue: Number(decryptField(e.previousValueEncrypted)),
        previousUnit: e.previousUnit,
        previousStatus: e.previousStatus,
        newValue: Number(decryptField(e.newValueEncrypted)),
        newUnit: e.newUnit,
        newStatus: e.newStatus,
        reason: e.reason,
        changedByName: e.changedBy.staffProfile
          ? `${e.changedBy.staffProfile.firstName} ${e.changedBy.staffProfile.lastName}`
          : e.changedBy.email,
        changedAt: e.changedAt,
      })),
    })),
  };
}

export async function listReportsForAdmin() {
  return prisma.report.findMany({
    include: { panel: true, source: true, patient: { include: { patientProfile: true } } },
    orderBy: { createdAt: 'desc' },
  });
}
