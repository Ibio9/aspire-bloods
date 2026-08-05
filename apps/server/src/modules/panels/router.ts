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

panelsRouter.get(
  '/markers/:markerId/explanation',
  asyncHandler(async (req, res) => {
    const explanation = await prisma.markerExplanation.findUnique({ where: { markerId: req.params.markerId } });
    res.json(
      explanation ?? {
        markerId: req.params.markerId,
        whatItIs: '',
        highMeans: null,
        lowMeans: null,
        lifestyleContext: null,
        reviewStatus: 'DRAFT',
      },
    );
  }),
);

// Unlike GET / (active only — what upload/manual-entry pickers use), this
// includes inactive panels too, so the config page can re-activate one.
panelsRouter.get(
  '/all',
  asyncHandler(async (_req, res) => {
    const panels = await prisma.panel.findMany({
      include: { markers: { include: { marker: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json(panels);
  }),
);

const createPanelSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens only'),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

panelsRouter.post(
  '/',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = createPanelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.panel.findUnique({ where: { key: parsed.data.key } });
    if (existing) return res.status(409).json({ error: 'A panel with this key already exists' });

    const panel = await prisma.panel.create({ data: parsed.data });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'PANEL_CREATED',
      targetType: 'Panel',
      targetId: panel.id,
      ipAddress: req.ip ?? null,
      metadata: { key: panel.key, name: panel.name },
    });

    res.status(201).json(panel);
  }),
);

const updatePanelSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

panelsRouter.patch(
  '/:id',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = updatePanelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const panel = await prisma.panel.update({ where: { id: req.params.id }, data: parsed.data });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'PANEL_UPDATED',
      targetType: 'Panel',
      targetId: panel.id,
      ipAddress: req.ip ?? null,
      metadata: parsed.data,
    });

    res.json(panel);
  }),
);

const createMarkerSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens only'),
  name: z.string().min(1).max(200),
  defaultUnit: z.string().min(1).max(30),
  severityMultiplier: z.number().min(0).optional(),
  crossSourceComparable: z.boolean().optional(),
});

panelsRouter.post(
  '/markers',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = createMarkerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.marker.findUnique({ where: { key: parsed.data.key } });
    if (existing) return res.status(409).json({ error: 'A marker with this key already exists' });

    const marker = await prisma.marker.create({ data: parsed.data });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'MARKER_CREATED',
      targetType: 'Marker',
      targetId: marker.id,
      ipAddress: req.ip ?? null,
      metadata: { key: marker.key, name: marker.name },
    });

    res.status(201).json(marker);
  }),
);

const updateMarkerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  defaultUnit: z.string().min(1).max(30).optional(),
  severityMultiplier: z.number().min(0).optional(),
  severityAbsoluteDelta: z.number().min(0).nullable().optional(),
  crossSourceComparable: z.boolean().optional(),
});

panelsRouter.patch(
  '/markers/:id',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = updateMarkerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const marker = await prisma.marker.update({ where: { id: req.params.id }, data: parsed.data });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'MARKER_UPDATED',
      targetType: 'Marker',
      targetId: marker.id,
      ipAddress: req.ip ?? null,
      metadata: parsed.data,
    });

    res.json(marker);
  }),
);

const addPanelMarkerSchema = z.object({
  markerId: z.string().uuid(),
  sortOrder: z.number().int().optional(),
  isAddOn: z.boolean().optional(),
});

panelsRouter.post(
  '/:panelId/markers',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = addPanelMarkerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const panelMarker = await prisma.panelMarker.create({
      data: { panelId: req.params.panelId, ...parsed.data },
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'PANEL_MARKER_ADDED',
      targetType: 'Panel',
      targetId: req.params.panelId,
      ipAddress: req.ip ?? null,
      metadata: { markerId: parsed.data.markerId },
    });

    res.status(201).json(panelMarker);
  }),
);

const updatePanelMarkerSchema = z.object({
  sortOrder: z.number().int().optional(),
  isAddOn: z.boolean().optional(),
});

panelsRouter.patch(
  '/:panelId/markers/:panelMarkerId',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = updatePanelMarkerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const panelMarker = await prisma.panelMarker.update({
      where: { id: req.params.panelMarkerId },
      data: parsed.data,
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'PANEL_MARKER_REORDERED',
      targetType: 'Panel',
      targetId: req.params.panelId,
      ipAddress: req.ip ?? null,
      metadata: { panelMarkerId: req.params.panelMarkerId, ...parsed.data },
    });

    res.json(panelMarker);
  }),
);

panelsRouter.delete(
  '/:panelId/markers/:panelMarkerId',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    await prisma.panelMarker.delete({ where: { id: req.params.panelMarkerId } });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'PANEL_MARKER_REMOVED',
      targetType: 'Panel',
      targetId: req.params.panelId,
      ipAddress: req.ip ?? null,
      metadata: { panelMarkerId: req.params.panelMarkerId },
    });

    res.json({ ok: true });
  }),
);

const createReferenceRangeSchema = z.object({
  sex: z.enum(['MALE', 'FEMALE', 'ANY']).optional(),
  ageMin: z.number().int().min(0).optional(),
  ageMax: z.number().int().min(0).optional(),
  unit: z.string().min(1).max(30),
  low: z.number(),
  high: z.number(),
  source: z.string().max(500).optional(),
});

panelsRouter.post(
  '/markers/:markerId/reference-ranges',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = createReferenceRangeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    if (parsed.data.low >= parsed.data.high) {
      return res.status(400).json({ error: 'low must be less than high' });
    }

    const range = await prisma.referenceRange.create({
      data: { markerId: req.params.markerId, ...parsed.data },
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'REFERENCE_RANGE_UPDATED',
      targetType: 'Marker',
      targetId: req.params.markerId,
      ipAddress: req.ip ?? null,
      metadata: { action: 'created', referenceRangeId: range.id, ...parsed.data },
    });

    res.status(201).json(range);
  }),
);

const updateReferenceRangeSchema = z.object({
  unit: z.string().min(1).max(30).optional(),
  low: z.number().optional(),
  high: z.number().optional(),
});

panelsRouter.patch(
  '/reference-ranges/:id',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = updateReferenceRangeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.referenceRange.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Reference range not found' });
    const low = parsed.data.low ?? existing.low;
    const high = parsed.data.high ?? existing.high;
    if (low >= high) return res.status(400).json({ error: 'low must be less than high' });

    const range = await prisma.referenceRange.update({ where: { id: req.params.id }, data: parsed.data });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'REFERENCE_RANGE_UPDATED',
      targetType: 'Marker',
      targetId: range.markerId,
      ipAddress: req.ip ?? null,
      metadata: { action: 'updated', referenceRangeId: range.id, ...parsed.data },
    });

    res.json(range);
  }),
);

const updateExplanationSchema = z.object({
  whatItIs: z.string().min(1).max(5000),
  highMeans: z.string().max(5000).nullable().optional(),
  lowMeans: z.string().max(5000).nullable().optional(),
  lifestyleContext: z.string().max(5000).nullable().optional(),
});

// Editing content resets reviewStatus to DRAFT — a clinician/admin must
// re-approve before edited copy is patient-visible again (getMarkerTrendForPatient
// only shows REVIEWED/PUBLISHED explanations). Prevents a text edit from
// silently staying "published" without anyone having actually looked at
// the new wording.
panelsRouter.patch(
  '/markers/:markerId/explanation',
  roleGuard('ADMIN', 'CLINICIAN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = updateExplanationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const explanation = await prisma.markerExplanation.upsert({
      where: { markerId: req.params.markerId },
      update: { ...parsed.data, reviewStatus: 'DRAFT', reviewedById: null, reviewedAt: null, version: { increment: 1 } },
      create: { markerId: req.params.markerId, ...parsed.data },
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'MARKER_EXPLANATION_UPDATED',
      targetType: 'MarkerExplanation',
      targetId: explanation.id,
      ipAddress: req.ip ?? null,
    });

    res.json(explanation);
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
  roleGuard('ADMIN', 'CLINICIAN'),
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
