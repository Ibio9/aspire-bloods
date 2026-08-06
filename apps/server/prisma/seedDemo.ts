/**
 * ============================================================================
 *  ⚠  DEMO DATA — SYNTHETIC. NOT A REAL PATIENT, NOT REAL RESULTS.  ⚠
 *
 *  Nothing in the app depends on this file. To remove it before real
 *  patients exist, either:
 *      npm run prisma:seed:demo -- --purge     (deletes the demo patient and
 *                                               every row this file created)
 *  or just delete this file and the two `prisma:seed:demo*` package scripts.
 *
 *  Every row created here is traceable: the patient is the single
 *  DEMO_PATIENT_EMAIL account below, and every ReferenceRange written here
 *  has `source` prefixed with DEMO_RANGE_TAG, which is what --purge and the
 *  idempotent re-run cleanup both key off.
 *
 *  ── Running this against PRODUCTION ────────────────────────────────────
 *  Refuses to run under NODE_ENV=production unless explicitly opted in,
 *  because synthetic patient rows in a live clinical database are exactly
 *  the kind of thing that must never happen by accident. Two ways in:
 *
 *    · Set SEED_DEMO_DATA=true in the Railway service variables. The
 *      container's start script calls this file with --boot on every
 *      deploy; with the variable set it seeds (idempotently — each deploy
 *      replaces the previous demo reports and re-anchors their dates to
 *      "now"), without it the call is a silent no-op. A failure here is
 *      logged and swallowed: demo data must never stop the API booting.
 *    · Or run it by hand against the production DATABASE_URL with
 *      `-- --allow-production`.
 *
 *  To take it back off the live site: unset SEED_DEMO_DATA, then run
 *  `npm run prisma:seed:demo -- --purge --allow-production` against the
 *  production database. Leaving the variable set simply re-seeds it.
 *
 *  Note the demo patient still has to pass 2FA like anyone else, so
 *  SEED_DEMO_EMAIL must be a mailbox you can actually receive at in any
 *  environment where email is really being sent.
 * ============================================================================
 *
 * Creates one ACTIVE demo patient with FOUR RELEASED reports spanning ~18
 * months, so the patient portal has genuine history to exercise: trend
 * charts with real movement, a marker set that changes between reports, a
 * report with no panel behind it, and both a mildly and a significantly
 * out-of-range result on the newest report.
 *
 * The values are a deliberate clinical narrative, not noise (see
 * demoReports below for the per-report annotations):
 *   · Vitamin D   — clearly low at baseline, then the classic
 *                   supplementation recovery across all four reports.
 *   · HbA1c       — creeping up, in range until the newest report tips it
 *                   just over, with fasting insulin/glucose corroborating.
 *   · Ferritin    — falling steadily, ending frankly low.
 *   · hs-CRP      — one-off inflammatory spike in the third report
 *                   (significantly high), settled by the fourth.
 *   · Everything else drifts naturally within range — no repeated numbers.
 *
 * Deliberately writes Report/ReportResult/ReferenceRange/EscalationEvent
 * rows directly (mirroring what reports/service.ts verifyReport() and
 * escalation/service.ts checkAndEscalate() produce) rather than driving the
 * upload → verify → review → release state machine: this is synthetic
 * history, not a live workflow to simulate. No notification is actually
 * sent for the escalations — channelsNotified is left empty rather than
 * claiming an email went out that never did.
 *
 * Requires the main catalogue seed (prisma/seed.ts) to have already run —
 * it looks up panels/markers/sources by key and fails loudly if they're
 * missing rather than silently creating a parallel, undocumented catalogue.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { maskEmail } from '@aspire-bloods/shared';
import { prisma } from '../src/db/client.js';
import { encryptField, generateToken } from '../src/lib/crypto.js';
import { hashPassword } from '../src/lib/password.js';
import { computeMarkerStatus } from '../src/lib/markerStatus.js';

// The demo patient's own login. Overridable because 2FA is not bypassed for
// demo accounts — wherever email is genuinely being delivered (i.e.
// production), this has to be an address you can open.
const DEMO_PATIENT_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';

// Staff attribution for the synthetic reports. In dev these are the dev
// staff prisma/seed.ts creates; in production seed.ts deliberately creates
// no staff logins at all, so the two accounts below get created instead —
// see resolveDemoStaff().
const DEV_ADMIN_EMAIL = 'admin@aspireshield.dev';
const DEV_CLINICIAN_EMAIL = 'clinician@aspireshield.dev';
const DEMO_ADMIN_EMAIL = 'demo.admin@aspireshield.dev';
const DEMO_CLINICIAN_EMAIL = 'demo.clinician@aspireshield.dev';

const args = process.argv.slice(2);
const isProduction = process.env.NODE_ENV === 'production';
/** Called by the container start script on every boot — see package.json. */
const bootMode = args.includes('--boot');
/** The single switch that turns demo data on for a deployed environment. */
const demoDataEnabled = process.env.SEED_DEMO_DATA === 'true';
const productionAllowed = args.includes('--allow-production') || (bootMode && demoDataEnabled);

/** Every ReferenceRange this file writes is prefixed with this — it's the handle for cleanup. */
const DEMO_RANGE_TAG = 'DEMO DATA';

/**
 * Records what this run did, so a swallowed boot-mode failure is visible to an
 * admin instead of only to whoever can read the deploy logs. See the
 * DemoSeedRun model — one row, overwritten every boot.
 *
 * Only boot-mode runs record: a hand-run seed already has its outcome on the
 * terminal in front of you, and writing there would overwrite the deployment's
 * own state with a developer's local one.
 *
 * Deliberately swallows its OWN failure. This is diagnostic bookkeeping; if it
 * cannot be written (a database that is up enough to seed but not to take this
 * row is barely conceivable), that must not turn an already-degraded boot into
 * a failed one.
 */
async function recordSeedRun(
  outcome: 'SKIPPED' | 'SUCCEEDED' | 'FAILED',
  detail: string,
  extra: { durationMs?: number; reportsCreated?: number; errorMessage?: string } = {},
): Promise<void> {
  if (!bootMode) return;
  const data = {
    outcome,
    ranAt: new Date(),
    durationMs: extra.durationMs ?? null,
    reportsCreated: extra.reportsCreated ?? 0,
    // Never the address in full: SEED_DEMO_EMAIL is a real mailbox anywhere
    // 2FA email is genuinely delivered.
    patientEmail: outcome === 'SKIPPED' ? null : maskEmail(DEMO_PATIENT_EMAIL),
    detail,
    errorMessage: extra.errorMessage ?? null,
  };
  try {
    await prisma.demoSeedRun.upsert({ where: { id: 'last' }, update: data, create: { id: 'last', ...data } });
  } catch (e) {
    console.error('[seedDemo] could not record the seed outcome for the admin console:', e);
  }
}

const SIGNIFICANT_STATUSES = new Set(['SIGNIFICANT_HIGH', 'SIGNIFICANT_LOW']);
const OUT_OF_RANGE_STATUSES = new Set(['HIGH', 'LOW', 'SIGNIFICANT_HIGH', 'SIGNIFICANT_LOW']);

interface DemoResultInput {
  markerKey: string;
  value: number;
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
// Dates are relative to the seed run, not hardcoded, so "recent, within the
// last month" stays true whenever this is re-run for a demo.
// ---------------------------------------------------------------------------
const now = new Date();

function sampleDateFor(input: DemoReportInput): Date {
  if (input.daysAgo !== undefined) {
    const d = new Date(now.getTime() - input.daysAgo * 24 * 60 * 60 * 1000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 15));
  }
  // dayOfMonth is always <= 28 below, so month arithmetic can't overflow.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (input.monthsAgo ?? 0), input.dayOfMonth ?? 12, 9, 15));
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
      'A fully in-range report — no attention state at all — and a marker list that shares only six markers with the baseline.',
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

/**
 * Deletes every report-shaped row belonging to the demo patient, plus the
 * ReferenceRange rows this file tagged. Used both by --purge and by the
 * normal run, so re-seeding is idempotent instead of stacking duplicate
 * history on the same patient.
 */
async function deleteDemoReports(patientId: string): Promise<number> {
  const reports = await prisma.report.findMany({ where: { patientId }, select: { id: true } });
  const ids = reports.map((r) => r.id);
  if (ids.length > 0) {
    await prisma.escalationEvent.deleteMany({ where: { reportId: { in: ids } } });
    await prisma.reportResultEdit.deleteMany({ where: { reportResult: { reportId: { in: ids } } } });
    await prisma.reportResult.deleteMany({ where: { reportId: { in: ids } } });
    await prisma.auditLogEntry.deleteMany({ where: { targetType: 'Report', targetId: { in: ids } } });
    await prisma.report.deleteMany({ where: { id: { in: ids } } });
  }
  // Safe to do unconditionally: only this file ever writes this tag, and the
  // results that referenced these rows have just gone.
  await prisma.referenceRange.deleteMany({ where: { source: { startsWith: DEMO_RANGE_TAG } } });
  return ids.length;
}

/** `npm run prisma:seed:demo -- --purge` — removes the demo patient entirely. */
async function purge() {
  const patient = await prisma.user.findUnique({ where: { email: DEMO_PATIENT_EMAIL } });
  if (!patient) {
    console.log(`No demo patient (${DEMO_PATIENT_EMAIL}) found — nothing to purge.`);
    return;
  }
  const reportCount = await deleteDemoReports(patient.id);
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

  // Placeholder staff exist only where this file created them (production).
  // The real dev staff accounts are never touched — different emails.
  for (const email of [DEMO_ADMIN_EMAIL, DEMO_CLINICIAN_EMAIL]) {
    const staff = await prisma.user.findUnique({ where: { email } });
    if (!staff) continue;
    await prisma.staffProfile.deleteMany({ where: { userId: staff.id } });
    await prisma.auditLogEntry.deleteMany({ where: { actorUserId: staff.id } });
    await prisma.user.delete({ where: { id: staff.id } });
    console.log(`  · removed placeholder staff account ${email}`);
  }

  console.log(`Purged demo patient ${DEMO_PATIENT_EMAIL} and ${reportCount} demo report(s).`);
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
async function resolveDemoStaff() {
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

const startedAt = Date.now();

async function main() {
  // Boot-mode call from the container start script: absent the opt-in
  // variable this is a no-op, so the same start command is safe on a real
  // production service that has never wanted demo data.
  //
  // Recorded rather than merely returned. "The switch is off" and "the switch
  // is on and the seed died" produce the identical symptom — an account that
  // signs in and holds nothing — and telling them apart afterwards is the
  // whole point of the DemoSeedRun row.
  if (bootMode && !demoDataEnabled) {
    await recordSeedRun(
      'SKIPPED',
      'SEED_DEMO_DATA is not set to "true", so no demo data was seeded on this deploy.',
    );
    return;
  }

  if (isProduction && !productionAllowed) {
    console.log(
      'NODE_ENV=production and no explicit opt-in — refusing to touch demo data. ' +
        'Set SEED_DEMO_DATA=true, or pass --allow-production, if that is genuinely what you want.',
    );
    return;
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

  if (args.includes('--purge')) {
    await purge();
    return;
  }

  const { admin, clinician } = await resolveDemoStaff();

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

  console.log('Seeding demo patient...');
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';
  const patient = await prisma.user.upsert({
    where: { email: DEMO_PATIENT_EMAIL },
    update: { passwordHash: await hashPassword(demoPassword), status: 'ACTIVE' },
    create: {
      email: DEMO_PATIENT_EMAIL,
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

  console.log('Granting demo consents...');
  const consentVersions = await prisma.consentVersion.findMany({ where: { version: 1 } });
  for (const cv of consentVersions) {
    const existing = await prisma.consentRecord.findFirst({ where: { userId: patient.id, consentVersionId: cv.id } });
    if (existing) continue;
    await prisma.consentRecord.create({
      data: { userId: patient.id, consentVersionId: cv.id, granted: true, ipAddress: '127.0.0.1' },
    });
  }

  console.log('Removing any previously-seeded demo reports (idempotent re-run)...');
  await deleteDemoReports(patient.id);

  console.log('Seeding demo reports...');
  const usedMarkerIds = new Set<string>();

  for (const [index, reportInput] of demoReports.entries()) {
    const panel = reportInput.panelKey ? panelsByKey.get(reportInput.panelKey)! : null;
    const source = sourcesByKey.get(reportInput.sourceKey)!;
    const sampleDate = sampleDateFor(reportInput);
    const day = 1000 * 60 * 60 * 24;
    const verifiedAt = new Date(sampleDate.getTime() + day);
    const reviewedAt = new Date(sampleDate.getTime() + day * 2);
    const releasedAt = new Date(sampleDate.getTime() + day * 2 + 1000 * 60 * 45);

    // Everything that doesn't need the database is computed first, so the
    // transaction below is a handful of round trips rather than two per
    // marker. The widest report here has 41 markers; written one row at a
    // time that was ~85 sequential round trips inside a single interactive
    // transaction, which Prisma closes after 5 seconds by default. On a local
    // Postgres that finishes in ~150ms and looks fine forever; against a
    // managed database on the other side of a network it is one bad latency
    // day from a P2028 that this file would then swallow at boot. Ids are
    // generated here rather than by the database precisely so the results can
    // reference their ranges without a round trip in between.
    const reportId = randomUUID();
    const flaggedMarkerIds: string[] = [];
    let anySignificant = false;
    const rangeRows: { id: string; markerId: string; sex: 'FEMALE'; unit: string; low: number; high: number; source: string }[] = [];
    const resultRows: {
      reportId: string;
      markerId: string;
      valueEncrypted: string;
      unit: string;
      referenceRangeId: string;
      status: ReturnType<typeof computeMarkerStatus>;
      createdAt: Date;
    }[] = [];

    for (const res of reportInput.results) {
      const marker = markersByKey.get(res.markerKey)!;
      usedMarkerIds.add(marker.id);
      const unit = res.unit ?? marker.defaultUnit;

      // Written per report, exactly as verifyReport() does — the range
      // belongs to the result, not to the marker, which is what lets the
      // vitamin D and ferritin bands move mid-series.
      const rangeId = randomUUID();
      rangeRows.push({
        id: rangeId,
        markerId: marker.id,
        sex: 'FEMALE',
        unit,
        low: res.low,
        high: res.high,
        source: `${DEMO_RANGE_TAG}: synthetic ${source.name} range, report ${index + 1} of ${demoReports.length}`,
      });

      const status = computeMarkerStatus(res.value, res.low, res.high, marker.severityMultiplier, marker.severityAbsoluteDelta);
      if (OUT_OF_RANGE_STATUSES.has(status)) flaggedMarkerIds.push(marker.id);
      if (SIGNIFICANT_STATUSES.has(status)) anySignificant = true;

      resultRows.push({
        reportId,
        markerId: marker.id,
        valueEncrypted: encryptField(String(res.value)),
        unit,
        referenceRangeId: rangeId,
        status,
        createdAt: verifiedAt,
      });
    }

    const flagged = await prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          id: reportId,
          patientId: patient.id,
          panelId: panel?.id ?? null,
          sourceId: source.id,
          sampleDate,
          receivedDate: new Date(sampleDate.getTime() + day),
          status: 'RELEASED',
          uploadedById: admin.id,
          verifiedById: admin.id,
          verifiedAt,
          reviewedById: clinician.id,
          reviewedAt,
          releasedAt,
          createdAt: releasedAt,
        },
      });

      await tx.referenceRange.createMany({ data: rangeRows });
      await tx.reportResult.createMany({ data: resultRows });

      // Mirrors escalation/service.ts checkAndEscalate(), minus the actual
      // email/SMS — channelsNotified stays empty because nothing was really
      // sent, and inventing a notification in the record would be a lie.
      if (flaggedMarkerIds.length > 0) {
        await tx.escalationEvent.create({
          data: {
            reportId: report.id,
            severity: anySignificant ? 'SIGNIFICANT' : 'MILD',
            channelsNotified: [],
            flaggedMarkerIds,
            createdAt: releasedAt,
          },
        });
      }

      await tx.auditLogEntry.create({
        data: {
          actorType: 'SYSTEM',
          action: 'REPORT_RELEASED',
          targetType: 'Report',
          targetId: report.id,
          metadata: { demoData: true, source: 'seedDemo', markerCount: reportInput.results.length },
          createdAt: releasedAt,
        },
      });

      return flaggedMarkerIds.length;
    });

    const title = panel?.name ?? `${reportInput.results.length} markers (no panel)`;
    console.log(
      `  · ${sampleDate.toISOString().slice(0, 10)}  ${title} — ${reportInput.results.length} markers, ${flagged} flagged  [${reportId.slice(0, 8)}]`,
    );
  }

  // Dev-only: publish the explanation copy for markers used above so the
  // marker detail pages show authored copy rather than the "being finalised"
  // placeholder. Everything else in the catalogue stays DRAFT/gated exactly
  // as prisma/seed.ts left it — this only touches markers this demo
  // patient's reports reference.
  //
  // Deliberately skipped in production. Attributing clinical sign-off to a
  // placeholder clinician who reviewed nothing is not a thing to do to a
  // live record, and it isn't needed either: prisma/seed.ts already
  // promotes untouched seed copy to REVIEWED under a SYSTEM actor, and the
  // patient read path shows REVIEWED as well as PUBLISHED.
  if (!isProduction) {
    console.log('Publishing marker explanations used by the demo (dev-only convenience)...');
    for (const markerId of usedMarkerIds) {
      await prisma.markerExplanation.updateMany({
        where: { markerId, reviewStatus: { in: ['DRAFT', 'REVIEWED'] } },
        data: { reviewStatus: 'PUBLISHED', reviewedById: clinician.id, reviewedAt: new Date() },
      });
    }
  }

  const dates = demoReports.map((r) => sampleDateFor(r).getTime());
  const spanMonths = Math.round((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24 * 30.44));

  await recordSeedRun(
    'SUCCEEDED',
    `${demoReports.length} released reports spanning ~${spanMonths} months, ${usedMarkerIds.size} distinct markers.`,
    { durationMs: Date.now() - startedAt, reportsCreated: demoReports.length },
  );

  console.log('\nDemo data seed complete — synthetic data, remove with `npm run prisma:seed:demo -- --purge`.');
  console.log(`${demoReports.length} released reports spanning ~${spanMonths} months, ${usedMarkerIds.size} distinct markers.`);
  console.log(`\nDemo patient login: ${DEMO_PATIENT_EMAIL} / ${demoPassword}`);
  console.log('(Login is email + password, then the emailed OTP — check the API logs for the code in dev.)');
}

main()
  .catch(async (e) => {
    console.error(e);
    // In boot mode this runs inside the API container's start command, so a
    // non-zero exit would take the whole service down over demo data.
    // Loud in the logs, fatal to nothing — and now also written down, because
    // "loud in the logs" is only loud to someone already reading them, and
    // the person who notices the missing data is looking at the admin console.
    if (bootMode) {
      console.error('[seedDemo] boot-mode demo seed FAILED — continuing startup without demo data.');
      await recordSeedRun('FAILED', 'The demo data seed failed. No demo reports were written on this deploy.', {
        durationMs: Date.now() - startedAt,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
