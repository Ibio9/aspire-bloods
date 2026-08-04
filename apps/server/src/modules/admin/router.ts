import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { authGuard } from '../../middleware/authGuard.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { verifyCsrf } from '../../middleware/csrf.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { recordAuditLog } from '../../lib/auditLog.js';

export const adminRouter = Router();

adminRouter.use(authGuard, roleGuard('ADMIN', 'CLINICIAN'));

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
        displayName: p.patientProfile ? `${p.patientProfile.firstName} ${p.patientProfile.lastName}` : '(pending activation)',
      })),
    );
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
