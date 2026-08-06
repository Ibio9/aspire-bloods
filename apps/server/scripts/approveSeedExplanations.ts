/**
 * One-time data fix (hardening §1): the seeded marker copy in prisma/seed.ts
 * is real Aspire-authored content, not placeholder text, but it's created
 * with reviewStatus: 'DRAFT' like any new copy — the clinician review gate
 * makes no exception for seed data, on purpose (getMarkerTrendForPatient
 * only shows REVIEWED/PUBLISHED explanations). Without an explicit sign-off
 * step, a fresh install shows every marker's placeholder "being finalised"
 * text instead of the actual copy. This script IS that sign-off — a
 * one-time run, not a bypass, and every marker it touches gets its own
 * audit row exactly like an approval made through the review queue UI.
 * Re-running it is safe (idempotent — only touches rows still in DRAFT).
 */
import 'dotenv/config';
import { prisma } from '../src/db/client.js';
import { recordAuditLog } from '../src/lib/auditLog.js';

async function main() {
  const drafts = await prisma.markerExplanation.findMany({ where: { reviewStatus: 'DRAFT' } });
  if (drafts.length === 0) {
    console.log('No draft explanations to approve.');
    return;
  }

  const now = new Date();
  await prisma.$transaction(
    drafts.map((e) =>
      prisma.markerExplanation.update({
        where: { id: e.id },
        data: { reviewStatus: 'REVIEWED', reviewedById: null, reviewedAt: now },
      }),
    ),
  );

  for (const e of drafts) {
    await recordAuditLog({
      actorType: 'SYSTEM',
      action: 'MARKER_EXPLANATION_REVIEW_STATUS_CHANGED',
      targetType: 'MarkerExplanation',
      targetId: e.id,
      metadata: { reviewStatus: 'REVIEWED', source: 'approveSeedExplanations script (one-time seed sign-off)' },
    });
  }

  console.log(`Approved ${drafts.length} seeded explanation(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
