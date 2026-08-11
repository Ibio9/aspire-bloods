/**
 * ============================================================================
 *  ⚠  DEMO DATA — SYNTHETIC. NOT A REAL PATIENT, NOT REAL RESULTS.  ⚠
 *
 *  The demo seed used to live entirely in prisma/seedDemo.ts and run inside
 *  the container's start command, before the server ever listened. That
 *  placement is what made its failures undiagnosable: a database hiccup or a
 *  platform healthcheck killing a slow boot took the seed down mid-write,
 *  nothing could log it (a killed process reaches no catch block), and the
 *  observable result was exactly "the demo patient signs in and owns
 *  nothing". So the seed now runs in three explicit ways, all through this
 *  module:
 *
 *    · boot  — index.ts calls runDemoSeed({trigger:'boot'}) AFTER the server
 *              is listening. The healthcheck can pass while it runs, its
 *              logs land in the runtime log stream people actually read, and
 *              a failure degrades nothing.
 *    · admin — POST /api/admin/demo-seed/run. The break-glass re-run for a
 *              deployed environment, no redeploy needed.
 *    · cli   — npm run prisma:seed:demo (see prisma/seedDemo.ts), for dev
 *              machines and hand-runs against production with
 *              --allow-production.
 *
 *  Reports are NOT written at RELEASED any more. Each one is created at
 *  PARSED (exactly where manual entry starts, since there is no document)
 *  and then driven through verifyReport → reviewReport → releaseReport — the
 *  same functions, transition table and audit trail every real report goes
 *  through. Only the timestamps are then set back to the narrative dates,
 *  because an 18-month history seeded today is otherwise dated today.
 *
 *  Idempotency is create-new-first, delete-old-after: if a run dies partway
 *  the patient keeps the previous reports instead of being left with none,
 *  which is precisely the failure mode the old delete-first order produced
 *  in production.
 *
 *  Every run's outcome is recorded in the single DemoSeedRun row (shown on
 *  the admin dashboard) for boot and admin triggers, and always logged with
 *  a [seedDemo] prefix. Failures are loud but never fatal.
 *
 *  Removal: unset SEED_DEMO_DATA, then `npm run prisma:seed:demo -- --purge`
 *  (with --allow-production against a live database).
 * ============================================================================
 *
 * Creates one ACTIVE demo patient with FOUR RELEASED reports spanning ~18
 * months, so the patient portal has genuine history to exercise: trend
 * charts with real movement, a marker set that changes between reports, a
 * report with no panel behind it, a textual (non-numeric) lab result, and
 * both a mildly and a significantly out-of-range result on the newest
 * report.
 *
 * The values are a deliberate clinical narrative, not noise (see NARRATIVE in
 * demoSeedData.ts for the per-marker annotations):
 *   · Vitamin D   — clearly low at baseline, then the classic
 *                   supplementation recovery across all four reports.
 *   · HbA1c       — creeping up, in range until the newest report tips it
 *                   just over, with fasting insulin/glucose corroborating.
 *   · Ferritin    — falling steadily, ending frankly low.
 *   · hs-CRP      — below the assay detection limit ("< 0.6") in the second
 *                   report, a one-off spike in the third (significantly
 *                   high), settled by the fourth.
 *   · Everything else drifts naturally within range — no repeated numbers.
 *
 * Requires the main catalogue seed (prisma/seed.ts) to have already run —
 * it looks up panels/markers/sources by key and fails loudly if they're
 * missing rather than silently creating a parallel, undocumented catalogue.
 */
import type { Prisma } from '@prisma/client';
import { maskEmail } from '@aspire-bloods/shared';
import { prisma } from '../../db/client.js';
import { encryptField, generateToken } from '../../lib/crypto.js';
import { hashPassword } from '../../lib/password.js';
import { verifyReport, reviewReport, releaseReport } from '../reports/service.js';
import { buildDemoReports } from './demoSeedData.js';
import { assertIsDemoAccount, assertOnlyDemoReports } from './demoSeedGuards.js';

// The demo patient's own login. Overridable because 2FA is not bypassed for
// demo accounts — wherever email is genuinely being delivered (i.e.
// production), this has to be an address you can open.
const DEFAULT_DEMO_EMAIL = 'demo.showcase@aspireshield.dev';

// Staff attribution for the synthetic reports. In dev these are the dev
// staff prisma/seed.ts creates; in production seed.ts deliberately creates
// no staff logins at all, so the two accounts below get created instead —
// see resolveDemoStaff().
const DEV_ADMIN_EMAIL = 'admin@aspireshield.dev';
const DEV_CLINICIAN_EMAIL = 'clinician@aspireshield.dev';
const DEMO_ADMIN_EMAIL = 'demo.admin@aspireshield.dev';
const DEMO_CLINICIAN_EMAIL = 'demo.clinician@aspireshield.dev';

/**
 * Legacy handle: older seed versions tagged their per-result range rows with
 * this.
 *
 * It used to be swept with an UNSCOPED `deleteMany({ source: { startsWith } })`
 * across the whole table, which is what produced the foreign-key failure this
 * teardown was rewritten to fix: a bulk delete of parent rows with no regard
 * for whether a live ReportResult still pointed at any of them, and no regard
 * for whose result it was. RESTRICT on ReportResult_referenceRangeId_fkey
 * caught it — correctly, which is why that constraint has not been touched.
 *
 * Legacy rows are still cleaned up, but only through the same
 * unreferenced-only path everything else goes through (see deleteDemoReports).
 */
const DEMO_RANGE_TAG = 'DEMO DATA';

export type DemoSeedTrigger = 'boot' | 'admin' | 'cli';

export interface DemoSeedSummary {
  outcome: 'SKIPPED' | 'SUCCEEDED' | 'FAILED';
  detail: string;
  patientId?: string;
  reportsCreated: number;
  resultsWritten: number;
  durationMs: number;
  errorMessage?: string;
}

const SIGNIFICANT_STATUSES = ['SIGNIFICANT_HIGH', 'SIGNIFICANT_LOW'] as const;
const OUT_OF_RANGE_STATUSES = ['HIGH', 'LOW', 'SIGNIFICANT_HIGH', 'SIGNIFICANT_LOW'] as const;

/** Loud, structured, greppable. Every line this module prints says which
 * branch it took — "the switch was off" and "the seed died" must never look
 * the same again. */
function slog(event: string, data: Record<string, unknown> = {}): void {
  console.log(`[seedDemo] ${event} ${JSON.stringify(data)}`);
}

/**
 * Records what this run did, so a swallowed failure is visible to an admin
 * instead of only to whoever can read the logs. One row, overwritten by
 * every boot/admin run (a plain CLI run keeps its outcome on the terminal
 * and must not overwrite the deployment's own state with a developer's).
 *
 * Deliberately swallows its OWN failure: diagnostic bookkeeping must not
 * turn an already-degraded run into a crashed one.
 */
async function recordSeedRun(
  trigger: DemoSeedTrigger,
  demoEmail: string,
  outcome: 'SKIPPED' | 'SUCCEEDED' | 'FAILED',
  detail: string,
  extra: { durationMs?: number; reportsCreated?: number; errorMessage?: string } = {},
): Promise<void> {
  if (trigger === 'cli') return;
  const data = {
    outcome,
    ranAt: new Date(),
    durationMs: extra.durationMs ?? null,
    reportsCreated: extra.reportsCreated ?? 0,
    // Never the address in full: SEED_DEMO_EMAIL is a real mailbox anywhere
    // 2FA email is genuinely delivered.
    patientEmail: outcome === 'SKIPPED' ? null : maskEmail(demoEmail),
    detail,
    errorMessage: extra.errorMessage ?? null,
  };
  try {
    await prisma.demoSeedRun.upsert({ where: { id: 'last' }, update: data, create: { id: 'last', ...data } });
  } catch (e) {
    console.error('[seedDemo] could not record the seed outcome for the admin console:', e);
  }
}

/**
 * Hard-deletes demo reports and everything hanging off them, in dependency
 * order, inside one transaction, scoped to the demo patient and nothing else.
 *
 * This is the function that used to fail with
 *   "update or delete on table ReferenceRange violates RESTRICT setting of
 *    foreign key constraint ReportResult_referenceRangeId_fkey"
 * and the fix is the order plus the scope, not the constraint. RESTRICT is
 * there precisely to stop a bulk delete walking through real patient data, so
 * it stays exactly as it is.
 *
 * Three things changed:
 *
 *  1. DEPENDENCY ORDER. Children before parents, all the way down: the edit
 *     history before the results, the results before the reports, and the
 *     reference ranges last of all — a range is a PARENT of a result, so it
 *     can only go once no result points at it. Rows that merely reference a
 *     report loosely (an ingestion log line, a Randox order) are detached
 *     rather than deleted; they are records of something that really happened.
 *
 *  2. UNREFERENCED-ONLY. Ranges are not deleted because we think they were
 *     ours — they are deleted only after re-checking, inside the transaction,
 *     that nothing at all still points at them. verifyReport creates one range
 *     per result and never shares them, but "never shared" is an invariant of
 *     today's code, and a delete that would corrupt another patient's report
 *     if that invariant ever changed is not one to write.
 *
 *  3. ONE TRANSACTION. Either the whole old history goes or none of it does.
 *     The half-deleted state the original failure left behind is not
 *     reachable from here.
 *
 * Demo rows are the one deliberate exception to "no hard deletes": they are
 * synthetic, documented as removable, and keyed to the single demo patient.
 */
async function deleteDemoReports(demoPatientId: string, reportIds: string[]): Promise<number> {
  if (reportIds.length === 0) return 0;

  return prisma.$transaction(
    async (tx) => {
    // Re-read ownership from storage rather than trusting the caller's list.
    const owned = await tx.report.findMany({
      where: { id: { in: reportIds } },
      select: { id: true, patientId: true },
    });
    assertOnlyDemoReports(owned, demoPatientId);
    const ids = owned.map((r) => r.id);
    if (ids.length === 0) return 0;

    const results = await tx.reportResult.findMany({
      where: { reportId: { in: ids } },
      select: { id: true, referenceRangeId: true },
    });
    const candidateRangeIds = [...new Set(results.map((r) => r.referenceRangeId))];

    // --- children of ReportResult -----------------------------------------
    await tx.reportResultEdit.deleteMany({ where: { reportResultId: { in: results.map((r) => r.id) } } });

    // --- children of Report ------------------------------------------------
    await tx.escalationEvent.deleteMany({ where: { reportId: { in: ids } } });
    await tx.reportResultExclusion.deleteMany({ where: { reportId: { in: ids } } });
    await tx.reportMeasurements.deleteMany({ where: { reportId: { in: ids } } });
    await tx.reportResult.deleteMany({ where: { reportId: { in: ids } } });

    // Loose references: these are logs of things that happened, so they are
    // detached rather than destroyed. Both columns are nullable for this.
    await tx.ingestionLogEntry.updateMany({ where: { reportId: { in: ids } }, data: { reportId: null } });
    await tx.randoxOrder.updateMany({ where: { reportId: { in: ids } }, data: { reportId: null } });

    // No FK — matched on the audit log's polymorphic target columns.
    await tx.auditLogEntry.deleteMany({ where: { targetType: 'Report', targetId: { in: ids } } });

    await tx.report.deleteMany({ where: { id: { in: ids } } });

    // --- parents, last, and only if genuinely unreferenced -----------------
    const rangeIds = [...candidateRangeIds, ...(await legacyTaggedRangeIds(tx))];
    if (rangeIds.length > 0) {
      const stillReferenced = new Set(
        (
          await tx.reportResult.findMany({
            where: { referenceRangeId: { in: rangeIds } },
            select: { referenceRangeId: true },
          })
        ).map((r) => r.referenceRangeId),
      );
      const deletable = rangeIds.filter((id) => !stillReferenced.has(id));
      if (deletable.length > 0) {
        // ResultReferenceRange, never ReferenceRange: these are the demo's own
        // per-result records. The catalogue is a different table and this
        // teardown has no business in it.
        await tx.resultReferenceRange.deleteMany({ where: { id: { in: deletable } } });
      }
    }

    return ids.length;
    },
    // A Signature report alone carries ~440 results and as many ranges. The
    // 5s interactive default is comfortable on a local socket and not on a
    // managed database across a network, and this transaction is the one
    // thing that must not half-run.
    { timeout: 120_000, maxWait: 30_000 },
  );
}

/**
 * Ranges left by seed versions that tagged their own source string. Collected
 * as ids so they go through the same "only if nothing references it" check as
 * everything else, instead of the unscoped deleteMany that used to run here.
 */
async function legacyTaggedRangeIds(tx: Prisma.TransactionClient): Promise<string[]> {
  const rows = await tx.resultReferenceRange.findMany({
    where: { source: { startsWith: DEMO_RANGE_TAG } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}


/**
 * Reports need real users behind uploadedById/verifiedById/reviewedById.
 * Dev has staff accounts from prisma/seed.ts; production deliberately has
 * none (seed.ts refuses to put a login-ready staff account with a
 * repo-known password on a live system, correctly). So for production this
 * creates two attribution-only accounts that cannot be logged into:
 * unguessable random password, and status DISABLED — login requires ACTIVE
 * (auth/service.ts). Neither carries any admin authority: that comes solely
 * from the ADMIN_EMAILS environment variable, never from a DB role.
 */
async function resolveDemoStaff(isProduction: boolean) {
  const admin = await prisma.user.findUnique({ where: { email: DEV_ADMIN_EMAIL } });
  const clinician = await prisma.user.findUnique({ where: { email: DEV_CLINICIAN_EMAIL } });
  if (admin && clinician) return { admin, clinician };

  if (!isProduction) {
    throw new Error(
      'Dev staff users not found. Run `npm run prisma:seed` (the main catalogue seed) before seeding demo data.',
    );
  }

  const unusablePassword = async () => hashPassword(generateToken(32));

  const demoAdmin = await prisma.user.upsert({
    where: { email: DEMO_ADMIN_EMAIL },
    update: {},
    create: {
      email: DEMO_ADMIN_EMAIL,
      passwordHash: await unusablePassword(),
      role: 'ADMIN',
      status: 'DISABLED',
      twoFactorMethod: 'EMAIL',
      staffProfile: { create: { firstName: 'Demo', lastName: 'Administrator', roleTitle: 'DEMO DATA: placeholder, cannot sign in' } },
    },
  });

  const demoClinician = await prisma.user.upsert({
    where: { email: DEMO_CLINICIAN_EMAIL },
    update: {},
    create: {
      email: DEMO_CLINICIAN_EMAIL,
      passwordHash: await unusablePassword(),
      role: 'CLINICIAN',
      status: 'DISABLED',
      twoFactorMethod: 'EMAIL',
      staffProfile: { create: { firstName: 'Demo', lastName: 'Clinician', roleTitle: 'DEMO DATA: placeholder, cannot sign in' } },
    },
  });

  return { admin: demoAdmin, clinician: demoClinician };
}

/**
 * The whole seed. Never throws — every outcome (including SKIPPED) is
 * logged, recorded to DemoSeedRun for boot/admin triggers, and returned.
 */
export async function runDemoSeed(opts: { trigger: DemoSeedTrigger; allowProduction?: boolean }): Promise<DemoSeedSummary> {
  const startedAt = Date.now();
  const { trigger } = opts;
  const isProduction = process.env.NODE_ENV === 'production';
  const demoDataEnabled = process.env.SEED_DEMO_DATA === 'true';
  const demoEmail = process.env.SEED_DEMO_EMAIL ?? DEFAULT_DEMO_EMAIL;

  const finish = async (summary: DemoSeedSummary): Promise<DemoSeedSummary> => {
    await recordSeedRun(trigger, demoEmail, summary.outcome, summary.detail, {
      durationMs: summary.durationMs,
      reportsCreated: summary.reportsCreated,
      errorMessage: summary.errorMessage,
    });
    return summary;
  };

  // Boot-mode call from index.ts on every start: absent the opt-in variable
  // this is a recorded no-op, so the same boot is safe on a real production
  // service that has never wanted demo data. Recorded rather than merely
  // returned — "the switch is off" and "the switch is on and the seed died"
  // produce the identical symptom (an account that signs in and holds
  // nothing), and telling them apart afterwards is the point.
  if (trigger === 'boot' && !demoDataEnabled) {
    slog('skipped', { trigger, reason: 'SEED_DEMO_DATA is not "true"', envValue: process.env.SEED_DEMO_DATA ?? null });
    return finish({
      outcome: 'SKIPPED',
      detail: 'SEED_DEMO_DATA is not set to "true", so no demo data was seeded on this boot.',
      reportsCreated: 0,
      resultsWritten: 0,
      durationMs: Date.now() - startedAt,
    });
  }

  // Synthetic patient rows in a live clinical database must never happen by
  // accident. Ways in: the SEED_DEMO_DATA switch (boot), an explicit admin
  // action (admin), or --allow-production on a hand run (cli).
  const productionAllowed = trigger === 'admin' || (trigger === 'boot' && demoDataEnabled) || opts.allowProduction === true;
  if (isProduction && !productionAllowed) {
    slog('skipped', { trigger, reason: 'NODE_ENV=production without an explicit opt-in' });
    return finish({
      outcome: 'SKIPPED',
      detail: 'NODE_ENV=production and no explicit opt-in — refusing to touch demo data.',
      reportsCreated: 0,
      resultsWritten: 0,
      durationMs: Date.now() - startedAt,
    });
  }

  if (isProduction) {
    console.warn(
      '\n############################################################\n' +
        '#  SEEDING SYNTHETIC DEMO DATA INTO A PRODUCTION DATABASE  #\n' +
        '#  Not a real patient. Remove with --purge before the      #\n' +
        '#  first real patient is onboarded.                        #\n' +
        '############################################################\n',
    );
  }

  try {
    slog('started', { trigger, isProduction, demoEmail: maskEmail(demoEmail) });

    const { admin, clinician } = await resolveDemoStaff(isProduction);
    slog('staff-resolved', { adminId: admin.id, clinicianId: clinician.id });

    // The whole demo history is generated from the catalogue that is actually
    // in this database — see demoSeedData.ts. Nothing below names a marker.
    const now = new Date();
    const { reports: generated, diagnostics } = await buildDemoReports({ now, patientSex: 'FEMALE' });

    const sourceKeys = [...new Set(generated.map((r) => r.sourceKey))];
    const sourcesByKey = new Map((await prisma.source.findMany({ where: { key: { in: sourceKeys } } })).map((s) => [s.key, s]));
    for (const key of sourceKeys) {
      if (!sourcesByKey.has(key)) throw new Error(`Source "${key}" not found. Run \`npm run prisma:seed\` first.`);
    }

    slog('catalogue-resolved', {
      reports: generated.length,
      resultsByType: diagnostics.byResultType,
      measuredHealthAreasCovered: `${diagnostics.measuredCategoriesCovered}/${diagnostics.measuredCategoriesTotal}`,
      uncoveredHealthAreas: diagnostics.uncoveredCategoryKeys,
      foodSensitivityGroups: diagnostics.foodSensitivityGroups,
      rangesFromCatalogue: diagnostics.catalogueRanges,
      rangesSynthesised: diagnostics.syntheticRanges,
      nonNumericResults: diagnostics.nonNumericResults,
      markersInOneReportOnly: diagnostics.markersInOneReportOnly,
      markersInTwoOrMoreReports: diagnostics.markersInTwoOrMoreReports,
      intendedStatusSpread: diagnostics.byIntendedStatus,
      correlatedFollowers: diagnostics.correlatedFollowers,
    });

    // The count that answers "are the panels complete". Printed per report,
    // with the panel's own marker count beside it, so a partial panel is
    // visible in the run log rather than only findable by querying.
    for (const r of diagnostics.markersPerReport) {
      slog('report-planned', {
        panel: r.panel,
        sampleDate: r.sampleDate,
        results: r.results,
        panelMarkers: r.panelMarkers,
        complete: r.panelMarkers === null ? 'n/a (no panel)' : r.results === r.panelMarkers,
      });
    }

    const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';
    const patient = await prisma.user.upsert({
      where: { email: demoEmail },
      // An existing row (an earlier seed, or a self-registered account on
      // the same address) is adopted, not skipped — reports are backfilled
      // onto it below either way.
      update: { passwordHash: await hashPassword(demoPassword), status: 'ACTIVE' },
      create: {
        email: demoEmail,
        passwordHash: await hashPassword(demoPassword),
        role: 'PATIENT',
        status: 'ACTIVE',
        twoFactorMethod: 'EMAIL',
        patientProfile: {
          create: {
            title: 'Ms',
            firstName: 'Olivia',
            lastName: 'Bennett',
            sex: 'FEMALE',
            dobEncrypted: encryptField('1988-04-17'),
            contactNumberEncrypted: encryptField('+44 7700 900123'),
            addressEncrypted: encryptField('14 Marlborough Road, London'),
            postcode: 'N19 4NF',
            gpName: 'Dr Priya Shah',
            gpAddressEncrypted: encryptField('Marlborough Road Surgery, London'),
          },
        },
      },
    });
    // Belt and braces before anything is deleted below: the row we are about
    // to attach a synthetic history to, and later tear a history off, must be
    // the account SEED_DEMO_EMAIL names and no other.
    assertIsDemoAccount(patient, demoEmail);
    slog('patient-upserted', { patientId: patient.id, email: maskEmail(demoEmail) });

    // A self-registered row has no profile; verifyReport needs one for the
    // patient's sex, and the portal greets by first name.
    await prisma.patientProfile.upsert({
      where: { userId: patient.id },
      update: {},
      create: {
        userId: patient.id,
        title: 'Ms',
        firstName: 'Olivia',
        lastName: 'Bennett',
        sex: 'FEMALE',
        dobEncrypted: encryptField('1988-04-17'),
        contactNumberEncrypted: encryptField('+44 7700 900123'),
        addressEncrypted: encryptField('14 Marlborough Road, London'),
        postcode: 'N19 4NF',
        gpName: 'Dr Priya Shah',
        gpAddressEncrypted: encryptField('Marlborough Road Surgery, London'),
      },
    });

    const consentVersions = await prisma.consentVersion.findMany({ where: { version: 1 } });
    for (const cv of consentVersions) {
      const existing = await prisma.consentRecord.findFirst({ where: { userId: patient.id, consentVersionId: cv.id } });
      if (existing) continue;
      await prisma.consentRecord.create({
        data: { userId: patient.id, consentVersionId: cv.id, granted: true, ipAddress: '127.0.0.1' },
      });
    }

    // Idempotency, in the survivable order: note what exists, build the new
    // history, and only then remove the old one. A run that dies partway
    // leaves the previous reports in place instead of an account that signs
    // in and holds nothing — which is exactly how the old delete-first order
    // failed in production.
    const previousReports = await prisma.report.findMany({ where: { patientId: patient.id }, select: { id: true } });
    const previousIds = previousReports.map((r) => r.id);
    slog('previous-reports-found', { count: previousIds.length });

    const usedMarkerIds = new Set<string>();
    const createdReportIds: string[] = [];
    let resultsWritten = 0;

    // If any report fails partway, the ones already written this run are
    // removed before the error propagates, so the account is never left
    // holding half a history. Combined with delete-old-after, the outcome is
    // always one complete set of reports: the new one, or the previous one.
    try {
    for (const [index, reportInput] of generated.entries()) {
      const source = sourcesByKey.get(reportInput.sourceKey)!;
      const sampleDate = reportInput.sampleDate;
      const day = 1000 * 60 * 60 * 24;
      const receivedDate = new Date(sampleDate.getTime() + day);
      const verifiedAt = new Date(sampleDate.getTime() + day);
      const reviewedAt = new Date(sampleDate.getTime() + day * 2);
      const releasedAt = new Date(sampleDate.getTime() + day * 2 + 1000 * 60 * 45);

      // Through the real pipeline, not around it. The report starts at
      // PARSED — where manual entry starts, since there is no document — and
      // is then verified, reviewed and released by the same functions every
      // real report passes through, transition table, audit trail and all.
      const report = await prisma.report.create({
        data: {
          patientId: patient.id,
          panelId: reportInput.panelId,
          sourceId: source.id,
          sampleDate,
          receivedDate,
          status: 'PARSED',
          uploadedById: admin.id,
        },
      });
      createdReportIds.push(report.id);

      const rows = reportInput.results.map((res) => {
        usedMarkerIds.add(res.markerId);
        return {
          markerId: res.markerId,
          value: res.value,
          unit: res.unit,
          referenceLow: res.referenceLow,
          referenceHigh: res.referenceHigh,
        };
      });

      await verifyReport(report.id, { sampleDate: sampleDate.toISOString(), results: rows }, admin.id, null);
      await reviewReport(report.id, true, undefined, clinician.id, null);
      await releaseReport(report.id, admin.id, null);

      // Mirrors escalation/service.ts checkAndEscalate(), minus the actual
      // email/SMS — releaseReport was called directly rather than through
      // the route that notifies, so nothing was really sent, and
      // channelsNotified says so rather than claiming an email went out.
      const flagged = await prisma.reportResult.findMany({
        where: { reportId: report.id, status: { in: [...OUT_OF_RANGE_STATUSES] } },
        select: { markerId: true, status: true },
      });
      if (flagged.length > 0) {
        // status is nullable now — a result with no position on its range has
        // none. The `in` filter above already excludes those, so this is a
        // type guard rather than a behaviour change.
        const anySignificant = flagged.some(
          (f) => f.status !== null && (SIGNIFICANT_STATUSES as readonly string[]).includes(f.status),
        );
        await prisma.escalationEvent.create({
          data: {
            reportId: report.id,
            severity: anySignificant ? 'SIGNIFICANT' : 'MILD',
            channelsNotified: [],
            flaggedMarkerIds: flagged.map((f) => f.markerId),
            createdAt: releasedAt,
          },
        });
      }

      // The pipeline stamped everything "now"; set the clocks back to the
      // narrative dates. This adjusts timestamps only — the RELEASED state
      // itself was reached through the real transitions above.
      await prisma.report.update({
        where: { id: report.id },
        data: { verifiedAt, reviewedAt, releasedAt, createdAt: releasedAt, receivedDate },
      });
      await prisma.reportResult.updateMany({ where: { reportId: report.id }, data: { createdAt: verifiedAt } });

      resultsWritten += rows.length;
      const perType = reportInput.results.reduce<Record<string, number>>((acc, r) => {
        acc[r.resultType] = (acc[r.resultType] ?? 0) + 1;
        return acc;
      }, {});
      slog('report-released', {
        index: index + 1,
        reportId: report.id,
        sampleDate: sampleDate.toISOString().slice(0, 10),
        panel: reportInput.panelName,
        results: rows.length,
        byType: perType,
        flagged: flagged.length,
        demonstrates: reportInput.demonstrates,
      });
    }
    } catch (e) {
      // Compensating cleanup: drop whatever this run managed to write, so the
      // previous history (still untouched at this point) remains the account's
      // one complete set.
      if (createdReportIds.length > 0) {
        await deleteDemoReports(patient.id, createdReportIds).catch((cleanupError) => {
          console.error('[seedDemo] partial-run cleanup ALSO failed — demo account may hold both histories:', cleanupError);
          return 0;
        });
        slog('partial-run-rolled-back', { reports: createdReportIds.length });
      }
      throw e;
    }

    const removed = await deleteDemoReports(patient.id, previousIds);
    if (removed > 0) slog('previous-reports-replaced', { count: removed });

    // This used to publish the explanation copy for every marker it touched,
    // in dev only, so the marker pages showed authored copy instead of the
    // "being finalised" placeholder. Both halves of that are gone: there is no
    // placeholder any more, and patient visibility no longer depends on review
    // status. Marking the demo data's copy PUBLISHED under a demo clinician
    // would now only make dev disagree with production about who has read
    // what, which is the one thing this field exists to answer.

    const dates = generated.map((r) => r.sampleDate.getTime());
    const spanMonths = Math.round((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24 * 30.44));
    const d = diagnostics;
    const perReport = d.markersPerReport
      .map((r) => `${r.panel} ${r.sampleDate}: ${r.results}${r.panelMarkers === null ? '' : `/${r.panelMarkers}`}`)
      .join('; ');
    const detail =
      `${generated.length} released reports spanning ~${spanMonths} months, ${usedMarkerIds.size} distinct markers, ` +
      `${resultsWritten} results (${d.byResultType.MEASURED} measured, ${d.byResultType.GENETIC} genetic, ` +
      `${d.byResultType.SENSITIVITY} sensitivity, ${d.byResultType.COMPOSITION} composition, ` +
      `${d.byResultType.QUALITATIVE} qualitative). ` +
      `${d.measuredCategoriesCovered}/${d.measuredCategoriesTotal} health areas covered. ` +
      `Markers per report: ${perReport}.`;

    slog('succeeded', {
      trigger,
      patientId: patient.id,
      reportsCreated: generated.length,
      resultsWritten,
      durationMs: Date.now() - startedAt,
    });

    return finish({
      outcome: 'SUCCEEDED',
      detail,
      patientId: patient.id,
      reportsCreated: generated.length,
      resultsWritten,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    // Loud, recorded, fatal to nothing. The full error (stack included)
    // goes to the runtime log; the message alone goes to the admin console.
    console.error('[seedDemo] FAILED — no demo reports were replaced on this run. Full error:', e);
    return finish({
      outcome: 'FAILED',
      detail: 'The demo data seed failed. The previous demo reports (if any) were left in place.',
      reportsCreated: 0,
      resultsWritten: 0,
      durationMs: Date.now() - startedAt,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * `npm run prisma:seed:demo -- --purge` — removes the demo patient and every
 * row the seed created. CLI-only on purpose: this is the one destructive
 * demo operation, and it should take a deliberate terminal command, not a
 * button.
 */
export async function purgeDemoSeed(): Promise<{ purged: boolean; detail: string }> {
  const demoEmail = process.env.SEED_DEMO_EMAIL ?? DEFAULT_DEMO_EMAIL;
  const patient = await prisma.user.findUnique({ where: { email: demoEmail } });
  if (!patient) {
    return { purged: false, detail: `No demo patient (${demoEmail}) found — nothing to purge.` };
  }

  assertIsDemoAccount(patient, demoEmail);

  const reports = await prisma.report.findMany({ where: { patientId: patient.id }, select: { id: true } });
  await deleteDemoReports(patient.id, reports.map((r) => r.id));
  await prisma.consentRecord.deleteMany({ where: { userId: patient.id } });
  await prisma.refreshToken.deleteMany({ where: { userId: patient.id } });
  await prisma.otpCode.deleteMany({ where: { userId: patient.id } });
  await prisma.trustedDevice.deleteMany({ where: { userId: patient.id } });
  await prisma.inviteToken.deleteMany({ where: { userId: patient.id } });
  await prisma.erasureRequest.deleteMany({ where: { userId: patient.id } });
  await prisma.auditLogEntry.deleteMany({ where: { actorUserId: patient.id } });
  await prisma.auditLogEntry.deleteMany({ where: { targetType: 'User', targetId: patient.id } });
  await prisma.patientProfile.deleteMany({ where: { userId: patient.id } });
  await prisma.user.delete({ where: { id: patient.id } });

  // Placeholder staff exist only where the seed created them (production).
  // The real dev staff accounts are never touched — different emails.
  for (const email of [DEMO_ADMIN_EMAIL, DEMO_CLINICIAN_EMAIL]) {
    const staff = await prisma.user.findUnique({ where: { email } });
    if (!staff) continue;
    await prisma.staffProfile.deleteMany({ where: { userId: staff.id } });
    await prisma.auditLogEntry.deleteMany({ where: { actorUserId: staff.id } });
    await prisma.user.delete({ where: { id: staff.id } });
    slog('placeholder-staff-removed', { email });
  }

  slog('purged', { email: maskEmail(demoEmail), reports: reports.length });
  return { purged: true, detail: `Purged demo patient ${demoEmail} and ${reports.length} demo report(s).` };
}
