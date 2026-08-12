import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { authGuard } from '../../middleware/authGuard.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { verifyCsrf } from '../../middleware/csrf.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { RandoxOrderError, placeOrder, amendOrder, cancelOrder } from './orderService.js';
import { listServiceLocations, listAvailability, holdSlot, confirmBooking, cancelBooking, rescheduleBooking } from './bookingService.js';
import { onOrderStatusChanged } from './pollingJob.js';
import { randoxDateTime } from './clients/parse.js';
import { randoxConfigSummary, enabledCollectionMethods, RandoxConfigError } from './config.js';
import {
  refreshReferenceData,
  catalogueReconciliation,
  listCatalogue,
  setCatalogueMapping,
} from './referenceDataService.js';
import {
  AnalyteMappingError,
  acceptMapping,
  mappingConfidence,
  markersForMapping,
  unmappedQueue,
} from './analyteObservations.js';

/**
 * Staff-facing Randox routes. Ordering, booking and forcing a status check
 * are all administrative actions on patient data, so the whole router sits
 * behind ADMIN/CLINICIAN and every state change is audited.
 *
 * There is deliberately no "release" or "publish" route here. Ingestion
 * stops at PARSED and the one clinician review/release
 * endpoints are the only way past that.
 */
export const randoxRouter = Router();

randoxRouter.use(authGuard, roleGuard('ADMIN', 'CLINICIAN'));

function handleRandoxError(e: unknown, res: import('express').Response): boolean {
  if (e instanceof RandoxOrderError) {
    res.status(e.status).json({ error: e.message });
    return true;
  }
  if (e instanceof RandoxConfigError) {
    res.status(503).json({ error: e.message });
    return true;
  }
  return false;
}

// --- Configuration visibility ---------------------------------------------

// So an admin can see what's still missing (subscription keys, clinic id,
// code list) without reading Railway's env vars. Never returns a secret —
// only whether one is present.
randoxRouter.get(
  '/config',
  roleGuard('ADMIN'),
  asyncHandler(async (_req, res) => {
    try {
      res.json(randoxConfigSummary());
    } catch (e) {
      if (!handleRandoxError(e, res)) throw e;
    }
  }),
);

// Codes Randox have actually sent that aren't in our map. Every one of
// these caused a result to be withheld, so this list is the queue of
// things to chase up with Randox.
randoxRouter.get(
  '/unknown-codes',
  roleGuard('ADMIN'),
  asyncHandler(async (_req, res) => {
    const codes = await prisma.randoxUnknownCode.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 200 });
    res.json(codes);
  }),
);

// --- The analyte map: how much of it a real payload has confirmed ---------

/**
 * THE CONFIDENCE INDICATOR, and it exists because the honest answer was buried
 * in an audit report nobody opens.
 *
 * The analyte map resolves 186 markers from their own catalogue names and had
 * been checked against zero real Randox payloads. That is self-consistency, not
 * confirmation, and 86 of those markers answer to exactly one spelling — so a
 * single difference in how Randox print any of them loses a result to the
 * queue below. This endpoint reports both numbers, from two different sources,
 * and never adds them together: what the code claims, and what a delivery has
 * actually proved.
 */
randoxRouter.get(
  '/analytes/confidence',
  roleGuard('ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json(await mappingConfidence());
  }),
);

/**
 * The exception queue: analyte strings that arrived and matched nothing.
 *
 * Each carries the closest catalogue candidates. They are SUGGESTIONS — from
 * the fuzzy matcher the analyte map itself refuses to use, which is correct
 * here and only here, because an admin is looking at the answer before
 * anything is written. Nothing is pre-selected and nothing is applied.
 */
randoxRouter.get(
  '/analytes/unmapped',
  roleGuard('ADMIN'),
  asyncHandler(async (_req, res) => {
    const [queue, markers] = await Promise.all([unmappedQueue(), markersForMapping()]);
    res.json({ queue, markers });
  }),
);

/**
 * A person accepting one. Audited, because it decides which marker a real
 * patient's result is filed against from here on — and because the whole point
 * of the queue is that nothing gets there automatically.
 */
randoxRouter.post(
  '/analytes/:id/accept',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const body = z.object({ markerKey: z.string().min(1) }).parse(req.body);
    try {
      const queue = await acceptMapping(req.params.id, body.markerKey, req.user!.id);
      await recordAuditLog({
        actorType: 'USER',
        actorUserId: req.user!.id,
        action: 'RANDOX_ANALYTE_MAPPING_ACCEPTED',
        targetType: 'RandoxAnalyteObservation',
        targetId: req.params.id,
        metadata: { markerKey: body.markerKey },
      });
      res.json({ queue });
    } catch (e) {
      if (e instanceof AnalyteMappingError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      throw e;
    }
  }),
);

// --- Randox's own catalogue, and how it lines up with ours ----------------

// Randox's live panel/test list beside ours, with everything that doesn't
// line up called out. Our catalogue was seeded from a pricing email, so
// divergence is expected — this is the screen that makes it visible rather
// than letting it surface as a failed order.
randoxRouter.get(
  '/catalogue',
  roleGuard('ADMIN'),
  asyncHandler(async (_req, res) => {
    try {
      res.json(await catalogueReconciliation());
    } catch (e) {
      if (!handleRandoxError(e, res)) throw e;
    }
  }),
);

const catalogueKindSchema = z.object({
  kind: z.enum(['PANEL', 'TEST', 'BIOLOGICAL_SEX', 'ETHNICITY', 'TESTING_REASON', 'CANCELLATION_REASON', 'CLINIC_LOCATION']),
});

randoxRouter.get(
  '/catalogue/:kind',
  roleGuard('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = catalogueKindSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.json(await listCatalogue(parsed.data.kind));
  }),
);

// Refetches all seven reference sets. Deliberately manual rather than on a
// schedule: it's a handful of calls a few times a year, and an admin
// running it is an admin who is about to look at the result.
randoxRouter.post(
  '/catalogue/refresh',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    try {
      res.json({ summaries: await refreshReferenceData(req.user!.id) });
    } catch (e) {
      if (handleRandoxError(e, res)) return;
      // A partial refresh reports which sets failed rather than pretending
      // the whole thing did — the ones that succeeded were still saved.
      res.status(502).json({ error: e instanceof Error ? e.message : 'Refresh failed.' });
    }
  }),
);

const mappingSchema = z.object({
  // null unmaps. Nothing here is automatic: a name match between
  // "01 LIPIDS" and our "Lipid Profile" is suggestive, not conclusive, and
  // a wrong panel mapping orders the wrong tests for a real patient.
  mappedKey: z.string().min(1).max(200).nullable(),
});

randoxRouter.patch(
  '/catalogue/entry/:id',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = mappingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      await setCatalogueMapping(req.params.id, parsed.data.mappedKey, req.user!.id, req.ip ?? null);
      res.json({ ok: true });
    } catch (e) {
      if (handleRandoxError(e, res)) return;
      res.status(400).json({ error: e instanceof Error ? e.message : 'Could not save that mapping.' });
    }
  }),
);

// Patients who cannot be ordered for yet. CreatePendingOrder requires
// BiologicalSexId, but self-registration asks for sex optionally — so an
// account can exist that no order can be placed against. Surfaced here so
// staff find out before they try, not at the point of ordering.
randoxRouter.get(
  '/patients-not-orderable',
  roleGuard('ADMIN'),
  asyncHandler(async (_req, res) => {
    const patients = await prisma.user.findMany({
      where: { role: 'PATIENT', status: { not: 'DISABLED' }, patientProfile: { sex: null } },
      include: { patientProfile: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(
      patients.map((p) => ({
        patientId: p.id,
        email: p.email,
        displayName: p.patientProfile ? `${p.patientProfile.firstName} ${p.patientProfile.lastName}` : p.email,
        missing: ['biological sex'],
      })),
    );
  }),
);

// --- Orders ---------------------------------------------------------------

const placeOrderSchema = z.object({
  patientId: z.string().uuid(),
  panelKeys: z.array(z.string()).default([]),
  markerKeys: z.array(z.string()).default([]),
  collectionMethod: z.enum(['IN_CLINIC', 'HOME_KIT', 'MOBILE_PHLEBOTOMY']),
});

randoxRouter.post(
  '/orders',
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = placeOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const order = await placeOrder({ ...parsed.data, placedById: req.user!.id });
      res.status(201).json({
        orderNumber: order.orderNumber,
        status: order.status,
        collectionMethod: order.collectionMethod,
        createdAt: order.createdAt,
      });
    } catch (e) {
      if (!handleRandoxError(e, res)) throw e;
    }
  }),
);

randoxRouter.get(
  '/orders',
  asyncHandler(async (_req, res) => {
    const orders = await prisma.randoxOrder.findMany({
      include: {
        patient: { include: { patientProfile: true } },
        appointment: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    res.json(
      orders.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        rawStatusCode: o.rawStatusCode,
        collectionMethod: o.collectionMethod,
        patientName: o.patient.patientProfile
          ? `${o.patient.patientProfile.firstName} ${o.patient.patientProfile.lastName}`
          : o.patient.email,
        reportId: o.reportId,
        createdAt: o.createdAt,
        nextPollAt: o.nextPollAt,
        lastPolledAt: o.lastPolledAt,
        consecutiveFailures: o.consecutiveFailures,
        lastPollError: o.lastPollError,
        // Surfaced explicitly: an order polling has given up on is
        // outstanding but no longer being chased, which is exactly the
        // silent failure the ingestion log exists to prevent.
        pollingStalled: o.nextPollAt === null && !['COMPLETE', 'CANCELLED'].includes(o.status),
        appointment: o.appointment
          ? {
              status: o.appointment.status,
              startUtc: o.appointment.startUtc,
              serviceLocationName: o.appointment.serviceLocationName,
              bookingReference: o.appointment.bookingReference,
              holdExpiresAt: o.appointment.holdExpiresAt,
            }
          : null,
      })),
    );
  }),
);

const amendSchema = z.object({
  panelKeys: z.array(z.string()).optional(),
  markerKeys: z.array(z.string()).optional(),
});

randoxRouter.patch(
  '/orders/:orderNumber',
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = amendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const result = await amendOrder(req.params.orderNumber, parsed.data, req.user!.id);
      // A closed window is a 200 with windowExpired:true, not an error
      // status — the request was well-formed and the answer is "too late".
      res.json(result);
    } catch (e) {
      if (!handleRandoxError(e, res)) throw e;
    }
  }),
);

const cancelSchema = z.object({ reason: z.string().min(1).max(500) });

randoxRouter.post(
  '/orders/:orderNumber/cancel',
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      res.json(await cancelOrder(req.params.orderNumber, parsed.data.reason, req.user!.id));
    } catch (e) {
      if (!handleRandoxError(e, res)) throw e;
    }
  }),
);

// Manual "check this order now", for when someone doesn't want to wait for
// the next scheduled poll. Same code path as the sweep and the future
// webhook — there is only one way results get ingested.
randoxRouter.post(
  '/orders/:orderNumber/refresh',
  verifyCsrf,
  asyncHandler(async (req, res) => {
    try {
      const result = await onOrderStatusChanged(req.params.orderNumber);
      await recordAuditLog({
        actorUserId: req.user!.id,
        action: 'RANDOX_ORDER_REFRESHED',
        targetType: 'RandoxOrder',
        targetId: req.params.orderNumber,
        ipAddress: req.ip ?? null,
        metadata: { statusCode: result.statusCode, ingested: result.ingested },
      });
      res.json(result);
    } catch (e) {
      if (!handleRandoxError(e, res)) throw e;
    }
  }),
);

// --- Booking (in-clinic only) ---------------------------------------------

randoxRouter.get(
  '/collection-methods',
  asyncHandler(async (_req, res) => {
    try {
      res.json({ enabled: enabledCollectionMethods() });
    } catch (e) {
      if (!handleRandoxError(e, res)) throw e;
    }
  }),
);

randoxRouter.get(
  '/service-locations',
  asyncHandler(async (_req, res) => {
    try {
      res.json(await listServiceLocations());
    } catch (e) {
      if (!handleRandoxError(e, res)) throw e;
    }
  }),
);

const availabilityQuery = z.object({
  serviceLocationId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

randoxRouter.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const parsed = availabilityQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      // Slots are UTC. They are returned as UTC and localised at render.
      res.json(await listAvailability(parsed.data.serviceLocationId, parsed.data.from, parsed.data.to));
    } catch (e) {
      if (!handleRandoxError(e, res)) throw e;
    }
  }),
);

const holdSchema = z.object({
  serviceLocationId: z.string().min(1),
  serviceLocationName: z.string().optional(),
  slotReference: z.string().min(1),
  // randoxDateTime, not z.string().datetime(): a Randox timestamp carries an
  // explicit numeric offset and seven fractional digits, which zod's default
  // datetime() rejects. See clients/parse.ts.
  startUtc: randoxDateTime,
});

randoxRouter.post(
  '/orders/:orderNumber/hold',
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = holdSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const { appointment, holdExpiresAtUtc } = await holdSlot({
        orderNumber: req.params.orderNumber,
        ...parsed.data,
        actorUserId: req.user!.id,
      });
      res.json({ appointmentId: appointment.id, startUtc: appointment.startUtc, holdExpiresAtUtc });
    } catch (e) {
      if (!handleRandoxError(e, res)) throw e;
    }
  }),
);

randoxRouter.post(
  '/orders/:orderNumber/book',
  verifyCsrf,
  asyncHandler(async (req, res) => {
    try {
      res.json(await confirmBooking(req.params.orderNumber, req.user!.id));
    } catch (e) {
      if (!handleRandoxError(e, res)) throw e;
    }
  }),
);

randoxRouter.post(
  '/orders/:orderNumber/booking/cancel',
  verifyCsrf,
  asyncHandler(async (req, res) => {
    try {
      res.json(await cancelBooking(req.params.orderNumber, req.user!.id));
    } catch (e) {
      if (!handleRandoxError(e, res)) throw e;
    }
  }),
);

const rescheduleSchema = z.object({
  slotReference: z.string().min(1),
  // randoxDateTime, not z.string().datetime(): a Randox timestamp carries an
  // explicit numeric offset and seven fractional digits, which zod's default
  // datetime() rejects. See clients/parse.ts.
  startUtc: randoxDateTime,
});

randoxRouter.post(
  '/orders/:orderNumber/booking/reschedule',
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = rescheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      res.json(
        await rescheduleBooking(req.params.orderNumber, parsed.data.slotReference, parsed.data.startUtc, req.user!.id),
      );
    } catch (e) {
      if (!handleRandoxError(e, res)) throw e;
    }
  }),
);
