import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { authGuard } from '../../middleware/authGuard.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { verifyCsrf } from '../../middleware/csrf.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { decryptField } from '../../lib/crypto.js';
import { resolveReferenceRange, ageFromDob, RANGE_UNAVAILABLE_MESSAGE } from '../../lib/resolveReferenceRange.js';

export const panelsRouter = Router();

panelsRouter.use(authGuard, roleGuard('ADMIN', 'CLINICIAN'));

panelsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const panels = await prisma.panel.findMany({
      where: { isActive: true },
      include: {
        markers: { where: { marker: { isActive: true } }, include: { marker: true }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(panels);
  }),
);

panelsRouter.get(
  '/markers',
  asyncHandler(async (req, res) => {
    const markers = await prisma.marker.findMany({
      where: req.query.all === 'true' ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(markers);
  }),
);

/**
 * The clinical team's worklist of marker copy awaiting sign-off.
 *
 * reviewStatus no longer gates whether a patient sees the copy — written copy
 * is shown, and the alternative was a placeholder line on the most-read card
 * of the report (see patients/service.ts and portalService.ts). What it
 * records is who has actually read which wording, which is a genuine clinical
 * fact and is exactly what this queue is a view of: everything still DRAFT is
 * everything no clinician has yet checked. Approving here is still the only
 * way anything leaves DRAFT, still per-marker in the audit log, and still
 * restricted to ADMIN and CLINICIAN.
 *
 * Declared above '/markers/:markerId/...' so 'explanations' is never
 * captured as a marker id.
 */
panelsRouter.get(
  '/markers/explanations',
  asyncHandler(async (_req, res) => {
    const markers = await prisma.marker.findMany({
      where: { isActive: true },
      include: { explanation: true },
      orderBy: { name: 'asc' },
    });

    // MarkerExplanation.reviewedById is a plain id column with no Prisma
    // relation behind it, so reviewer names are resolved in one extra
    // lookup rather than an include.
    const reviewerIds = [
      ...new Set(markers.map((m) => m.explanation?.reviewedById).filter((id): id is string => !!id)),
    ];
    const reviewers = reviewerIds.length
      ? await prisma.user.findMany({ where: { id: { in: reviewerIds } }, include: { staffProfile: true } })
      : [];
    const reviewerById = new Map(
      reviewers.map((u) => [
        u.id,
        u.staffProfile ? `${u.staffProfile.firstName} ${u.staffProfile.lastName}` : u.email,
      ]),
    );

    res.json(
      markers.map((m) => ({
        markerId: m.id,
        markerName: m.name,
        markerKey: m.key,
        hasExplanation: !!m.explanation,
        whatItIs: m.explanation?.whatItIs ?? '',
        highMeans: m.explanation?.highMeans ?? null,
        lowMeans: m.explanation?.lowMeans ?? null,
        lifestyleContext: m.explanation?.lifestyleContext ?? null,
        reviewStatus: m.explanation?.reviewStatus ?? 'DRAFT',
        version: m.explanation?.version ?? 0,
        reviewedAt: m.explanation?.reviewedAt ?? null,
        reviewedByName: m.explanation?.reviewedById ? (reviewerById.get(m.explanation.reviewedById) ?? null) : null,
      })),
    );
  }),
);

const bulkReviewSchema = z.object({
  markerIds: z.array(z.string().uuid()).min(1).max(200),
  reviewStatus: z.enum(['DRAFT', 'REVIEWED', 'PUBLISHED']),
});

/**
 * Approve a page of the queue in one action. Bulk in the UI, but never bulk
 * in the audit log — one entry per explanation, naming the reviewer, so the
 * record of who signed off which patient-facing wording stays per-marker
 * exactly as it is for a single approval.
 */
panelsRouter.post(
  '/markers/explanations/review',
  roleGuard('ADMIN', 'CLINICIAN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = bulkReviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const explanations = await prisma.markerExplanation.findMany({
      where: { markerId: { in: parsed.data.markerIds } },
    });

    const now = new Date();
    let updated = 0;
    for (const explanation of explanations) {
      if (explanation.reviewStatus === parsed.data.reviewStatus) continue;
      await prisma.markerExplanation.update({
        where: { id: explanation.id },
        data: { reviewStatus: parsed.data.reviewStatus, reviewedById: req.user!.id, reviewedAt: now },
      });
      await recordAuditLog({
        actorUserId: req.user!.id,
        action: 'MARKER_EXPLANATION_REVIEW_STATUS_CHANGED',
        targetType: 'MarkerExplanation',
        targetId: explanation.id,
        ipAddress: req.ip ?? null,
        metadata: {
          markerId: explanation.markerId,
          from: explanation.reviewStatus,
          reviewStatus: parsed.data.reviewStatus,
          bulk: true,
        },
      });
      updated += 1;
    }

    // Markers with no explanation row at all can't be approved into
    // existence — reported back so the UI can say so rather than silently
    // showing a smaller number than the user selected.
    const missing = parsed.data.markerIds.length - explanations.length;
    res.json({ ok: true, updated, unchanged: explanations.length - updated, missing });
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
  // Lets an admin confirm composition is correct as-is (no marker changes
  // needed) without that being indistinguishable from "never reviewed".
  compositionConfirmed: z.boolean().optional(),
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
  isActive: z.boolean().optional(),
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

    const [panelMarker] = await prisma.$transaction([
      prisma.panelMarker.create({ data: { panelId: req.params.panelId, ...parsed.data } }),
      prisma.panel.update({ where: { id: req.params.panelId }, data: { compositionConfirmed: true } }),
    ]);

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

    const [panelMarker] = await prisma.$transaction([
      prisma.panelMarker.update({ where: { id: req.params.panelMarkerId }, data: parsed.data }),
      prisma.panel.update({ where: { id: req.params.panelId }, data: { compositionConfirmed: true } }),
    ]);

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
    await prisma.$transaction([
      prisma.panelMarker.delete({ where: { id: req.params.panelMarkerId } }),
      prisma.panel.update({ where: { id: req.params.panelId }, data: { compositionConfirmed: true } }),
    ]);

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

// Editing content resets reviewStatus to DRAFT: whoever signed the previous
// wording off did not sign this one off, so the record must stop claiming they
// did and the marker returns to the review queue. Patients see the edited copy
// straight away, as they do all written copy, which is why the reset matters
// as a record rather than as a gate.
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

// Convenience pre-fill for the verify / manual-entry forms — resolves the
// best sex/age-matching range from the marker's catalogue (Content &
// configuration) for the given patient. Never authoritative: whatever the
// admin confirms at verify time is what actually gets saved on the report
// (reports/service.ts verifyReport), same as the PDF-parse marker-name
// match this mirrors in spirit (matchMarker.ts).
panelsRouter.get(
  '/markers/:markerId/resolved-range',
  asyncHandler(async (req, res) => {
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;

    const marker = await prisma.marker.findUnique({
      where: { id: req.params.markerId },
      include: { referenceRanges: true },
    });
    if (!marker) return res.status(404).json({ error: 'Marker not found' });

    // No patient named means no patient to resolve against — say that rather
    // than letting it fall through and come back as "this patient has no sex
    // on file", which would be a statement about a patient nobody asked about.
    if (!patientId) {
      return res.json({
        status: 'unavailable',
        reason: 'NO_PATIENT',
        message: 'No patient given, so there is nothing to resolve a range against.',
      });
    }

    let sex: 'MALE' | 'FEMALE' | 'ANY' | null = null;
    let age: number | null = null;
    const patient = await prisma.user.findUnique({ where: { id: patientId }, include: { patientProfile: true } });
    if (patient?.patientProfile) {
      sex = patient.patientProfile.sex ?? null;
      age = ageFromDob(decryptField(patient.patientProfile.dobEncrypted));
    }

    const resolved = resolveReferenceRange(marker.referenceRanges, sex, age);
    if (resolved.status === 'unavailable') {
      // 200 with a reason, not a bare null. "We can't suggest one" is a real
      // answer and WHY is the whole point: a null was indistinguishable
      // between "this marker has no catalogue entry" and "this patient has
      // no sex on file", and the second of those is something the admin can
      // actually do something about.
      return res.json({
        status: 'unavailable',
        reason: resolved.reason,
        message: RANGE_UNAVAILABLE_MESSAGE[resolved.reason],
      });
    }
    res.json({
      status: 'resolved',
      referenceRangeId: resolved.range.id,
      low: resolved.range.low,
      high: resolved.range.high,
      unit: resolved.range.unit,
    });
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

// Clinician sign-off for patient-facing marker copy. Records that a named
// clinician read a particular wording on a particular date; it does not
// control whether the wording is on screen.
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
