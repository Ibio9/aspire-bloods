import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { verifyReportRequestSchema, publishReportRequestSchema, manualEntryRequestSchema } from '@aspire-bloods/shared';
import { authGuard } from '../../middleware/authGuard.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { verifyCsrf } from '../../middleware/csrf.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import {
  ReportError,
  uploadReport,
  parseReport,
  verifyReport,
  publishReport,
  reviewReport,
  releaseReport,
  voidReport,
  editReleasedReportResult,
  getReportDetail,
  listReportsForAdmin,
} from './service.js';
import { createManualEntryReport } from './manualEntryService.js';
import { checkAndEscalate } from '../escalation/service.js';
import { prisma } from '../../db/client.js';
import { generateFileToken } from '../../lib/signedUrl.js';
import { recordAuditLog } from '../../lib/auditLog.js';

export const reportsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are accepted'));
    }
    cb(null, true);
  },
});

// A panel is an equal choice, not a required fallback — the multipart form
// sends '' for "no panel selected", which reads as absent, not an invalid uuid.
const optionalUuid = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().uuid().optional());

const uploadRequestSchema = z.object({
  patientId: z.string().uuid(),
  // multipart form field — an empty string means "no panel selected", not
  // a malformed uuid, so it's normalised to undefined before validation.
  panelId: optionalUuid,
  sourceId: z.string().uuid(),
  sampleDate: z.string().min(1),
});

const reviewRequestSchema = z.object({
  approve: z.boolean(),
  note: z.string().max(2000).optional(),
  /**
   * Required to APPROVE a report whose parse was not clean — see
   * lib/cleanParse.ts and reviewReport(). Defaults to false so a client that
   * does not know about holds cannot approve one by omission, which is the
   * direction the default has to fail in.
   */
  acknowledgeHolds: z.boolean().optional(),
});

const voidRequestSchema = z.object({
  reason: z.string().min(1).max(2000),
});

const editResultRequestSchema = z.object({
  value: z.number(),
  unit: z.string().min(1),
  reason: z.string().min(1).max(2000),
});

function handleReportError(e: unknown, res: import('express').Response) {
  if (e instanceof ReportError) {
    res.status(e.status).json({ error: e.message });
    return true;
  }
  return false;
}

reportsRouter.use(authGuard);

reportsRouter.get(
  '/',
  roleGuard('ADMIN', 'CLINICIAN'),
  asyncHandler(async (req, res) => {
    const reports = await listReportsForAdmin();
    // Every admin/clinician view of patient data is audited, not just
    // edits — a list view surfaces every patient's name/status at once.
    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'PATIENT_DATA_VIEWED',
      targetType: 'Report',
      ipAddress: req.ip ?? null,
      metadata: { view: 'admin_reports_list', count: reports.length },
    });
    res.json(reports);
  }),
);

reportsRouter.post(
  '/',
  roleGuard('ADMIN'),
  verifyCsrf,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const parsed = uploadRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });

    try {
      const { report, parse, parseError } = await uploadReport({
        ...parsed.data,
        panelId: parsed.data.panelId ?? null,
        fileBuffer: req.file.buffer,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        uploadedById: req.user!.id,
        ip: req.ip ?? null,
      });
      // The report's own fields stay at the top level — every existing caller
      // reads `id` straight off this response. The parse rides alongside so
      // the admin console can go straight to a populated verify table instead
      // of asking for the extraction it was always going to ask for.
      res.status(201).json({ ...report, parse, parseError });
    } catch (e) {
      if (!handleReportError(e, res)) throw e;
    }
  }),
);

reportsRouter.post(
  '/manual-entry',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = manualEntryRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const result = await createManualEntryReport({
        ...parsed.data,
        panelId: parsed.data.panelId ?? null,
        enteredById: req.user!.id,
        ip: req.ip ?? null,
      });
      if (result.status === 'confirmation_required') {
        return res.status(200).json(result);
      }
      res.status(201).json(result);
    } catch (e) {
      if (!handleReportError(e, res)) throw e;
    }
  }),
);

reportsRouter.get(
  '/:id',
  roleGuard('ADMIN', 'CLINICIAN'),
  asyncHandler(async (req, res) => {
    try {
      const report = await getReportDetail(req.params.id);
      await recordAuditLog({
        actorUserId: req.user!.id,
        action: 'PATIENT_DATA_VIEWED',
        targetType: 'Report',
        targetId: report.id,
        ipAddress: req.ip ?? null,
        metadata: { view: 'report_detail', patientId: report.patientId },
      });
      res.json(report);
    } catch (e) {
      if (!handleReportError(e, res)) throw e;
    }
  }),
);

reportsRouter.get(
  '/:id/download-link',
  roleGuard('ADMIN', 'CLINICIAN'),
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report?.originalPdfFileId) return res.status(404).json({ error: 'No file on this report' });
    res.json({ url: `/api/files/download?token=${generateFileToken(report.originalPdfFileId)}` });
  }),
);

reportsRouter.post(
  '/:id/parse',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    try {
      const result = await parseReport(req.params.id, req.user!.id, req.ip ?? null);
      res.json(result);
    } catch (e) {
      if (!handleReportError(e, res)) throw e;
    }
  }),
);

reportsRouter.post(
  '/:id/verify',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = verifyReportRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      await verifyReport(req.params.id, parsed.data, req.user!.id, req.ip ?? null);
      res.json({ ok: true });
    } catch (e) {
      if (!handleReportError(e, res)) throw e;
    }
  }),
);

// This practice's admins are its clinicians — ADMIN can do the full
// review+release itself, with no separate clinician sign-off required.
// CLINICIAN stays too, unchanged, for a genuine second-reviewer workflow
// if this practice ever has one.
reportsRouter.post(
  '/:id/review',
  roleGuard('ADMIN', 'CLINICIAN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = reviewRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      await reviewReport(
        req.params.id,
        parsed.data.approve,
        parsed.data.note,
        req.user!.id,
        req.ip ?? null,
        parsed.data.acknowledgeHolds ?? false,
      );
      res.json({ ok: true });
    } catch (e) {
      if (!handleReportError(e, res)) throw e;
    }
  }),
);

/**
 * Release has already committed by the time this runs — a notification-side
 * failure (email/SMS provider down) must not surface as a release failure to
 * the admin, who would otherwise retry a release that already succeeded and
 * get a confusing 409. Escalation itself is still exactly-once: releaseReport()
 * can only ever succeed once per report (see its status guard), so each call
 * site here runs at most once per report.
 *
 * Shared by the two routes that can release: the explicit release step, and
 * one-step publish. Both must escalate identically — a report published in one
 * click and the same report released in three has the same clinical urgency.
 */
async function escalateAfterRelease(reportId: string, actorUserId: string, ip: string | null) {
  try {
    await checkAndEscalate(reportId);
  } catch (escalationError) {
    console.error('[escalation] failed after successful release', {
      reportId,
      error: escalationError instanceof Error ? escalationError.message : escalationError,
    });
    await recordAuditLog({
      actorUserId,
      action: 'ESCALATION_FAILED',
      targetType: 'Report',
      targetId: reportId,
      ipAddress: ip,
      metadata: { error: escalationError instanceof Error ? escalationError.message : String(escalationError) },
    });
  }
}

reportsRouter.post(
  '/:id/release',
  roleGuard('ADMIN', 'CLINICIAN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    try {
      const report = await releaseReport(req.params.id, req.user!.id, req.ip ?? null);
      await escalateAfterRelease(report.id, req.user!.id, req.ip ?? null);
      res.json({ ok: true });
    } catch (e) {
      if (!handleReportError(e, res)) throw e;
    }
  }),
);

/**
 * Verify, review and release in one request.
 *
 * ADMIN only, and deliberately not looser than the three steps it replaces:
 * verify is already ADMIN-only, so an admin is the only role that could have
 * driven this sequence by hand anyway. The service walks each transition
 * through its own guard, so this route weakens nothing — it just stops the
 * admin making three round trips to say one thing.
 */
reportsRouter.post(
  '/:id/publish',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = publishReportRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const report = await publishReport(req.params.id, parsed.data, req.user!.id, req.ip ?? null);
      await escalateAfterRelease(report.id, req.user!.id, req.ip ?? null);
      res.json({ ok: true, status: report.status });
    } catch (e) {
      if (!handleReportError(e, res)) throw e;
    }
  }),
);

reportsRouter.post(
  '/:id/void',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = voidRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      await voidReport(req.params.id, parsed.data.reason, req.user!.id, req.ip ?? null);
      res.json({ ok: true });
    } catch (e) {
      if (!handleReportError(e, res)) throw e;
    }
  }),
);

reportsRouter.patch(
  '/:id/results/:resultId',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = editResultRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      await editReleasedReportResult(
        req.params.resultId,
        parsed.data.value,
        parsed.data.unit,
        parsed.data.reason,
        req.user!.id,
        req.ip ?? null,
      );
      res.json({ ok: true });
    } catch (e) {
      if (!handleReportError(e, res)) throw e;
    }
  }),
);
