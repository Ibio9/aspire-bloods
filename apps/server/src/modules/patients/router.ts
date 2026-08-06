import { Router } from 'express';
import { z } from 'zod';
import { authGuard } from '../../middleware/authGuard.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { verifyCsrf } from '../../middleware/csrf.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { prisma } from '../../db/client.js';
import { generateFileToken } from '../../lib/signedUrl.js';
import { generateAspireSummaryPdf } from '../export/pdfSummary.js';
import { storageAdapter } from '../storage/LocalDiskStorageAdapter.js';
import { buildDsarExport } from './dsarService.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import {
  PatientAccessError,
  listReportsForPatient,
  getReleasedReportForPatient,
  getMarkerTrendForPatient,
  getConsentStatus,
  withdrawConsent,
  requestErasure,
} from './service.js';
import {
  MAX_TREND_MARKERS,
  getPatientOverview,
  listAllMarkersForPatient,
  getMultiMarkerTrends,
  getMarkerLibraryForPatient,
  listDocumentsForPatient,
} from './portalService.js';

export const patientsRouter = Router();

// Widened beyond PATIENT so an admin who is also a patient of the practice
// sees their own results through this exact same route — one account, no
// second login. Every function here is already scoped to req.user!.id, so
// there's no cross-patient access risk in allowing ADMIN/CLINICIAN through.
patientsRouter.use(authGuard, roleGuard('PATIENT', 'ADMIN', 'CLINICIAN'));

function handleAccessError(e: unknown, res: import('express').Response) {
  if (e instanceof PatientAccessError) {
    res.status(e.status).json({ error: e.message });
    return true;
  }
  return false;
}

// An admin viewing their OWN results through this route is still an
// admin viewing patient data, and is still audited — the "admin" framing
// is about the identity of the viewer, not whose data it is.
async function auditIfAdminViewer(req: import('express').Request, view: string, targetType: string, targetId?: string) {
  if (req.user!.role === 'PATIENT') return;
  await recordAuditLog({
    actorUserId: req.user!.id,
    action: 'PATIENT_DATA_VIEWED',
    targetType,
    targetId: targetId ?? req.user!.id,
    ipAddress: req.ip ?? null,
    metadata: { view, ownData: true },
  });
}

patientsRouter.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const reports = await listReportsForPatient(req.user!.id);
    await auditIfAdminViewer(req, 'own_reports_list', 'User');
    res.json(reports);
  }),
);

patientsRouter.get(
  '/reports/:id',
  asyncHandler(async (req, res) => {
    try {
      const report = await getReleasedReportForPatient(req.user!.id, req.params.id);
      await auditIfAdminViewer(req, 'own_report_detail', 'Report', req.params.id);
      res.json(report);
    } catch (e) {
      if (!handleAccessError(e, res)) throw e;
    }
  }),
);

patientsRouter.get(
  '/markers/:markerId',
  asyncHandler(async (req, res) => {
    try {
      const detail = await getMarkerTrendForPatient(req.user!.id, req.params.markerId);
      await auditIfAdminViewer(req, 'own_marker_detail', 'Marker', req.params.markerId);
      res.json(detail);
    } catch (e) {
      if (!handleAccessError(e, res)) throw e;
    }
  }),
);

// ---------------------------------------------------------------------------
// Portal read models — cross-report views (see ./portalService.ts)
// ---------------------------------------------------------------------------

patientsRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const overview = await getPatientOverview(req.user!.id);
    await auditIfAdminViewer(req, 'own_overview', 'User');
    res.json(overview);
  }),
);

patientsRouter.get(
  '/markers',
  asyncHandler(async (req, res) => {
    const markers = await listAllMarkersForPatient(req.user!.id);
    await auditIfAdminViewer(req, 'own_all_markers', 'User');
    res.json(markers);
  }),
);

const trendsQuery = z.object({
  // Repeated ?markerIds=a&markerIds=b or one comma-separated value — the
  // chart's own URL is shareable/bookmarkable, so both shapes get accepted.
  markerIds: z.union([z.string(), z.array(z.string())]).optional(),
});

patientsRouter.get(
  '/trends',
  asyncHandler(async (req, res) => {
    const parsed = trendsQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const raw = parsed.data.markerIds;
    const markerIds = (Array.isArray(raw) ? raw : raw ? [raw] : [])
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, MAX_TREND_MARKERS);

    if (markerIds.length === 0) return res.json([]);

    const series = await getMultiMarkerTrends(req.user!.id, markerIds);
    await auditIfAdminViewer(req, 'own_trends', 'User');
    res.json(series);
  }),
);

patientsRouter.get(
  '/library',
  asyncHandler(async (req, res) => {
    // Explanation copy is not patient data — but which markers the patient
    // has results for is, so this stays on the audited path like the rest.
    const library = await getMarkerLibraryForPatient(req.user!.id);
    await auditIfAdminViewer(req, 'own_marker_library', 'User');
    res.json(library);
  }),
);

patientsRouter.get(
  '/documents',
  asyncHandler(async (req, res) => {
    const documents = await listDocumentsForPatient(req.user!.id);
    await auditIfAdminViewer(req, 'own_documents', 'User');
    res.json(documents);
  }),
);

patientsRouter.get(
  '/reports/:id/original-pdf-link',
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report || report.patientId !== req.user!.id || report.status !== 'RELEASED' || !report.originalPdfFileId) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ url: `/api/files/download?token=${generateFileToken(report.originalPdfFileId)}` });
  }),
);

patientsRouter.get(
  '/reports/:id/summary-pdf-link',
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report || report.patientId !== req.user!.id || report.status !== 'RELEASED') {
      return res.status(404).json({ error: 'Not found' });
    }

    const pdfBuffer = await generateAspireSummaryPdf(report.id);
    const { storageKey, sizeBytes } = await storageAdapter.save(pdfBuffer, {
      originalFilename: `aspire-summary-${report.id}.pdf`,
      mimeType: 'application/pdf',
    });
    const file = await prisma.storedFile.create({
      data: {
        kind: 'ASPIRE_SUMMARY_PDF',
        storageKey,
        originalFilename: `aspire-summary-${report.sampleDate.toISOString().slice(0, 10)}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes,
        generatedForReportId: report.id,
      },
    });

    res.json({ url: `/api/files/download?token=${generateFileToken(file.id)}` });
  }),
);

patientsRouter.get(
  '/me/consents',
  asyncHandler(async (req, res) => {
    const statuses = await getConsentStatus(req.user!.id);
    await auditIfAdminViewer(req, 'own_consents', 'User');
    res.json(statuses);
  }),
);

const withdrawConsentParams = z.object({
  type: z.enum(['DATA_PROCESSING', 'RESULTS_STORAGE', 'COMMS_EMAIL', 'COMMS_SMS']),
});

patientsRouter.post(
  '/me/consents/:type/withdraw',
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = withdrawConsentParams.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      await withdrawConsent(req.user!.id, parsed.data.type, req.ip ?? null);
      res.json({ ok: true });
    } catch (e) {
      if (!handleAccessError(e, res)) throw e;
    }
  }),
);

patientsRouter.post(
  '/me/erasure-request',
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const request = await requestErasure(req.user!.id);
    res.status(201).json(request);
  }),
);

patientsRouter.get(
  '/me/export',
  asyncHandler(async (req, res) => {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="aspire-bloods-my-data.zip"');
    const stream = await buildDsarExport(req.user!.id);
    stream.pipe(res);
  }),
);
