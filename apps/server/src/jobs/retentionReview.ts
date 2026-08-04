import { prisma } from '../db/client.js';
import { recordAuditLog } from '../lib/auditLog.js';

/**
 * Configurable retention policy with an automated review job (brief §6).
 * Deliberately does NOT auto-delete clinical records — that decision
 * needs a human (the practice's DPO) given the legal retention exception
 * for health records. This job surfaces what's due for review via the
 * audit log and updates lastReviewedAt so the review is itself tracked.
 */
export async function runRetentionReviewJob(): Promise<void> {
  const policies = await prisma.retentionPolicy.findMany();

  for (const policy of policies) {
    const cutoff = new Date(Date.now() - policy.retentionPeriodDays * 24 * 60 * 60 * 1000);
    let dueCount = 0;

    if (policy.dataType === 'CLINICAL_REPORTS') {
      dueCount = await prisma.report.count({ where: { createdAt: { lt: cutoff } } });
    } else if (policy.dataType === 'AUDIT_LOG') {
      dueCount = await prisma.auditLogEntry.count({ where: { createdAt: { lt: cutoff } } });
    } else if (policy.dataType === 'CONSENT_RECORDS') {
      dueCount = await prisma.consentRecord.count({ where: { createdAt: { lt: cutoff } } });
    }

    await prisma.retentionPolicy.update({ where: { id: policy.id }, data: { lastReviewedAt: new Date() } });

    if (dueCount > 0) {
      await recordAuditLog({
        actorType: 'SYSTEM',
        action: 'RETENTION_REVIEW_DUE',
        targetType: 'RetentionPolicy',
        targetId: policy.id,
        metadata: { dataType: policy.dataType, dueCount, retentionPeriodDays: policy.retentionPeriodDays },
      });
    }
  }
}
