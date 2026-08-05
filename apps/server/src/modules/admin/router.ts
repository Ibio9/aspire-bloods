import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { authGuard } from '../../middleware/authGuard.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { verifyCsrf } from '../../middleware/csrf.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import {
  AdminError,
  getPatientProfile,
  getPatientConsents,
  getPatientReportHistory,
  getPatientAuditTrail,
  resendInvite,
  resetPatientTwoFactor,
  deactivatePatient,
  reactivatePatient,
  initiateErasureByAdmin,
  getSystemAuditLog,
  listCopyBlocks,
  updateCopyBlock,
} from './service.js';

export const adminRouter = Router();

adminRouter.use(authGuard, roleGuard('ADMIN', 'CLINICIAN'));

function handleAdminError(e: unknown, res: import('express').Response) {
  if (e instanceof AdminError) {
    res.status(e.status).json({ error: e.message });
    return true;
  }
  return false;
}

adminRouter.get(
  '/patients',
  asyncHandler(async (_req, res) => {
    const patients = await prisma.user.findMany({
      where: { role: 'PATIENT' },
      include: { patientProfile: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      patients.map((p) => ({
        id: p.id,
        email: p.email,
        status: p.status,
        deactivatedAt: p.deactivatedAt,
        createdAt: p.createdAt,
        displayName: p.patientProfile ? `${p.patientProfile.firstName} ${p.patientProfile.lastName}` : '(pending activation)',
      })),
    );
  }),
);

adminRouter.get(
  '/patients/:id',
  asyncHandler(async (req, res) => {
    try {
      const profile = await getPatientProfile(req.params.id);
      await recordAuditLog({
        actorUserId: req.user!.id,
        action: 'PATIENT_DATA_VIEWED',
        targetType: 'User',
        targetId: req.params.id,
        ipAddress: req.ip ?? null,
        metadata: { view: 'patient_profile' },
      });
      res.json(profile);
    } catch (e) {
      if (!handleAdminError(e, res)) throw e;
    }
  }),
);

adminRouter.get(
  '/patients/:id/consents',
  asyncHandler(async (req, res) => {
    const consents = await getPatientConsents(req.params.id);
    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'PATIENT_DATA_VIEWED',
      targetType: 'User',
      targetId: req.params.id,
      ipAddress: req.ip ?? null,
      metadata: { view: 'patient_consents' },
    });
    res.json(consents);
  }),
);

adminRouter.get(
  '/patients/:id/reports',
  asyncHandler(async (req, res) => {
    const reports = await getPatientReportHistory(req.params.id);
    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'PATIENT_DATA_VIEWED',
      targetType: 'User',
      targetId: req.params.id,
      ipAddress: req.ip ?? null,
      metadata: { view: 'patient_report_history' },
    });
    res.json(reports);
  }),
);

const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

adminRouter.get(
  '/patients/:id/audit-trail',
  asyncHandler(async (req, res) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await getPatientAuditTrail(req.params.id, parsed.data.limit, parsed.data.offset);
    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'PATIENT_DATA_VIEWED',
      targetType: 'User',
      targetId: req.params.id,
      ipAddress: req.ip ?? null,
      metadata: { view: 'patient_audit_trail' },
    });
    res.json(result);
  }),
);

adminRouter.post(
  '/patients/:id/resend-invite',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    try {
      const result = await resendInvite(req.params.id, req.user!.id, req.ip ?? null);
      res.json({ ok: true, ...result });
    } catch (e) {
      if (!handleAdminError(e, res)) throw e;
    }
  }),
);

adminRouter.post(
  '/patients/:id/reset-2fa',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    try {
      const result = await resetPatientTwoFactor(req.params.id, req.user!.id, req.ip ?? null);
      res.json({ ok: true, ...result });
    } catch (e) {
      if (!handleAdminError(e, res)) throw e;
    }
  }),
);

const deactivateSchema = z.object({ reason: z.string().min(1).max(2000) });

adminRouter.post(
  '/patients/:id/deactivate',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = deactivateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      await deactivatePatient(req.params.id, parsed.data.reason, req.user!.id, req.ip ?? null);
      res.json({ ok: true });
    } catch (e) {
      if (!handleAdminError(e, res)) throw e;
    }
  }),
);

adminRouter.post(
  '/patients/:id/reactivate',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    try {
      await reactivatePatient(req.params.id, req.user!.id, req.ip ?? null);
      res.json({ ok: true });
    } catch (e) {
      if (!handleAdminError(e, res)) throw e;
    }
  }),
);

adminRouter.post(
  '/patients/:id/erasure',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    try {
      const request = await initiateErasureByAdmin(req.params.id, req.user!.id, req.ip ?? null);
      res.status(201).json(request);
    } catch (e) {
      if (!handleAdminError(e, res)) throw e;
    }
  }),
);

adminRouter.get(
  '/erasure-requests',
  asyncHandler(async (_req, res) => {
    const requests = await prisma.erasureRequest.findMany({
      include: { user: { include: { patientProfile: true } } },
      orderBy: { requestedAt: 'desc' },
    });
    res.json(
      requests.map((r) => ({
        id: r.id,
        status: r.status,
        requestedAt: r.requestedAt,
        purgeScheduledAt: r.purgeScheduledAt,
        purgedAt: r.purgedAt,
        patientId: r.userId,
        patientEmail: r.user.email,
        patientName: r.user.patientProfile ? `${r.user.patientProfile.firstName} ${r.user.patientProfile.lastName}` : null,
      })),
    );
  }),
);

const scheduleErasureSchema = z.object({
  purgeInDays: z.number().min(1).max(365).default(30),
});

// Approving an erasure request is an ADMIN (data-lifecycle) action, not a
// clinical one — schedules the purge job rather than deleting immediately,
// giving a grace window and an audit trail before anything is removed.
// The purge job de-identifies the patient's profile only; clinical results
// are retained per the practice's clinical-records retention obligation —
// see jobs/erasurePurge.ts and PRIVACY.md.
adminRouter.patch(
  '/erasure-requests/:id/schedule',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = scheduleErasureSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const purgeScheduledAt = new Date(Date.now() + parsed.data.purgeInDays * 24 * 60 * 60 * 1000);
    const request = await prisma.erasureRequest.update({
      where: { id: req.params.id },
      data: { status: 'SCHEDULED', purgeScheduledAt },
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'ERASURE_SCHEDULED',
      targetType: 'ErasureRequest',
      targetId: request.id,
      ipAddress: req.ip ?? null,
      metadata: { purgeScheduledAt },
    });

    res.json({ ok: true });
  }),
);

const auditLogQuerySchema = z.object({
  actorEmail: z.string().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// System-wide oversight — every admin/clinician action AND every view of
// patient data, including other admins' own actions. No filtering-out-
// yourself: full transparency between admins, nothing hidden. Deliberately
// NOT itself logged as a view (would recurse pointlessly) — this is system
// oversight data, not patient data.
adminRouter.get(
  '/audit-log',
  roleGuard('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = auditLogQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { actorEmail, action, targetType, from, to, limit, offset } = parsed.data;
    const result = await getSystemAuditLog({
      actorEmail,
      action,
      targetType,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit,
      offset,
    });
    res.json(result);
  }),
);

adminRouter.get(
  '/copy-blocks',
  asyncHandler(async (_req, res) => {
    const blocks = await listCopyBlocks();
    res.json(blocks);
  }),
);

const updateCopyBlockSchema = z.object({ body: z.string().min(1).max(10000) });

adminRouter.patch(
  '/copy-blocks/:slug',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = updateCopyBlockSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const block = await updateCopyBlock(req.params.slug, parsed.data.body, req.user!.id, req.ip ?? null);
    res.json(block);
  }),
);
