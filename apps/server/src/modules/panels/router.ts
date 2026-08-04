import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { authGuard } from '../../middleware/authGuard.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { verifyCsrf } from '../../middleware/csrf.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { recordAuditLog } from '../../lib/auditLog.js';

export const panelsRouter = Router();

panelsRouter.use(authGuard, roleGuard('ADMIN', 'CLINICIAN'));

panelsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const panels = await prisma.panel.findMany({
      where: { isActive: true },
      include: { markers: { include: { marker: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json(panels);
  }),
);

panelsRouter.get(
  '/markers',
  asyncHandler(async (_req, res) => {
    const markers = await prisma.marker.findMany({ orderBy: { name: 'asc' } });
    res.json(markers);
  }),
);

// Phase 2 §2.2: sources are data — admin can add one without a deploy.
panelsRouter.get(
  '/sources',
  asyncHandler(async (_req, res) => {
    const sources = await prisma.source.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    res.json(sources);
  }),
);

const createSourceSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only'),
  name: z.string().min(1).max(200),
});

panelsRouter.post(
  '/sources',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = createSourceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.source.findUnique({ where: { key: parsed.data.key } });
    if (existing) return res.status(409).json({ error: 'A source with this key already exists' });

    const source = await prisma.source.create({ data: parsed.data });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'SOURCE_CREATED',
      targetType: 'Source',
      targetId: source.id,
      ipAddress: req.ip ?? null,
      metadata: { key: source.key, name: source.name },
    });

    res.status(201).json(source);
  }),
);

const reviewExplanationSchema = z.object({
  reviewStatus: z.enum(['DRAFT', 'REVIEWED', 'PUBLISHED']),
});

// Clinician sign-off gate for patient-facing marker copy (brief §4: draft
// explanation content must not reach patients until a clinician reviews
// it). Kept minimal — a text-editing UI is a natural follow-up, not core
// to the release-safety requirement this endpoint exists for.
panelsRouter.patch(
  '/markers/:markerId/explanation/review-status',
  roleGuard('CLINICIAN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = reviewExplanationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const explanation = await prisma.markerExplanation.update({
      where: { markerId: req.params.markerId },
      data: {
        reviewStatus: parsed.data.reviewStatus,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
      },
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'MARKER_EXPLANATION_REVIEW_STATUS_CHANGED',
      targetType: 'MarkerExplanation',
      targetId: explanation.id,
      ipAddress: req.ip ?? null,
      metadata: { reviewStatus: parsed.data.reviewStatus },
    });

    res.json({ ok: true });
  }),
);
