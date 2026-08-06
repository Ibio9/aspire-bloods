import { prisma } from '../../db/client.js';
import { decryptField } from '../../lib/crypto.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { hashToken, generateToken } from '../../lib/crypto.js';
import { emailProvider } from '../notifications/index.js';
import { env } from '../../config/env.js';
import { formatReportTitle } from '@aspire-bloods/shared';

export class AdminError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const INVITE_TTL_DAYS = 7;

function staffOrPatientName(user: {
  email: string;
  staffProfile?: { firstName: string; lastName: string } | null;
  patientProfile?: { firstName: string; lastName: string } | null;
}): string {
  // Self-registered admins are patient-shaped accounts underneath (see
  // auth/service.ts signup()) — they have a patientProfile, not a
  // staffProfile. Falls back to email if neither exists yet (freshly
  // invited, not yet activated).
  if (user.staffProfile) return `${user.staffProfile.firstName} ${user.staffProfile.lastName}`;
  if (user.patientProfile) return `${user.patientProfile.firstName} ${user.patientProfile.lastName}`;
  return user.email;
}

export async function getPatientProfile(patientId: string) {
  const user = await prisma.user.findUnique({
    where: { id: patientId },
    include: { patientProfile: true, deactivatedBy: { include: { staffProfile: true, patientProfile: true } } },
  });
  if (!user || user.role !== 'PATIENT') throw new AdminError('Patient not found', 404);

  const p = user.patientProfile;

  return {
    id: user.id,
    email: user.email,
    status: user.status,
    createdAt: user.createdAt,
    deactivatedAt: user.deactivatedAt,
    deactivatedByName: user.deactivatedBy ? staffOrPatientName(user.deactivatedBy) : null,
    deactivationReason: user.deactivationReason,
    profile: p
      ? {
          title: p.title,
          firstName: p.firstName,
          lastName: p.lastName,
          sex: p.sex,
          dob: decryptField(p.dobEncrypted),
          contactNumber: decryptField(p.contactNumberEncrypted),
          // Optional since self-registration — a self-registered patient has
          // never been asked for these, so null means "not given", not "lost".
          address: p.addressEncrypted ? decryptField(p.addressEncrypted) : null,
          postcode: p.postcode,
          gpName: p.gpName,
          gpAddress: p.gpAddressEncrypted ? decryptField(p.gpAddressEncrypted) : null,
          medication: p.medicationEncrypted ? decryptField(p.medicationEncrypted) : null,
          allergies: p.allergiesEncrypted ? decryptField(p.allergiesEncrypted) : null,
          emergencyContactName: p.emergencyContactName,
          emergencyContactNumber: p.emergencyContactNumberEncrypted
            ? decryptField(p.emergencyContactNumberEncrypted)
            : null,
        }
      : null,
  };
}

export async function getPatientConsents(patientId: string) {
  const records = await prisma.consentRecord.findMany({
    where: { userId: patientId },
    include: { consentVersion: true },
    orderBy: { createdAt: 'desc' },
  });
  return records.map((r) => ({
    id: r.id,
    type: r.consentVersion.type,
    version: r.consentVersion.version,
    granted: r.granted,
    ipAddress: r.ipAddress,
    createdAt: r.createdAt,
    withdrawnAt: r.withdrawnAt,
  }));
}

export async function getPatientReportHistory(patientId: string) {
  const reports = await prisma.report.findMany({
    where: { patientId },
    include: { panel: true, source: true, results: { select: { id: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return reports.map((r) => ({
    ...r,
    title: formatReportTitle(r.panel?.name, r.results.length, r.sampleDate),
  }));
}

export async function getPatientAuditTrail(patientId: string, limit: number, offset: number) {
  const reportIds = (await prisma.report.findMany({ where: { patientId }, select: { id: true } })).map((r) => r.id);

  const where = {
    OR: [
      { targetType: 'User', targetId: patientId },
      { targetType: 'Report', targetId: { in: reportIds } },
      { targetType: 'ConsentRecord', actorUserId: patientId },
      { targetType: 'ErasureRequest', actorUserId: patientId },
    ],
  };

  const [entries, total] = await Promise.all([
    prisma.auditLogEntry.findMany({
      where,
      include: { actorUser: { include: { staffProfile: true, patientProfile: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.auditLogEntry.count({ where }),
  ]);

  return {
    total,
    entries: entries.map((e) => ({
      id: e.id,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      actorType: e.actorType,
      actorName: e.actorUser ? staffOrPatientName(e.actorUser) : null,
      actorEmail: e.actorUser?.email ?? null,
      ipAddress: e.ipAddress,
      metadata: e.metadata,
      createdAt: e.createdAt,
    })),
  };
}

export async function resendInvite(patientId: string, actorId: string, ip: string | null) {
  const user = await prisma.user.findUnique({ where: { id: patientId } });
  if (!user || user.role !== 'PATIENT') throw new AdminError('Patient not found', 404);
  if (user.status !== 'INVITED') {
    throw new AdminError('This account has already been activated', 409);
  }

  const rawToken = generateToken(32);
  await prisma.inviteToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const activationUrl = `${env.APP_BASE_URL}/activate?token=${rawToken}`;
  await emailProvider.sendEmail({
    to: user.email,
    subject: 'Activate your Aspire Bloods account',
    text: `Aspire Clinic has set up your patient portal account. Activate it here: ${activationUrl}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`,
    html: `<p>Aspire Clinic has set up your patient portal account.</p><p><a href="${activationUrl}">Activate your account</a></p><p>This link expires in ${INVITE_TTL_DAYS} days.</p>`,
  });

  await recordAuditLog({
    actorUserId: actorId,
    action: 'PATIENT_INVITE_RESENT',
    targetType: 'User',
    targetId: user.id,
    ipAddress: ip,
  });

  return { devActivationUrl: env.EXPOSE_DEV_OTP_CODE ? activationUrl : undefined };
}

/**
 * "Reset 2FA" for this app's email-only 2FA doesn't mean regenerating a
 * TOTP secret (there isn't one) — the meaningful lever is revoking every
 * TrustedDevice, forcing OTP verification again on the next login. This is
 * exactly the right response to "I lost my phone / this browser isn't mine
 * anymore" without needing to touch the account's password or status.
 */
export async function resetPatientTwoFactor(patientId: string, actorId: string, ip: string | null) {
  const user = await prisma.user.findUnique({ where: { id: patientId } });
  if (!user) throw new AdminError('Patient not found', 404);

  const { count } = await prisma.trustedDevice.deleteMany({ where: { userId: patientId } });

  await recordAuditLog({
    actorUserId: actorId,
    action: 'PATIENT_2FA_RESET',
    targetType: 'User',
    targetId: patientId,
    ipAddress: ip,
    metadata: { trustedDevicesRevoked: count },
  });

  return { trustedDevicesRevoked: count };
}

export async function deactivatePatient(patientId: string, reason: string, actorId: string, ip: string | null) {
  const user = await prisma.user.findUnique({ where: { id: patientId } });
  if (!user || user.role !== 'PATIENT') throw new AdminError('Patient not found', 404);
  if (user.deactivatedAt) throw new AdminError('This account is already deactivated', 409);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: patientId },
      data: { status: 'DISABLED', deactivatedAt: new Date(), deactivatedById: actorId, deactivationReason: reason },
    });
    // Blocks login going forward AND ends any session already in progress —
    // "blocks login" alone wouldn't cover a device that's already signed in.
    await tx.refreshToken.updateMany({
      where: { userId: patientId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await recordAuditLog({
    actorUserId: actorId,
    action: 'PATIENT_DEACTIVATED',
    targetType: 'User',
    targetId: patientId,
    ipAddress: ip,
    metadata: { reason },
  });
}

export async function reactivatePatient(patientId: string, actorId: string, ip: string | null) {
  const user = await prisma.user.findUnique({ where: { id: patientId } });
  if (!user || user.role !== 'PATIENT') throw new AdminError('Patient not found', 404);
  if (!user.deactivatedAt) throw new AdminError('This account is not deactivated', 409);

  await prisma.user.update({
    where: { id: patientId },
    data: { status: 'ACTIVE', deactivatedAt: null, deactivatedById: null, deactivationReason: null },
  });

  await recordAuditLog({
    actorUserId: actorId,
    action: 'PATIENT_REACTIVATED',
    targetType: 'User',
    targetId: patientId,
    ipAddress: ip,
  });
}

/**
 * Admin-initiated erasure — same ErasureRequest model and purge job as the
 * patient-initiated flow (patients/service.ts requestErasure), but logged
 * under the admin's own identity rather than the patient's, since the
 * patient didn't act here. Clinical results are never touched by this —
 * the purge job (jobs/erasurePurge.ts) de-identifies the profile only and
 * deliberately keeps Report/ReportResult rows intact, per the practice's
 * clinical-records retention obligation. See PRIVACY.md.
 */
export async function initiateErasureByAdmin(patientId: string, actorId: string, ip: string | null) {
  const user = await prisma.user.findUnique({ where: { id: patientId } });
  if (!user || user.role !== 'PATIENT') throw new AdminError('Patient not found', 404);

  const existing = await prisma.erasureRequest.findFirst({
    where: { userId: patientId, status: { in: ['REQUESTED', 'SCHEDULED'] } },
  });
  if (existing) return existing;

  const request = await prisma.erasureRequest.create({ data: { userId: patientId } });

  await recordAuditLog({
    actorUserId: actorId,
    action: 'ERASURE_INITIATED_BY_ADMIN',
    targetType: 'ErasureRequest',
    targetId: request.id,
    ipAddress: ip,
    metadata: { patientId },
  });

  return request;
}

export async function getSystemAuditLog(filters: {
  actorEmail?: string;
  action?: string;
  targetType?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}) {
  const where: import('@prisma/client').Prisma.AuditLogEntryWhereInput = {};
  if (filters.action) where.action = filters.action;
  if (filters.targetType) where.targetType = filters.targetType;
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = filters.from;
    if (filters.to) where.createdAt.lte = filters.to;
  }
  if (filters.actorEmail) {
    where.actorUser = { email: { contains: filters.actorEmail, mode: 'insensitive' } };
  }

  const [entries, total] = await Promise.all([
    prisma.auditLogEntry.findMany({
      where,
      include: { actorUser: { include: { staffProfile: true, patientProfile: true } } },
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      skip: filters.offset,
    }),
    prisma.auditLogEntry.count({ where }),
  ]);

  return {
    total,
    entries: entries.map((e) => ({
      id: e.id,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      actorType: e.actorType,
      actorName: e.actorUser ? staffOrPatientName(e.actorUser) : null,
      actorEmail: e.actorUser?.email ?? null,
      ipAddress: e.ipAddress,
      metadata: e.metadata,
      createdAt: e.createdAt,
    })),
  };
}

// Phase 3 §3: every automated-ingestion attempt, success or not, so a
// silently failed import doesn't go unnoticed.
export async function listIngestionLog(limit: number, offset: number) {
  const [entries, total] = await Promise.all([
    prisma.ingestionLogEntry.findMany({
      include: { report: { include: { patient: { include: { patientProfile: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.ingestionLogEntry.count(),
  ]);

  return {
    total,
    entries: entries.map((e) => ({
      id: e.id,
      sourceKey: e.sourceKey,
      externalId: e.externalId,
      outcome: e.outcome,
      reportId: e.reportId,
      patientName: e.report?.patient.patientProfile
        ? `${e.report.patient.patientProfile.firstName} ${e.report.patient.patientProfile.lastName}`
        : (e.report?.patient.email ?? null),
      markerCount: e.markerCount,
      message: e.message,
      mappingFailures: e.mappingFailures,
      createdAt: e.createdAt,
    })),
  };
}

export async function listCopyBlocks() {
  return prisma.copyBlock.findMany({ orderBy: { slug: 'asc' } });
}

export async function updateCopyBlock(slug: string, body: string, actorId: string, ip: string | null) {
  const block = await prisma.copyBlock.upsert({
    where: { slug },
    update: { body, version: { increment: 1 } },
    create: { slug, body },
  });

  await recordAuditLog({
    actorUserId: actorId,
    action: 'COPY_BLOCK_UPDATED',
    targetType: 'CopyBlock',
    targetId: block.id,
    ipAddress: ip,
    metadata: { slug },
  });

  return block;
}
