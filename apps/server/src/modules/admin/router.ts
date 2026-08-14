import { Router } from 'express';
import { z } from 'zod';
import { linkResultRequestSchema, unlinkResultRequestSchema } from '@aspire-bloods/shared';
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
  listIngestionLog,
  getLastDemoSeedRun,
} from './service.js';
import {
  getLinkingQueue,
  linkResultToPatient,
  unlinkResult,
  dismissUnmatchedResult,
} from './linkingService.js';
import { runDemoSeed } from './demoSeedService.js';
import { getWorkQueue } from './workQueueService.js';
import { analyticsToCsv, getPracticeAnalytics } from './analyticsService.js';

export const adminRouter = Router();

adminRouter.use(authGuard, roleGuard('ADMIN', 'CLINICIAN'));

function handleAdminError(e: unknown, res: import('express').Response) {
  if (e instanceof AdminError) {
    res.status(e.status).json({ error: e.message });
    return true;
  }
  return false;
}

// Every patient the practice has, by name and email address. That is a view
// of patient data — the most complete one in the product — so it is audited
// like the linking queue and the individual profile, not exempted for being
// "just a list". No targetId, because the target is all of them; the count
// goes in the metadata so the entry says how much was disclosed.
adminRouter.get(
  '/patients',
  asyncHandler(async (req, res) => {
    const patients = await prisma.user.findMany({
      where: { role: 'PATIENT' },
      include: { patientProfile: true },
      orderBy: { createdAt: 'desc' },
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'PATIENT_DATA_VIEWED',
      targetType: 'User',
      ipAddress: req.ip ?? null,
      metadata: { view: 'patient_list', patientCount: patients.length },
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

// Deployment state, not patient data — no audit entry, because there is no
// patient in it to view. The masked address is the only identifier it carries.
adminRouter.get(
  '/demo-seed',
  asyncHandler(async (_req, res) => {
    res.json(await getLastDemoSeedRun());
  }),
);

// One-shot re-run of the demo seed against this deployment — the break-glass
// path when demo data has gone missing and nobody wants to redeploy to find
// out why. Synthetic data only ever lands on the single demo account, the
// run is idempotent (it replaces the demo reports, never stacks them), and
// its outcome is recorded to the same DemoSeedRun row the dashboard shows.
adminRouter.post(
  '/demo-seed/run',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'DEMO_SEED_TRIGGERED',
      targetType: 'DemoSeedRun',
      targetId: 'last',
      ipAddress: req.ip ?? null,
    });
    const summary = await runDemoSeed({ trigger: 'admin' });
    res.status(summary.outcome === 'FAILED' ? 500 : 200).json(summary);
  }),
);

// ---------------------------------------------------------------------------
// Result linking — accounts with nothing attached, beside results with nobody
// attached. See modules/admin/linkingService.ts for the matching rules; this
// router does no matching of its own.
// ---------------------------------------------------------------------------

// Shows every unlinked patient's name, date of birth and contact number side
// by side — about as concentrated a view of patient data as exists in this
// app, so it's audited like any other, not treated as "just a worklist".
// How many results are waiting, and why — and NOTHING about any of them.
//
// Separate from GET /linking on purpose. That endpoint returns claimed names
// and dates of birth, so it is audited as a view of patient data, correctly.
// The admin console's home screen wants only the number, and pointing it at
// the full queue would have written a PATIENT_DATA_VIEWED entry every time
// anybody opened the console — which does not just make the audit log noisy,
// it makes it wrong: the log would claim someone read a queue of patients
// when a card on a dashboard counted it. No patient data leaves here, so
// there is nothing to audit.
adminRouter.get(
  '/linking/count',
  roleGuard('ADMIN'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.unmatchedResult.groupBy({
      by: ['reason'],
      where: { status: 'PENDING' },
      _count: { _all: true },
    });
    res.json({
      pending: rows.reduce((sum, r) => sum + r._count._all, 0),
      byReason: Object.fromEntries(rows.map((r) => [r.reason ?? 'UNRECORDED', r._count._all])),
    });
  }),
);

adminRouter.get(
  '/linking',
  asyncHandler(async (req, res) => {
    const queue = await getLinkingQueue();
    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'PATIENT_DATA_VIEWED',
      targetType: 'User',
      ipAddress: req.ip ?? null,
      metadata: {
        view: 'result_linking_queue',
        unlinkedAccounts: queue.unlinkedAccounts.length,
        unmatchedResults: queue.unmatchedResults.length,
      },
    });
    res.json(queue);
  }),
);

// ADMIN only, not CLINICIAN: deciding whose results these are is a records
// action, and it's the one the practice most wants a single accountable
// identity attached to.
adminRouter.post(
  '/linking/:id/link',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = linkResultRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const result = await linkResultToPatient(
        req.params.id,
        { patientId: parsed.data.patientId, confirmedDob: parsed.data.confirmedDob },
        req.user!.id,
        req.ip ?? null,
      );
      res.status(201).json({ ok: true, ...result });
    } catch (e) {
      if (!handleAdminError(e, res)) throw e;
    }
  }),
);

adminRouter.post(
  '/linking/:id/unlink',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = unlinkResultRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const result = await unlinkResult(req.params.id, parsed.data.reason, req.user!.id, req.ip ?? null);
      res.json({ ok: true, ...result });
    } catch (e) {
      if (!handleAdminError(e, res)) throw e;
    }
  }),
);

adminRouter.post(
  '/linking/:id/dismiss',
  roleGuard('ADMIN'),
  verifyCsrf,
  asyncHandler(async (req, res) => {
    const parsed = unlinkResultRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      await dismissUnmatchedResult(req.params.id, parsed.data.reason, req.user!.id, req.ip ?? null);
      res.json({ ok: true });
    } catch (e) {
      if (!handleAdminError(e, res)) throw e;
    }
  }),
);

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

// Erasure is a data-lifecycle matter, ADMIN and not CLINICIAN — matching the
// schedule action below, which was already guarded that way while the list
// that feeds it was not. And it is a view of patient data (names, email
// addresses), so it is audited like every other one rather than exempted for
// being a list of requests rather than of people.
adminRouter.get(
  '/erasure-requests',
  roleGuard('ADMIN'),
  asyncHandler(async (req, res) => {
    const requests = await prisma.erasureRequest.findMany({
      include: { user: { include: { patientProfile: true } } },
      orderBy: { requestedAt: 'desc' },
    });
    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'ADMIN_VIEW_ERASURE_REQUESTS',
      targetType: 'ErasureRequest',
      ipAddress: req.ip ?? null,
      metadata: { count: requests.length },
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

// Phase 3 §3: automated-source ingestion attempts, success or not — ADMIN
// only, same as the system audit log this sits alongside.
adminRouter.get(
  '/ingestion-log',
  roleGuard('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.json(await listIngestionLog(parsed.data.limit, parsed.data.offset));
  }),
);

// THE CLINICIAN WORK QUEUE — what is waiting, and what is stuck.
//
// It names patients, so it is a view of patient data and is audited like the
// patient list rather than exempted for being a queue. No targetId: the target
// is every open report, and the count goes in the metadata so the entry says
// how much was disclosed. CLINICIAN as well as ADMIN — it is their queue.
adminRouter.get(
  '/work-queue',
  asyncHandler(async (req, res) => {
    const queue = await getWorkQueue();
    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'PATIENT_DATA_VIEWED',
      targetType: 'Report',
      ipAddress: req.ip ?? null,
      metadata: { view: 'work_queue', reportCount: queue.reports.length },
    });
    res.json(queue);
  }),
);

/**
 * ── PRACTICE ANALYTICS (Aug 2026) ──────────────────────────────────────────
 *
 * AGGREGATE ONLY. No row this returns names a patient or carries a value, and
 * small cells are suppressed before they leave the service — see
 * `SUPPRESS_BELOW` in analyticsService.ts.
 *
 * AND IT IS STILL AUDITED. "Every admin view of patient data is audited" is a
 * rule about the ACT of looking, not about the shape of what comes back: a
 * screen saying which markers most often come back out of range is derived
 * entirely from patients' results, and the practice is accountable for who read
 * it. `ANALYTICS_VIEWED` rather than `PATIENT_DATA_VIEWED`, because the entry
 * has to say which of the two happened — an audit log where reading one
 * patient's file and reading a rate per thousand look identical is a log that
 * cannot answer the question it exists for.
 *
 * The window is a query parameter with a documented default and a hard cap: an
 * unbounded `days` is a request to scan every report the practice has ever
 * taken, from an unauthenticated-by-content query string.
 */
const analyticsWindowSchema = z.object({
  days: z.coerce.number().int().min(7).max(1095).default(90),
});

adminRouter.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const parsed = analyticsWindowSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: 'The analytics window must be a whole number of days between 7 and 1095.' });
      return;
    }
    const analytics = await getPracticeAnalytics(parsed.data.days);
    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'ANALYTICS_VIEWED',
      targetType: 'Report',
      ipAddress: req.ip ?? null,
      metadata: { view: 'practice_analytics', windowDays: parsed.data.days, format: 'json' },
    });
    res.json(analytics);
  }),
);

/**
 * THE SAME NUMBERS, AS A FILE. Rendered from ONE call to the same service, so
 * the spreadsheet cannot disagree with the screen — see `analyticsToCsv`.
 *
 * Audited separately from the JSON view, and the metadata says which: a
 * download leaves the building and a page view does not, and "who exported the
 * practice's figures" is a different question from "who looked at them".
 */
adminRouter.get(
  '/analytics.csv',
  asyncHandler(async (req, res) => {
    const parsed = analyticsWindowSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: 'The analytics window must be a whole number of days between 7 and 1095.' });
      return;
    }
    const analytics = await getPracticeAnalytics(parsed.data.days);
    await recordAuditLog({
      actorUserId: req.user!.id,
      action: 'ANALYTICS_EXPORTED',
      targetType: 'Report',
      ipAddress: req.ip ?? null,
      metadata: { view: 'practice_analytics', windowDays: parsed.data.days, format: 'csv' },
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="aspire-analytics-${analytics.window.from}-to-${analytics.window.to}.csv"`,
    );
    // A BOM, so Excel reads the file as UTF-8 rather than as the system
    // codepage. Without it "Anti-Müllerian Hormone" and every en dash in the
    // file open as mojibake, which is the one failure a spreadsheet export
    // cannot afford: it looks like the data is wrong.
    // Written as an ESCAPE, never as the literal character: a BOM typed into a
    // source file is an invisible glyph that lint flags and a reviewer cannot
    // see, which is the worst way to write down something load-bearing.
    res.send(`\ufeff${analyticsToCsv(analytics)}`);
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
