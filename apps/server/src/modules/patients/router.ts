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
import {
  PatientAccessError,
  listReportsForPatient,
  getReleasedReportForPatient,
  getMarkerTrendForPatient,
  getConsentStatus,
  withdrawConsent,
  requestErasure,
} from './service.js';

export const patientsRouter = Router();

patientsRouter.use(authGuard, roleGuard('PATIENT'));

function handleAccessError(e: unknown, res: import('express').Response) {
  if (e instanceof PatientAccessError) {
    res.status(e.status).json({ error: e.message });
    return true;
  }
  return false;
}

patientsRouter.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const reports = await listReportsForPatient(req.user!.id);
    res.json(reports);
  }),
);

patientsRouter.get(
  '/reports/:id',
  asyncHandler(async (req, res) => {
    try {
      const report = await getReleasedReportForPatient(req.user!.id, req.params.id);
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
      res.json(detail);
    } catch (e) {
      if (!handleAccessError(e, res)) throw e;
    }
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
