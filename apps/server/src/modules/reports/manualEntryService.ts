import { prisma } from '../../db/client.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { ReportError, verifyReport } from './service.js';
import type { VerifyReportRequest } from '@aspire-bloods/shared';

export interface ImplausibleFlag {
  markerId: string;
  markerName: string;
  value: number;
  referenceLow: number;
  referenceHigh: number;
  reason: string;
}

/**
 * §2.5: catches the realistic error mode for hand-typed values — a
 * decimal-place slip (4.5 vs 45) or a unit slip (mmol/L value typed
 * against a mg/dL range) — by flagging anything wildly outside the
 * admin's own entered range. Wide margin (10x) deliberately: this is a
 * plausibility check, not a clinical judgement, so it should only catch
 * the "did you mean to type an order of magnitude off" case, not
 * ordinary abnormal-but-real results.
 */
function findImplausibleRows(
  results: VerifyReportRequest['results'],
  markerById: Map<string, { name: string }>,
): ImplausibleFlag[] {
  const flags: ImplausibleFlag[] = [];
  for (const r of results) {
    const width = r.referenceHigh - r.referenceLow || 1;
    const farBelow = r.value < r.referenceLow - width * 10;
    const farAbove = r.value > r.referenceHigh + width * 10;
    const wrongMagnitude = r.value > 0 && (r.value > r.referenceHigh * 10 || (r.referenceLow > 0 && r.value < r.referenceLow / 10));
    if (farBelow || farAbove || wrongMagnitude) {
      flags.push({
        markerId: r.markerId,
        markerName: markerById.get(r.markerId)?.name ?? r.markerId,
        value: r.value,
        referenceLow: r.referenceLow,
        referenceHigh: r.referenceHigh,
        reason: 'Value is far outside the entered range — check for a decimal-place or unit slip.',
      });
    }
  }
  return flags;
}

export async function createManualEntryReport(input: {
  patientId: string;
  panelId?: string | null;
  sampleDate: string;
  results: VerifyReportRequest['results'];
  confirmed: boolean;
  enteredById: string;
  ip: string | null;
}) {
  const patient = await prisma.user.findUnique({ where: { id: input.patientId } });
  if (!patient || patient.role !== 'PATIENT') throw new ReportError('Patient not found', 404);
  // No panel is a valid ad-hoc entry; a panel id that doesn't resolve is
  // still an error — "absent" and "wrong" must not be conflated.
  if (input.panelId) {
    const panel = await prisma.panel.findUnique({ where: { id: input.panelId } });
    if (!panel) throw new ReportError('Panel not found', 404);
  }
  if (input.results.length === 0) throw new ReportError('At least one result is required', 400);

  const source = await prisma.source.findUnique({ where: { key: 'manual_entry' } });
  if (!source) throw new ReportError('manual_entry source is not seeded', 500);

  const markers = await prisma.marker.findMany({
    where: { id: { in: input.results.map((r) => r.markerId) } },
    select: { id: true, name: true },
  });
  const markerById = new Map(markers.map((m) => [m.id, m]));

  if (!input.confirmed) {
    const implausible = findImplausibleRows(input.results, markerById);
    if (implausible.length > 0) {
      return { status: 'confirmation_required' as const, implausible };
    }
  }

  const report = await prisma.report.create({
    data: {
      patientId: input.patientId,
      panelId: input.panelId ?? null,
      sourceId: source.id,
      sampleDate: new Date(input.sampleDate),
      // PARSED, not UPLOADED: there's no document and no parse step here —
      // the admin's typed data is already in the "ready to verify" shape
      // that the PDF path only reaches after parseReport(). Starting at
      // UPLOADED would make verifyReport() reject it (that status means
      // "not parsed yet", which doesn't apply to manual entry).
      status: 'PARSED',
      uploadedById: input.enteredById,
    },
  });

  await recordAuditLog({
    actorUserId: input.enteredById,
    action: 'REPORT_MANUAL_ENTRY_CREATED',
    targetType: 'Report',
    targetId: report.id,
    ipAddress: input.ip,
    metadata: { resultCount: input.results.length },
  });

  // Same verify→review→release gate as every other source — no shortcuts.
  // Manual entry has no parse step (there's no document), so it goes
  // straight from UPLOADED to the verify call, which moves it to
  // ADMIN_VERIFIED exactly as the PDF-upload path does.
  await verifyReport(
    report.id,
    { sampleDate: new Date(input.sampleDate).toISOString(), results: input.results },
    input.enteredById,
    input.ip,
  );

  return { status: 'created' as const, reportId: report.id };
}
