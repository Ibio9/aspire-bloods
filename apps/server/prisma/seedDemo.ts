/**
 * ============================================================================
 *  DEMO DATA — NOT REAL PATIENT DATA. Trivially removable before go-live:
 *  delete this file and drop its npm script entry. Nothing else in the app
 *  depends on it — every other seed/runtime path works fine without it.
 * ============================================================================
 *
 * Creates one ACTIVE demo patient with five RELEASED reports spread across
 * ~18 months, so the trend charts, "untested markers don't render" rule, and
 * the escalation/attention state all have real data to show a practice —
 * see the brief: "priority, I'm showing this to the practice."
 *
 * Deliberately writes Report/ReportResult/ReferenceRange rows directly
 * (mirroring exactly what reports/service.ts verifyReport() does) rather
 * than driving the upload → verify → review → release state machine — this
 * is synthetic historical data, not a live workflow to simulate.
 *
 * Requires the main catalogue seed (prisma/seed.ts) to have already run —
 * it looks up panels/markers/sources by key and fails loudly if they're
 * missing rather than silently creating a parallel, undocumented catalogue.
 */
import 'dotenv/config';
import { prisma } from '../src/db/client.js';
import { encryptField } from '../src/lib/crypto.js';
import { hashPassword } from '../src/lib/password.js';
import { computeMarkerStatus } from '../src/lib/markerStatus.js';

const DEMO_PATIENT_EMAIL = 'demo.showcase@aspireshield.dev';

interface DemoResultInput {
  markerKey: string;
  value: number;
  low: number;
  high: number;
  /** Defaults to the marker's own defaultUnit when omitted. */
  unit?: string;
}

interface DemoReportInput {
  panelKey: string;
  sourceKey: string;
  sampleDate: string; // YYYY-MM-DD
  results: DemoResultInput[];
}

// ---------------------------------------------------------------------------
// The clinical story (brief §2): vitamin D starts low and improves, HbA1c
// creeps up until it's clearly out of range in the latest report, ferritin
// drifts down. Everything else stays comfortably in range. Each report uses
// a different panel, so different reports carry different marker sets —
// visible proof that untested markers simply don't render rather than
// showing as zero/blank.
// ---------------------------------------------------------------------------
const demoReports: DemoReportInput[] = [
  {
    // Baseline — Advanced GP3 (Female), full panel.
    panelKey: 'advanced-gp3-female',
    sourceKey: 'randox_portal',
    sampleDate: '2025-02-12',
    results: [
      { markerKey: 'haemoglobin-f', value: 133, low: 120, high: 150 },
      { markerKey: 'wbc', value: 6.1, low: 4.0, high: 11.0 },
      { markerKey: 'platelets', value: 258, low: 150, high: 400 },
      { markerKey: 'alt', value: 19, low: 0, high: 41 },
      { markerKey: 'ast', value: 22, low: 0, high: 40 },
      { markerKey: 'ggt', value: 24, low: 0, high: 60 },
      { markerKey: 'creatinine', value: 64, low: 60, high: 110 },
      { markerKey: 'egfr', value: 98, low: 90, high: 120 },
      { markerKey: 'total-cholesterol', value: 4.5, low: 0, high: 5.0 },
      { markerKey: 'hdl', value: 1.7, low: 1.0, high: 2.2 },
      { markerKey: 'ldl', value: 2.4, low: 0, high: 3.0 },
      { markerKey: 'triglycerides', value: 1.0, low: 0, high: 1.7 },
      { markerKey: 'glucose', value: 4.7, low: 3.9, high: 5.5 },
      { markerKey: 'hba1c', value: 36, low: 20, high: 42 }, // trend: creeping up
      { markerKey: 'tsh', value: 1.7, low: 0.4, high: 4.0 },
      { markerKey: 'free-t4', value: 14, low: 9, high: 21 },
      { markerKey: 'free-t3', value: 4.6, low: 3.1, high: 6.8 },
      { markerKey: 'vitamin-d', value: 38, low: 50, high: 250 }, // trend: starts low
      { markerKey: 'vitamin-b12', value: 420, low: 197, high: 771 },
      { markerKey: 'ferritin', value: 95, low: 30, high: 400 }, // trend: dropping
      { markerKey: 'testosterone-f', value: 1.0, low: 0.3, high: 1.7 },
      { markerKey: 'oestradiol', value: 305, low: 100, high: 500 },
      { markerKey: 'shbg', value: 39, low: 10, high: 57 },
    ],
  },
  {
    // Different marker set entirely — nutritional panel, in-house retest.
    panelKey: 'nutritional-health-hsc15',
    sourceKey: 'aspire_inhouse',
    sampleDate: '2025-06-05',
    results: [
      { markerKey: 'vitamin-d', value: 52, low: 50, high: 250 }, // trend: improving, just crossed into range
      { markerKey: 'vitamin-b12', value: 435, low: 197, high: 771 },
      { markerKey: 'folate', value: 15.2, low: 3.9, high: 26.8 },
      { markerKey: 'ferritin', value: 58, low: 30, high: 400 }, // trend: dropping
      { markerKey: 'iron', value: 17, low: 10, high: 30 },
      { markerKey: 'tibc', value: 57, low: 45, high: 72 },
      { markerKey: 'calcium', value: 2.4, low: 2.2, high: 2.6 },
      { markerKey: 'rbc-magnesium', value: 1.9, low: 1.5, high: 2.5 },
      { markerKey: 'zinc', value: 13, low: 10, high: 18 },
      { markerKey: 'haemoglobin', value: 129, low: 120, high: 150 }, // female range applied at report level, see note above
      { markerKey: 'albumin', value: 44, low: 35, high: 50 },
      { markerKey: 'total-protein', value: 72, low: 60, high: 80 },
      { markerKey: 'uric-acid', value: 215, low: 140, high: 420 },
      { markerKey: 'hba1c', value: 41, low: 20, high: 42 }, // trend: creeping up, now borderline
    ],
  },
  {
    // Different marker set again — general Signature check.
    panelKey: 'signature',
    sourceKey: 'randox_portal',
    sampleDate: '2025-11-15',
    results: [
      { markerKey: 'haemoglobin-f', value: 131, low: 120, high: 150 },
      { markerKey: 'wbc', value: 5.8, low: 4.0, high: 11.0 },
      { markerKey: 'platelets', value: 249, low: 150, high: 400 },
      { markerKey: 'alt', value: 21, low: 0, high: 41 },
      { markerKey: 'creatinine', value: 67, low: 60, high: 110 },
      { markerKey: 'egfr', value: 96, low: 90, high: 120 },
      { markerKey: 'total-cholesterol', value: 4.7, low: 0, high: 5.0 },
      { markerKey: 'hdl', value: 1.6, low: 1.0, high: 2.2 },
      { markerKey: 'ldl', value: 2.6, low: 0, high: 3.0 },
      { markerKey: 'triglycerides', value: 1.1, low: 0, high: 1.7 },
      { markerKey: 'glucose', value: 4.9, low: 3.9, high: 5.5 },
      { markerKey: 'tsh', value: 2.0, low: 0.4, high: 4.0 },
    ],
  },
  {
    // Cardiovascular deep-dive — yet another marker set.
    panelKey: 'rp10-heart-health',
    sourceKey: 'randox_portal',
    sampleDate: '2026-03-20',
    results: [
      { markerKey: 'total-cholesterol', value: 4.5, low: 0, high: 5.0 },
      { markerKey: 'hdl', value: 1.6, low: 1.0, high: 2.2 },
      { markerKey: 'ldl', value: 2.4, low: 0, high: 3.0 },
      { markerKey: 'triglycerides', value: 1.0, low: 0, high: 1.7 },
      { markerKey: 'chol-hdl-ratio', value: 2.8, low: 0, high: 4.5 },
      { markerKey: 'hs-crp', value: 1.2, low: 0, high: 3.0 },
      { markerKey: 'homocysteine', value: 9, low: 0, high: 15 },
    ],
  },
  {
    // Latest — back to Advanced GP3 (Female) for a clean before/after
    // comparison. HbA1c is now clearly out of range, so the escalation /
    // "needs attention" state is visibly live on the newest report.
    panelKey: 'advanced-gp3-female',
    sourceKey: 'randox_portal',
    sampleDate: '2026-07-22',
    results: [
      { markerKey: 'haemoglobin-f', value: 134, low: 120, high: 150 },
      { markerKey: 'wbc', value: 6.3, low: 4.0, high: 11.0 },
      { markerKey: 'platelets', value: 262, low: 150, high: 400 },
      { markerKey: 'alt', value: 23, low: 0, high: 41 },
      { markerKey: 'ast', value: 21, low: 0, high: 40 },
      { markerKey: 'ggt', value: 27, low: 0, high: 60 },
      { markerKey: 'creatinine', value: 65, low: 60, high: 110 },
      { markerKey: 'egfr', value: 97, low: 90, high: 120 },
      { markerKey: 'total-cholesterol', value: 4.6, low: 0, high: 5.0 },
      { markerKey: 'hdl', value: 1.6, low: 1.0, high: 2.2 },
      { markerKey: 'ldl', value: 2.5, low: 0, high: 3.0 },
      { markerKey: 'triglycerides', value: 1.1, low: 0, high: 1.7 },
      { markerKey: 'glucose', value: 5.6, low: 3.9, high: 5.5 },
      { markerKey: 'hba1c', value: 48, low: 20, high: 42 }, // trend endpoint: clearly HIGH — the escalation flag
      { markerKey: 'tsh', value: 1.9, low: 0.4, high: 4.0 },
      { markerKey: 'free-t4', value: 15, low: 9, high: 21 },
      { markerKey: 'free-t3', value: 4.4, low: 3.1, high: 6.8 },
      { markerKey: 'vitamin-d', value: 68, low: 50, high: 250 }, // trend endpoint: solidly in range now
      { markerKey: 'vitamin-b12', value: 402, low: 197, high: 771 },
      { markerKey: 'ferritin', value: 31, low: 30, high: 400 }, // trend endpoint: low-normal, still in range
      { markerKey: 'testosterone-f', value: 1.1, low: 0.3, high: 1.7 },
      { markerKey: 'oestradiol', value: 298, low: 100, high: 500 },
      { markerKey: 'shbg', value: 37, low: 10, high: 57 },
    ],
  },
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.log('NODE_ENV=production — refusing to seed demo data.');
    return;
  }

  const admin = await prisma.user.findUnique({ where: { email: 'admin@aspireshield.dev' } });
  const clinician = await prisma.user.findUnique({ where: { email: 'clinician@aspireshield.dev' } });
  if (!admin || !clinician) {
    throw new Error(
      'Dev staff users not found — run `npm run prisma:seed` (the main catalogue seed) before seeding demo data.',
    );
  }

  const sourcesByKey = new Map(
    (await prisma.source.findMany({ where: { key: { in: ['randox_portal', 'aspire_inhouse'] } } })).map((s) => [
      s.key,
      s,
    ]),
  );
  if (sourcesByKey.size < 2) {
    throw new Error('Sources not seeded — run `npm run prisma:seed` first.');
  }

  const panelKeys = [...new Set(demoReports.map((r) => r.panelKey))];
  const panels = await prisma.panel.findMany({ where: { key: { in: panelKeys } } });
  const panelsByKey = new Map(panels.map((p) => [p.key, p]));
  for (const key of panelKeys) {
    if (!panelsByKey.has(key)) throw new Error(`Panel "${key}" not found — run \`npm run prisma:seed\` first.`);
  }

  const markerKeys = [...new Set(demoReports.flatMap((r) => r.results.map((res) => res.markerKey)))];
  const markers = await prisma.marker.findMany({ where: { key: { in: markerKeys } } });
  const markersByKey = new Map(markers.map((m) => [m.key, m]));
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
  const oldReports = await prisma.report.findMany({ where: { patientId: patient.id }, select: { id: true } });
  if (oldReports.length > 0) {
    const oldIds = oldReports.map((r) => r.id);
    await prisma.reportResult.deleteMany({ where: { reportId: { in: oldIds } } });
    await prisma.report.deleteMany({ where: { id: { in: oldIds } } });
  }

  console.log('Seeding demo reports...');
  const reviewedExplanationMarkerIds = new Set<string>();

  for (const reportInput of demoReports) {
    const panel = panelsByKey.get(reportInput.panelKey)!;
    const source = sourcesByKey.get(reportInput.sourceKey)!;
    const sampleDate = new Date(reportInput.sampleDate);
    const verifiedAt = new Date(sampleDate.getTime() + 1000 * 60 * 60 * 24);
    const reviewedAt = new Date(sampleDate.getTime() + 1000 * 60 * 60 * 24 * 2);

    await prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          patientId: patient.id,
          panelId: panel.id,
          sourceId: source.id,
          sampleDate,
          receivedDate: sampleDate,
          status: 'RELEASED',
          uploadedById: admin.id,
          verifiedById: admin.id,
          verifiedAt,
          reviewedById: clinician.id,
          reviewedAt,
          releasedAt: reviewedAt,
          createdAt: reviewedAt,
        },
      });

      for (const res of reportInput.results) {
        const marker = markersByKey.get(res.markerKey)!;
        reviewedExplanationMarkerIds.add(marker.id);
        const unit = res.unit ?? marker.defaultUnit;

        const referenceRange = await tx.referenceRange.create({
          data: {
            markerId: marker.id,
            sex: 'FEMALE',
            unit,
            low: res.low,
            high: res.high,
            source: `${source.name}, verified ${verifiedAt.toISOString().slice(0, 10)} (demo report ${report.id})`,
          },
        });

        const status = computeMarkerStatus(res.value, res.low, res.high, marker.severityMultiplier, marker.severityAbsoluteDelta);

        await tx.reportResult.create({
          data: {
            reportId: report.id,
            markerId: marker.id,
            valueEncrypted: encryptField(String(res.value)),
            unit,
            referenceRangeId: referenceRange.id,
            status,
          },
        });
      }
    });
  }

  // Demo-only: publish the explanation copy for markers actually used above
  // so the marker detail pages show the authored copy instead of the "being
  // finalised" placeholder when presenting this to the practice. Everything
  // else in the catalogue stays DRAFT/gated exactly as prisma/seed.ts left
  // it — this only touches markers this demo patient's reports reference.
  console.log('Publishing marker explanations used by the demo (demo-only convenience)...');
  for (const markerId of reviewedExplanationMarkerIds) {
    await prisma.markerExplanation.updateMany({
      where: { markerId, reviewStatus: 'DRAFT' },
      data: { reviewStatus: 'PUBLISHED', reviewedById: clinician.id, reviewedAt: new Date() },
    });
  }

  console.log('\nDemo data seed complete.');
  console.log(`Demo patient login: ${DEMO_PATIENT_EMAIL} / ${demoPassword}`);
  console.log(`${demoReports.length} released reports seeded across ${reportSpanMonths(demoReports)} months.`);
}

function reportSpanMonths(reports: DemoReportInput[]): number {
  const dates = reports.map((r) => new Date(r.sampleDate).getTime());
  const spanMs = Math.max(...dates) - Math.min(...dates);
  return Math.round(spanMs / (1000 * 60 * 60 * 24 * 30));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
