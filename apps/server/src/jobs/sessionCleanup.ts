import { prisma } from '../db/client.js';

/** Hygiene job: expired auth artefacts have no reason to linger in the database. */
export async function runSessionCleanupJob(): Promise<void> {
  const now = new Date();

  await prisma.otpCode.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.refreshToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }] } });
  await prisma.inviteToken.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.emailVerificationCode.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.trustedDevice.deleteMany({ where: { trustedUntil: { lt: now } } });
}
