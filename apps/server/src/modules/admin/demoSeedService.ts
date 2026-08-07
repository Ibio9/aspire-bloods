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
 * The values are a deliberate clinical narrative, not noise (see demoReports
 * below for the per-report annotations):
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
import { maskEmail } from '@aspire-bloods/shared';
import { prisma } from '../../db/client.js';
import { encryptField, generateToken } from '../../lib/crypto.js';
import { hashPassword } from '../../lib/password.js';
import { verifyReport, reviewReport, releaseReport } from '../reports/service.js';

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

/** Legacy handle: older seed versions tagged their ReferenceRange rows with
 * this. Current runs create ranges through verifyReport (so they carry the
 * real "source, verified date" attribution) and clean them up by id — the
 * tag is still swept for databases seeded by an older image. */
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

interface DemoResultInput {
  markerKey: string;
  /** A string is a textual lab result ("< 0.6", "Not detected") — carried
   * verbatim through the pipeline, shown verbatim in the portal, and never
   * plotted or flagged. */
  value: number | string;
  low: number;
  high: number;
  /** Defaults to the marker's own defaultUnit when omitted. */
  unit?: string;
}

interface DemoReportInput {
  /** Null on purpose for the ad-hoc report — Report.panelId is optional. */
  panelKey: string | null;
  sourceKey: string;
  /** Whole months before the seed run; the newest report uses daysAgo instead. */
  monthsAgo?: number;
  dayOfMonth?: number;
  daysAgo?: number;
  /** Code-only note: what this report is meant to demonstrate. */
  demonstrates: string;
  results: DemoResultInput[];
}

// ---------------------------------------------------------------------------
// The four reports. Note what deliberately ISN'T here as much as what is —
// no report repeats another's marker list, several markers appear in only
// two of the four (glucose, GGT, Omega-3 Index, RBC magnesium), and cortisol
// and DHEA-S appear exactly once, so the "markers not tested don't render"
// rule and the single-point trend case are both visible.
//
// Two markers deliberately change reference band mid-series, to show how the
// trend chart handles a band that moves under the line:
//   · Vitamin D  50–250 nmol/L  →  75–200 nmol/L  (reports 3 & 4)
//   · Ferritin   30–400 µg/L    →  20–200 µg/L    (reports 3 & 4)
// ---------------------------------------------------------------------------
const demoReports: DemoReportInput[] = [
  {
    // ~18 months ago — comprehensive baseline.
    panelKey: 'ran-chip-insight-360',
    sourceKey: 'randox_portal',
    monthsAgo: 18,
    dayOfMonth: 11,
    demonstrates:
      'Widest marker set in the series. Only abnormality is a clearly low vitamin D — a mild escalation, one flagged marker among 40.',
    results: [
      // Full blood count
      { markerKey: 'haemoglobin-f', value: 134, low: 120, high: 150 },
      { markerKey: 'rbc', value: 4.52, low: 3.9, high: 5.0 },
      { markerKey: 'haematocrit', value: 41, low: 36, high: 46 },
      { markerKey: 'mcv', value: 89, low: 80, high: 100 },
      { markerKey: 'rdw', value: 13.1, low: 11.5, high: 14.5 },
      { markerKey: 'platelets', value: 261, low: 150, high: 400 },
      { markerKey: 'wbc', value: 6.2, low: 4.0, high: 11.0 },
      { markerKey: 'neutrophils', value: 3.6, low: 2.0, high: 7.5 },
      { markerKey: 'lymphocytes', value: 2.0, low: 1.0, high: 4.0 },
      // Liver
      { markerKey: 'alt', value: 18, low: 0, high: 41 },
      { markerKey: 'ast', value: 21, low: 0, high: 40 },
      { markerKey: 'ggt', value: 22, low: 0, high: 60 },
      { markerKey: 'bilirubin', value: 9, low: 0, high: 21 },
      { markerKey: 'alp', value: 68, low: 30, high: 130 },
      { markerKey: 'albumin', value: 45, low: 35, high: 50 },
      { markerKey: 'total-protein', value: 72, low: 60, high: 80 },
      // Kidney
      { markerKey: 'creatinine', value: 66, low: 45, high: 90 },
      { markerKey: 'egfr', value: 99, low: 90, high: 120 },
      { markerKey: 'urea', value: 4.6, low: 2.5, high: 7.8 },
      { markerKey: 'sodium', value: 140, low: 135, high: 145 },
      { markerKey: 'potassium', value: 4.3, low: 3.5, high: 5.1 },
      // Lipids
      { markerKey: 'total-cholesterol', value: 4.4, low: 0, high: 5.0 },
      { markerKey: 'hdl', value: 1.68, low: 1.2, high: 2.3 },
      { markerKey: 'ldl', value: 2.3, low: 0, high: 3.0 },
      { markerKey: 'triglycerides', value: 0.9, low: 0, high: 1.7 },
      { markerKey: 'chol-hdl-ratio', value: 2.6, low: 0, high: 4.5 },
      { markerKey: 'omega-3-index', value: 8.4, low: 8, high: 12 }, // add-on
      // Glycaemic — the start of the HbA1c drift
      { markerKey: 'glucose', value: 4.7, low: 3.9, high: 5.5 },
      { markerKey: 'hba1c', value: 34, low: 20, high: 42 },
      // Thyroid
      { markerKey: 'tsh', value: 1.8, low: 0.4, high: 4.0 },
      { markerKey: 'free-t4', value: 14.2, low: 9, high: 21 },
      { markerKey: 'free-t3', value: 4.7, low: 3.1, high: 6.8 },
      // Vitamins, minerals, iron
      { markerKey: 'vitamin-d', value: 31, low: 50, high: 250 }, // LOW — start of the supplementation trajectory
      { markerKey: 'vitamin-b12', value: 411, low: 197, high: 771 },
      { markerKey: 'folate', value: 12.4, low: 3.9, high: 26.8 },
      { markerKey: 'ferritin', value: 88, low: 30, high: 400 }, // start of the steady fall
      { markerKey: 'iron', value: 17.4, low: 10, high: 30 },
      { markerKey: 'calcium', value: 2.38, low: 2.2, high: 2.6 },
      // Inflammation — quiet baseline, for contrast with report 3
      { markerKey: 'hs-crp', value: 0.8, low: 0, high: 3.0 },
      { markerKey: 'esr', value: 8, low: 0, high: 20 },
      { markerKey: 'uric-acid', value: 254, low: 140, high: 420 },
    ],
  },
  {
    // ~12 months ago — nutritional recheck, entirely different marker set,
    // and a different source (in-house) so the trend chart has mixed
    // provenance to label.
    panelKey: 'nutritional-health-hsc15',
    sourceKey: 'aspire_inhouse',
    monthsAgo: 12,
    dayOfMonth: 19,
    demonstrates:
      'A fully in-range report — no attention state at all — a marker list sharing only six markers with the baseline, and a textual result: hs-CRP below the assay detection limit, reported as "< 0.6" and shown verbatim, skipped by the trend line.',
    results: [
      { markerKey: 'vitamin-d', value: 54, low: 50, high: 250 }, // supplementation working, just into range
      { markerKey: 'vitamin-b12', value: 438, low: 197, high: 771 },
      { markerKey: 'folate', value: 14.1, low: 3.9, high: 26.8 },
      { markerKey: 'ferritin', value: 61, low: 30, high: 400 }, // still falling
      { markerKey: 'iron', value: 15.2, low: 10, high: 30 },
      { markerKey: 'tibc', value: 61, low: 45, high: 72 },
      { markerKey: 'calcium', value: 2.34, low: 2.2, high: 2.6 },
      { markerKey: 'rbc-magnesium', value: 1.94, low: 1.5, high: 2.5 },
      { markerKey: 'zinc', value: 12.6, low: 10, high: 18 },
      { markerKey: 'haemoglobin-f', value: 131, low: 120, high: 150 },
      { markerKey: 'albumin', value: 44, low: 35, high: 50 },
      { markerKey: 'total-protein', value: 71, low: 60, high: 80 },
      { markerKey: 'uric-acid', value: 268, low: 140, high: 420 },
      { markerKey: 'hba1c', value: 38, low: 20, high: 42 }, // creeping, still comfortably in range
      // The non-numeric case: below the assay's detection limit, reported as
      // text. Renders verbatim on the report; the hs-CRP trend line simply
      // skips this date (0.8 → [gap] → 9.6 → 1.1).
      { markerKey: 'hs-crp', value: '< 0.6', low: 0, high: 3.0 },
    ],
  },
  {
    // ~6 months ago — NO PANEL. An ad-hoc set of markers requested off the
    // back of fatigue symptoms, exactly the case Report.panelId being
    // optional exists for: the portal has to title this from the marker
    // count and date, with no panel name to lean on.
    panelKey: null,
    sourceKey: 'aspire_inhouse',
    monthsAgo: 6,
    dayOfMonth: 3,
    demonstrates:
      'No panel — title must fall back to "12 markers · <date>". Also carries the hs-CRP spike (significantly high) and the changed vitamin D / ferritin bands.',
    results: [
      { markerKey: 'hs-crp', value: 9.6, low: 0, high: 3.0 }, // SIGNIFICANT_HIGH — the one-off inflammatory event
      { markerKey: 'esr', value: 32, low: 0, high: 20 }, // HIGH — corroborates the spike
      { markerKey: 'ferritin', value: 34, low: 20, high: 200 }, // band changed vs reports 1–2
      { markerKey: 'vitamin-d', value: 82, low: 75, high: 200 }, // band changed vs reports 1–2
      { markerKey: 'vitamin-b12', value: 396, low: 197, high: 771 },
      { markerKey: 'folate', value: 11.2, low: 3.9, high: 26.8 },
      { markerKey: 'homocysteine', value: 13.6, low: 0, high: 15 },
      { markerKey: 'tsh', value: 2.1, low: 0.4, high: 4.0 },
      { markerKey: 'hba1c', value: 40, low: 20, high: 42 }, // still creeping
      // Cortisol and DHEA-S appear in this report ONLY — a marker tested
      // once has a single trend point and no line, which is worth seeing.
      { markerKey: 'cortisol', value: 402, low: 133, high: 537 },
      { markerKey: 'dhea-s', value: 5.4, low: 2.2, high: 15.2 },
      { markerKey: 'testosterone-f', value: 0.9, low: 0.3, high: 1.7 },
    ],
  },
  {
    // Most recent — within the last month. The payoff report: vitamin D
    // recovered, hs-CRP settled, HbA1c finally over the line, ferritin
    // frankly low, and fasting insulin significantly high (the earliest
    // marker of the insulin resistance the HbA1c drift is hinting at).
    panelKey: 'advanced-gp3-female',
    sourceKey: 'randox_portal',
    daysAgo: 11,
    demonstrates:
      'Four flagged markers: ferritin LOW and HbA1c/glucose HIGH (clearly out of range), fasting insulin SIGNIFICANT_HIGH — so the report carries a SIGNIFICANT escalation.',
    results: [
      { markerKey: 'haemoglobin-f', value: 128, low: 120, high: 150 }, // drifting with the ferritin, still in range
      { markerKey: 'wbc', value: 6.0, low: 4.0, high: 11.0 },
      { markerKey: 'platelets', value: 274, low: 150, high: 400 },
      { markerKey: 'alt', value: 22, low: 0, high: 41 },
      { markerKey: 'ast', value: 20, low: 0, high: 40 },
      { markerKey: 'ggt', value: 29, low: 0, high: 60 },
      { markerKey: 'creatinine', value: 68, low: 45, high: 90 },
      { markerKey: 'egfr', value: 96, low: 90, high: 120 },
      // Lipids + the two cardiovascular add-ons
      { markerKey: 'total-cholesterol', value: 4.8, low: 0, high: 5.0 },
      { markerKey: 'hdl', value: 1.54, low: 1.2, high: 2.3 },
      { markerKey: 'ldl', value: 2.7, low: 0, high: 3.0 },
      { markerKey: 'triglycerides', value: 1.4, low: 0, high: 1.7 },
      { markerKey: 'apob', value: 0.94, low: 0, high: 1.0 },
      { markerKey: 'homocysteine', value: 10.8, low: 0, high: 15 },
      { markerKey: 'omega-3-index', value: 8.1, low: 8, high: 12 },
      // Glycaemic — the trend lands
      { markerKey: 'glucose', value: 5.6, low: 3.9, high: 5.5 }, // HIGH, only just
      { markerKey: 'hba1c', value: 44, low: 20, high: 42 }, // HIGH — tips just over
      // Functional insulin band (2–10 mIU/L), narrower than the assay's
      // 2–25 — which is what makes 24.6 read as SIGNIFICANT_HIGH rather
      // than a shrug. Also a third marker whose band differs from the
      // catalogue default.
      { markerKey: 'fasting-insulin', value: 24.6, low: 2.0, high: 10.0 },
      // Thyroid
      { markerKey: 'tsh', value: 2.2, low: 0.4, high: 4.0 },
      { markerKey: 'free-t4', value: 13.8, low: 9, high: 21 },
      { markerKey: 'free-t3', value: 4.5, low: 3.1, high: 6.8 },
      // Vitamins / iron — the two headline trends finish here
      { markerKey: 'vitamin-d', value: 104, low: 75, high: 200 }, // recovered
      { markerKey: 'vitamin-b12', value: 388, low: 197, high: 771 },
      { markerKey: 'ferritin', value: 18, low: 20, high: 200 }, // LOW — end of the steady fall
      { markerKey: 'rbc-magnesium', value: 1.71, low: 1.5, high: 2.5 },
      { markerKey: 'hs-crp', value: 1.1, low: 0, high: 3.0 }, // settled after the spike
      // Hormones
      { markerKey: 'testosterone-f', value: 1.0, low: 0.3, high: 1.7 },
      { markerKey: 'oestradiol', value: 288, low: 100, high: 500 },
      { markerKey: 'shbg', value: 41, low: 10, high: 57 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Dates are relative to the seed run, not hardcoded, so "recent, within the
// last month" stays true whenever this is re-run for a demo.
// ---------------------------------------------------------------------------
function sampleDateFor(input: DemoReportInput, now: Date): Date {
  if (input.daysAgo !== undefined) {
    const d = new Date(now.getTime() - input.daysAgo * 24 * 60 * 60 * 1000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 15));
  }
  // dayOfMonth is always <= 28 above, so month arithmetic can't overflow.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (input.monthsAgo ?? 0), input.dayOfMonth ?? 12, 9, 15));
}

/**
 * Hard-deletes the given demo reports and everything hanging off them,
 * including the per-result ReferenceRange rows verifyReport created for
 * them. Demo rows are the one deliberate exception to "no hard deletes":
 * they are synthetic, documented as removable, and keyed to the single demo
 * patient.
 */
async function deleteReportsById(reportIds: string[]): Promise<void> {
  if (reportIds.length === 0) return;
  const results = await prisma.reportResult.findMany({
    where: { reportId: { in: reportIds } },
    select: { referenceRangeId: true },
  });
  const rangeIds = [...new Set(results.map((r) => r.referenceRangeId))];

  await prisma.escalationEvent.deleteMany({ where: { reportId: { in: reportIds } } });
  await prisma.reportResultEdit.deleteMany({ where: { reportResult: { reportId: { in: reportIds } } } });
  await prisma.reportResult.deleteMany({ where: { reportId: { in: reportIds } } });
  await prisma.auditLogEntry.deleteMany({ where: { targetType: 'Report', targetId: { in: reportIds } } });
  await prisma.report.deleteMany({ where: { id: { in: reportIds } } });
  // After the results are gone the ranges are unreferenced — verifyReport
  // creates one per result, never shared.
  if (rangeIds.length > 0) {
    await prisma.referenceRange.deleteMany({ where: { id: { in: rangeIds } } });
  }
  // Sweep ranges tagged by older seed versions too (nothing references them
  // once their results are deleted above).
  await prisma.referenceRange.deleteMany({ where: { source: { startsWith: DEMO_RANGE_TAG } } });
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
      'Dev staff users not found — run `npm run prisma:seed` (the main catalogue seed) before seeding demo data.',
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

    const sourceKeys = [...new Set(demoReports.map((r) => r.sourceKey))];
    const sourcesByKey = new Map((await prisma.source.findMany({ where: { key: { in: sourceKeys } } })).map((s) => [s.key, s]));
    for (const key of sourceKeys) {
      if (!sourcesByKey.has(key)) throw new Error(`Source "${key}" not found — run \`npm run prisma:seed\` first.`);
    }

    const panelKeys = [...new Set(demoReports.map((r) => r.panelKey).filter((k): k is string => k !== null))];
    const panelsByKey = new Map((await prisma.panel.findMany({ where: { key: { in: panelKeys } } })).map((p) => [p.key, p]));
    for (const key of panelKeys) {
      if (!panelsByKey.has(key)) throw new Error(`Panel "${key}" not found — run \`npm run prisma:seed\` first.`);
    }

    const markerKeys = [...new Set(demoReports.flatMap((r) => r.results.map((res) => res.markerKey)))];
    const markersByKey = new Map((await prisma.marker.findMany({ where: { key: { in: markerKeys } } })).map((m) => [m.key, m]));
    for (const key of markerKeys) {
      if (!markersByKey.has(key)) throw new Error(`Marker "${key}" not found — run \`npm run prisma:seed\` first.`);
    }
    slog('catalogue-resolved', { sources: sourceKeys.length, panels: panelKeys.length, markers: markerKeys.length });

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

    const now = new Date();
    const usedMarkerIds = new Set<string>();
    let resultsWritten = 0;

    for (const [index, reportInput] of demoReports.entries()) {
      const panel = reportInput.panelKey ? panelsByKey.get(reportInput.panelKey)! : null;
      const source = sourcesByKey.get(reportInput.sourceKey)!;
      const sampleDate = sampleDateFor(reportInput, now);
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
          panelId: panel?.id ?? null,
          sourceId: source.id,
          sampleDate,
          receivedDate,
          status: 'PARSED',
          uploadedById: admin.id,
        },
      });

      const rows = reportInput.results.map((res) => {
        const marker = markersByKey.get(res.markerKey)!;
        usedMarkerIds.add(marker.id);
        return {
          markerId: marker.id,
          value: res.value,
          unit: res.unit ?? marker.defaultUnit,
          referenceLow: res.low,
          referenceHigh: res.high,
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
        const anySignificant = flagged.some((f) => (SIGNIFICANT_STATUSES as readonly string[]).includes(f.status));
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
      slog('report-released', {
        index: index + 1,
        reportId: report.id,
        sampleDate: sampleDate.toISOString().slice(0, 10),
        panel: panel?.name ?? null,
        markers: rows.length,
        flagged: flagged.length,
      });
    }

    await deleteReportsById(previousIds);
    if (previousIds.length > 0) slog('previous-reports-replaced', { count: previousIds.length });

    // Dev-only: publish the explanation copy for markers used above so the
    // marker detail pages show authored copy rather than the "being
    // finalised" placeholder. Deliberately skipped in production —
    // attributing clinical sign-off to a placeholder clinician who reviewed
    // nothing is not a thing to do to a live record, and prisma/seed.ts
    // already promotes untouched seed copy to REVIEWED under a SYSTEM actor.
    if (!isProduction) {
      for (const markerId of usedMarkerIds) {
        await prisma.markerExplanation.updateMany({
          where: { markerId, reviewStatus: { in: ['DRAFT', 'REVIEWED'] } },
          data: { reviewStatus: 'PUBLISHED', reviewedById: clinician.id, reviewedAt: new Date() },
        });
      }
    }

    const dates = demoReports.map((r) => sampleDateFor(r, now).getTime());
    const spanMonths = Math.round((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24 * 30.44));
    const detail = `${demoReports.length} released reports spanning ~${spanMonths} months, ${usedMarkerIds.size} distinct markers, ${resultsWritten} results.`;

    slog('succeeded', {
      trigger,
      patientId: patient.id,
      reportsCreated: demoReports.length,
      resultsWritten,
      durationMs: Date.now() - startedAt,
    });

    return finish({
      outcome: 'SUCCEEDED',
      detail,
      patientId: patient.id,
      reportsCreated: demoReports.length,
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

  const reports = await prisma.report.findMany({ where: { patientId: patient.id }, select: { id: true } });
  await deleteReportsById(reports.map((r) => r.id));
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
