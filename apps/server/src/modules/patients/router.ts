import { Router } from 'express';
import { z } from 'zod';
import { updateBiologicalSexSchema, toRandoxBiologicalSexId } from '@aspire-bloods/shared';
import { authGuard } from '../../middleware/authGuard.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { verifyCsrf } from '../../middleware/csrf.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { prisma } from '../../db/client.js';
import { generateFileToken } from '../../lib/signedUrl.js';
import { generateAllMarkersPdf, generateAspireSummaryPdf } from '../export/pdfSummary.js';
import { generateGpHandoverPdf } from '../export/gpHandover.js';
import { pdfFailure, streamPdf } from '../../lib/pdfResponse.js';
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
      // OPENING THE REPORT SPENDS ITS RESULTS-READY MOMENT. A patient who
      // reached their results from an emailed link, a bookmark or the reports
      // list has seen that they are ready, and announcing it to them on their
      // next sign-in would be the product telling them something they told IT.
      await markResultsReadySeen(req.user!.id, req.params.id);
      res.json(report);
    } catch (e) {
      if (!handleAccessError(e, res)) throw e;
    }
  }),
);

/**
 * ---------------------------------------------------------------------------
 * THE RESULTS-READY MOMENT — ONCE PER REPORT, AND NEVER AGAIN.
 * ---------------------------------------------------------------------------
 *
 * `updateMany` with the null in the WHERE clause rather than `update`, for two
 * reasons that are both about it being idempotent by construction: the first
 * stamp is the fact ("when were they first told"), and a patient who opens the
 * same report twice must not have that moved; and it is scoped to the caller's
 * own row, so a report id belonging to somebody else matches nothing rather
 * than throwing. RELEASED only — a report at any earlier stage has no moment to
 * spend and stamping one would silently swallow the announcement it will make
 * when it is finally released.
 */
async function markResultsReadySeen(patientId: string, reportId: string): Promise<void> {
  await prisma.report.updateMany({
    where: { id: reportId, patientId, status: 'RELEASED', voidedAt: null, resultsReadySeenAt: null },
    data: { resultsReadySeenAt: new Date() },
  });
}

/**
 * THE ONE REPORT THE MOMENT WOULD BE ABOUT, or null.
 *
 * The most recently RELEASED report this patient has never opened. Newest
 * rather than oldest: if three landed while they were away, the moment is about
 * the fact that results are ready and the newest is the one they came for — and
 * the other two are marked seen with it, because showing the same screen three
 * times in a row is a queue rather than a moment.
 */
patientsRouter.get(
  '/results-ready',
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findFirst({
      where: { patientId: req.user!.id, status: 'RELEASED', voidedAt: null, resultsReadySeenAt: null },
      orderBy: [{ releasedAt: 'desc' }, { sampleDate: 'desc' }],
      select: { id: true, sampleDate: true, releasedAt: true, panel: { select: { name: true } } },
    });
    if (!report) return res.json({ report: null });
    res.json({
      report: {
        reportId: report.id,
        panelName: report.panel?.name ?? null,
        sampleDate: report.sampleDate.toISOString(),
        releasedAt: report.releasedAt?.toISOString() ?? null,
      },
    });
  }),
);

/**
 * SPEND IT. Called by the moment on both of its exits — the button that opens
 * the results and the one that dismisses — because "dismissing it, or viewing
 * the results, means it never appears for that report again" is one rule with
 * two doors, not two rules.
 *
 * Every unopened released report is stamped, not only the one named. See above:
 * the moment is about results being ready, and it is shown once.
 */
patientsRouter.post(
  '/results-ready/seen',
  verifyCsrf,
  asyncHandler(async (req, res) => {
    await prisma.report.updateMany({
      where: { patientId: req.user!.id, status: 'RELEASED', voidedAt: null, resultsReadySeenAt: null },
      data: { resultsReadySeenAt: new Date() },
    });
    res.json({ ok: true });
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

/**
 * THE INTRODUCTION HAS BEEN SEEN.
 *
 * Idempotent, and stamped only the first time: pressing "continue" twice, or
 * opening it again later from Understanding results, must not move the date —
 * "when were they first shown this" is the fact, and it is the one an audit
 * would ask for. Dismissing counts as seen, which is why the client calls this
 * from both the finish and the skip.
 *
 * No CSRF exemption and no special casing: it is an ordinary authenticated
 * POST that writes one column on the caller's own row.
 */
patientsRouter.post(
  '/walkthrough-seen',
  verifyCsrf,
  asyncHandler(async (req, res) => {
    await prisma.user.updateMany({
      where: { id: req.user!.id, walkthroughSeenAt: null },
      data: { walkthroughSeenAt: new Date() },
    });
    res.json({ ok: true });
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

    // Rendering is the one step here that hands work to a streaming library,
    // and it is caught explicitly rather than left to the global boundary:
    // "That download could not be prepared" is a sentence the client already
    // shows verbatim, and "Something went wrong" is not. See lib/pdfRender.ts
    // for what can go wrong inside and lib/pdfResponse.ts for the answer.
    let file;
    try {
      const pdfBuffer = await generateAspireSummaryPdf(report.id);
      const { storageKey, sizeBytes } = await storageAdapter.save(pdfBuffer, {
        originalFilename: `aspire-summary-${report.id}.pdf`,
        mimeType: 'application/pdf',
      });
      file = await prisma.storedFile.create({
        data: {
          kind: 'ASPIRE_SUMMARY_PDF',
          storageKey,
          originalFilename: `aspire-summary-${report.sampleDate.toISOString().slice(0, 10)}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes,
          generatedForReportId: report.id,
        },
      });
    } catch (e) {
      return pdfFailure(res, `Aspire summary for report ${report.id}`, e);
    }

    res.json({ url: `/api/files/download?token=${generateFileToken(file.id)}` });
  }),
);

/**
 * THE GP HANDOVER SUMMARY — one page, for a doctor.
 *
 * STREAMED, NOT STORED, and that is the difference from the patient summary
 * above. The summary letter is cached as a StoredFile because it is the
 * patient's own copy of a released report and belongs in their DSAR export;
 * this is a derived VIEW of the same report, generated for a conversation, and
 * a pile of near-identical one-page extracts in somebody's data export is noise
 * rather than a record. There is also nothing here that the report and the
 * clinic's contact details do not already contain.
 *
 * Same guard as every other document route: the caller's own report, and only
 * once it has been RELEASED. A handover summary of an unreleased report would
 * be a route around the one human gate.
 */
patientsRouter.get(
  '/reports/:id/gp-handover-pdf',
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report || report.patientId !== req.user!.id || report.status !== 'RELEASED' || report.voidedAt) {
      return res.status(404).json({ error: 'Not found' });
    }
    await auditIfAdminViewer(req, 'own_gp_handover_pdf', 'Report', report.id);
    await streamPdf(res, {
      filename: `aspire-gp-summary-${report.sampleDate.toISOString().slice(0, 10)}.pdf`,
      what: `GP handover summary for report ${report.id}`,
      generate: () => generateGpHandoverPdf(report.id),
    });
  }),
);

/**
 * Every marker, on paper — the By marker view's own download.
 *
 * NOT cached to a StoredFile the way the report summary is, and the difference
 * is the point. A report is immutable once released (only an amendment
 * changes it, which is what that route's freshness check is for), so a
 * generated summary can be reused for ever. "Every marker I have" changes the
 * moment the next report is released, and there is no single updatedAt to
 * compare against — so this is generated per request and streamed straight
 * back, never written to disk. That also keeps it out of the DSAR export,
 * where a pile of near-identical snapshots of the same list would be noise.
 *
 * Streamed as the file itself rather than as a signed link for the same
 * reason: there is nothing stored for a link to point at.
 */
patientsRouter.get(
  '/markers-pdf',
  asyncHandler(async (req, res) => {
    await auditIfAdminViewer(req, 'own_all_markers_pdf', 'User');
    // Generation failing is a failed REQUEST, never a failed process — see
    // lib/pdfResponse.ts. The audit entry is written first on purpose: an
    // admin viewing their own data has been shown the query either way, and a
    // render that falls over afterwards must not quietly erase that fact.
    await streamPdf(res, {
      filename: 'aspire-markers.pdf',
      what: `all-markers sheet for ${req.user!.id}`,
      generate: () => generateAllMarkersPdf(req.user!.id),
    });
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
