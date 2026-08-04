import { prisma } from '../db/client.js';
import { encryptField } from '../lib/crypto.js';
import { recordAuditLog } from '../lib/auditLog.js';

/**
 * Runs the scheduled purges (brief §6: right to erasure with a documented
 * retention exception for clinical records). Anonymises identifying PII
 * on the patient's profile and disables the account; Report/ReportResult
 * rows are kept intact — the practice has a clinical-records retention
 * obligation that overrides a PII erasure request, so we de-identify
 * rather than delete the clinical data itself.
 */
export async function runErasurePurgeJob(): Promise<number> {
  const due = await prisma.erasureRequest.findMany({
    where: { status: 'SCHEDULED', purgeScheduledAt: { lte: new Date() } },
  });

  for (const request of due) {
    await prisma.$transaction(async (tx) => {
      const anonymisedEmail = `erased-${request.userId}@deleted.invalid`;

      await tx.user.update({
        where: { id: request.userId },
        data: { email: anonymisedEmail, status: 'DISABLED' },
      });

      const profile = await tx.patientProfile.findUnique({ where: { userId: request.userId } });
      if (profile) {
        await tx.patientProfile.update({
          where: { userId: request.userId },
          data: {
            title: null,
            firstName: 'Erased',
            lastName: 'Patient',
            dobEncrypted: encryptField('ERASED'),
            contactNumberEncrypted: encryptField('ERASED'),
            addressEncrypted: encryptField('ERASED'),
            postcode: 'ERASED',
            gpName: null,
            gpAddressEncrypted: null,
            medicationEncrypted: null,
            allergiesEncrypted: null,
            emergencyContactName: null,
            emergencyContactNumberEncrypted: null,
          },
        });
      }

      await tx.erasureRequest.update({
        where: { id: request.id },
        data: { status: 'COMPLETED', purgedAt: new Date() },
      });
    });

    await recordAuditLog({
      actorType: 'SYSTEM',
      action: 'ERASURE_PURGED',
      targetType: 'ErasureRequest',
      targetId: request.id,
      metadata: { userId: request.userId },
    });
  }

  return due.length;
}
