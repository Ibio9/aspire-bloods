import { Router } from 'express';
import { z } from 'zod';
import { updateBiologicalSexSchema, toRandoxBiologicalSexId } from '@aspire-bloods/shared';
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
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: { results: { select: { amendedAt: true } } },
    });
    if (!report || report.patientId !== req.user!.id || report.status !== 'RELEASED') {
      return res.status(404).json({ error: 'Not found' });
    }

    // Regenerating on every click wrote a fresh PDF to disk and a fresh
    // StoredFile row each time — unbounded growth from a button a patient
    // may press repeatedly, and (now that generated files are included in
    // the DSAR export) a pile of identical duplicates in their data export.
    //
    // So: reuse the last generated summary unless something it renders has
    // changed since. An amendment is the only thing that can change a
    // released report's content, so the freshness check is the report's own
    // updatedAt against the most recent amendment.
    const lastAmendedAt = report.results.reduce<Date | null>(
      (latest, r) => (r.amendedAt && (!latest || r.amendedAt > latest) ? r.amendedAt : latest),
      null,
    );
    const contentChangedAt =
      lastAmendedAt && lastAmendedAt > report.updatedAt ? lastAmendedAt : report.updatedAt;

    const existing = await prisma.storedFile.findFirst({
      where: {
        generatedForReportId: report.id,
        kind: 'ASPIRE_SUMMARY_PDF',
        createdAt: { gte: contentChangedAt },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return res.json({ url: `/api/files/download?token=${generateFileToken(existing.id)}` });
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

/**
 * Biological sex — read and set.
 *
 * Optional at registration by design (a patient with no results yet is not
 * withholding anything clinically relevant, and an extra required field at
 * signup costs registrations), but genuinely needed by two things later:
 * Randox's CreatePendingOrder requires a BiologicalSexId, and sex-specific
 * reference ranges cannot be resolved without it. So it's collected when it
 * starts to matter rather than up front, and this pair of endpoints is how.
 *
 * `required` in the response is the honest answer to "can this account order
 * a test yet" — the booking flow reads it rather than re-deriving the rule.
 */
patientsRouter.get(
  '/me/biological-sex',
  asyncHandler(async (req, res) => {
    const profile = await prisma.patientProfile.findUnique({ where: { userId: req.user!.id } });
    const sex = profile?.sex === 'MALE' || profile?.sex === 'FEMALE' ? profile.sex : null;
    res.json({
      sex,
      // Same id Randox's order endpoint wants, resolved here so nothing
      // downstream has to reimplement the mapping. Null when unrecorded —
      // which is exactly the case that blocks an order.
      randoxBiologicalSexId: toRandoxBiologicalSexId(sex),
      canOrderTests: sex !== null,
      hasProfile: !!profile,
    });
  }),
);

patientsRouter.put(
  '/me/biological-sex',
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = updateBiologicalSexSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const profile = await prisma.patientProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) {
      // A staff-only account has no patient profile to write to. Creating one
      // here would invent a patient record out of a settings change.
      return res.status(404).json({ error: 'This account has no patient profile.' });
    }

    const previous = profile.sex;
    await prisma.patientProfile.update({ where: { userId: req.user!.id }, data: { sex: parsed.data.sex } });

    // Which range a result is read against depends on this, so a change to it
    // is a clinically consequential edit and is recorded as one — including
    // what it was before, since "was this always female?" is a real question
    // to ask of a result that looked fine and now doesn't.
    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'PATIENT_BIOLOGICAL_SEX_SET',
      targetType: 'PatientProfile',
      targetId: profile.id,
      ipAddress: req.ip ?? null,
      metadata: { from: previous ?? null, to: parsed.data.sex },
    });

    res.json({
      sex: parsed.data.sex,
      randoxBiologicalSexId: toRandoxBiologicalSexId(parsed.data.sex),
      canOrderTests: true,
      hasProfile: true,
    });
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
