import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { encryptField, decryptField } from '../../lib/crypto.js';
import { generateToken, generateOtpCode, hashToken } from '../../lib/crypto.js';
import { signAccessToken } from '../../lib/jwt.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { emailProvider, smsProvider, isSmsEnabled } from '../notifications/index.js';
import type { ActivateAccountRequest, PatientProfileForm, SignupRequest } from '@aspire-bloods/shared';
import type { Prisma } from '@prisma/client';

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const INVITE_TTL_DAYS = 7;

// Dummy hash for a password that will never match, used to keep the timing
// profile of "user not found" and "wrong password" indistinguishable.
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$FLKzuiUvvQ0KMzZQtEEP7CyFmSGWFhP2qGDS+3XPWQE';

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function createInvite(email: string, invitedByUserId: string, ip: string | null) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AuthError('A user with this email already exists', 409);
  }

  const rawToken = generateToken(32);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(generateToken(24)), // unusable placeholder until activation
      role: 'PATIENT',
      status: 'INVITED',
      twoFactorMethod: 'EMAIL',
    },
  });

  await prisma.inviteToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const activationUrl = `${env.APP_BASE_URL}/activate?token=${rawToken}`;
  await emailProvider.sendEmail({
    to: email,
    subject: 'Activate your Aspire Bloods account',
    text: `Aspire Clinic has set up your patient portal account. Activate it here: ${activationUrl}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`,
    html: `<p>Aspire Clinic has set up your patient portal account.</p><p><a href="${activationUrl}">Activate your account</a></p><p>This link expires in ${INVITE_TTL_DAYS} days.</p>`,
  });

  await recordAuditLog({
    actorUserId: invitedByUserId,
    action: 'PATIENT_INVITED',
    targetType: 'User',
    targetId: user.id,
    ipAddress: ip,
  });

  return {
    userId: user.id,
    // Same explicit opt-in as devOtpCode below — lets e2e tests drive the
    // full invite→activate flow without reading the email provider log.
    devActivationUrl: env.EXPOSE_DEV_OTP_CODE ? activationUrl : undefined,
  };
}

type ConsentInput = { dataProcessing: boolean; resultsStorage: boolean; commsEmail: boolean; commsSms: boolean };

/**
 * Shared by both activation (admin-invited patients) and self-service
 * signup — the registration-form fields, encryption, and consent-record
 * creation must stay identical between the two entry points.
 */
async function createProfileAndConsents(
  tx: Prisma.TransactionClient,
  userId: string,
  profile: PatientProfileForm,
  consents: ConsentInput,
  ip: string | null,
) {
  const profileData = {
    title: profile.title,
    firstName: profile.firstName,
    lastName: profile.lastName,
    sex: profile.sex,
    dobEncrypted: encryptField(profile.dob),
    contactNumberEncrypted: encryptField(profile.contactNumber),
    addressEncrypted: encryptField(profile.address),
    postcode: profile.postcode,
    gpName: profile.gpName,
    gpAddressEncrypted: profile.gpAddress ? encryptField(profile.gpAddress) : null,
    medicationEncrypted: profile.medication ? encryptField(profile.medication) : null,
    allergiesEncrypted: profile.allergies ? encryptField(profile.allergies) : null,
    emergencyContactName: profile.emergencyContactName,
    emergencyContactNumberEncrypted: profile.emergencyContactNumber
      ? encryptField(profile.emergencyContactNumber)
      : null,
  };

  // update+create must submit the same data — this is the patient's one
  // chance to enter their registration details; a prior seed/placeholder
  // profile row must never silently win over what they just typed.
  await tx.patientProfile.upsert({
    where: { userId },
    update: profileData,
    create: { userId, ...profileData },
  });

  const consentInputs: { type: 'DATA_PROCESSING' | 'RESULTS_STORAGE' | 'COMMS_EMAIL' | 'COMMS_SMS'; granted: boolean }[] = [
    { type: 'DATA_PROCESSING', granted: consents.dataProcessing },
    { type: 'RESULTS_STORAGE', granted: consents.resultsStorage },
    { type: 'COMMS_EMAIL', granted: consents.commsEmail },
    { type: 'COMMS_SMS', granted: consents.commsSms },
  ];
  for (const c of consentInputs) {
    const version = await tx.consentVersion.findFirst({
      where: { type: c.type },
      orderBy: { version: 'desc' },
    });
    if (!version) continue;
    await tx.consentRecord.create({
      data: {
        userId,
        consentVersionId: version.id,
        granted: c.granted,
        ipAddress: ip ?? 'unknown',
      },
    });
  }
}

/**
 * Self-service signup. Coexists with the admin-invite flow rather than
 * replacing it — the account is created ACTIVE immediately, but mandatory
 * 2FA on first login (OTP emailed to the address just entered) is the
 * real ownership check: someone who doesn't control that inbox can never
 * actually complete a login, so a separate "verify your email" step would
 * be redundant with infrastructure that already exists.
 */
export async function signup(input: SignupRequest, ip: string | null) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AuthError('An account with this email already exists', 409);
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: 'PATIENT',
        status: 'ACTIVE',
        twoFactorMethod: 'EMAIL',
      },
    });

    await createProfileAndConsents(tx, created.id, input.profile, input.consents, ip);

    return created;
  });

  await recordAuditLog({
    actorUserId: user.id,
    action: 'ACCOUNT_SIGNED_UP',
    targetType: 'User',
    targetId: user.id,
    ipAddress: ip,
  });

  return { userId: user.id };
}

export async function activateAccount(input: ActivateAccountRequest, ip: string | null) {
  const tokenHash = hashToken(input.inviteToken);
  const invite = await prisma.inviteToken.findUnique({ where: { tokenHash } });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    throw new AuthError('This invite link is invalid or has expired', 400);
  }

  const user = await prisma.user.findUnique({ where: { id: invite.userId } });
  if (!user || user.status !== 'INVITED') {
    throw new AuthError('This invite link is invalid or has expired', 400);
  }

  const { profile, consents } = input;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password), status: 'ACTIVE' },
    });

    await createProfileAndConsents(tx, user.id, profile, consents, ip);

    await tx.inviteToken.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
  });

  await recordAuditLog({
    actorUserId: user.id,
    action: 'ACCOUNT_ACTIVATED',
    targetType: 'User',
    targetId: user.id,
    ipAddress: ip,
  });

  return { userId: user.id };
}

interface LoginResult {
  trustedDeviceSkippedOtp: boolean;
  userId?: string;
  role?: 'PATIENT' | 'ADMIN' | 'CLINICIAN';
  challengeId?: string;
  devOtpCode?: string;
}

export async function login(
  email: string,
  password: string,
  deviceIdCookie: string | undefined,
  ip: string | null,
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  const passwordOk = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);
  if (!user || user.status !== 'ACTIVE' || !passwordOk) {
    await recordAuditLog({
      action: 'LOGIN_FAILED',
      targetType: 'User',
      targetId: user?.id ?? null,
      ipAddress: ip,
      metadata: { email },
    });
    throw new AuthError('Invalid email or password', 401);
  }

  if (deviceIdCookie) {
    const trusted = await prisma.trustedDevice.findFirst({
      where: { userId: user.id, deviceIdHash: hashToken(deviceIdCookie), trustedUntil: { gt: new Date() } },
    });
    if (trusted) {
      await recordAuditLog({
        actorUserId: user.id,
        action: 'LOGIN_SUCCESS_TRUSTED_DEVICE',
        targetType: 'User',
        targetId: user.id,
        ipAddress: ip,
      });
      return { trustedDeviceSkippedOtp: true, userId: user.id, role: user.role };
    }
  }

  const channel = user.twoFactorMethod === 'SMS' && !isSmsEnabled() ? 'EMAIL' : user.twoFactorMethod;
  const code = generateOtpCode();
  const otp = await prisma.otpCode.create({
    data: {
      userId: user.id,
      codeHash: hashToken(code),
      channel,
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    },
  });

  if (channel === 'SMS') {
    if (!user.phoneNumberEncrypted) {
      throw new AuthError('No SMS number on file for this account', 400);
    }
    await smsProvider.sendSms({
      to: decryptField(user.phoneNumberEncrypted),
      body: `Your Aspire Bloods verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    });
  } else {
    await emailProvider.sendEmail({
      to: user.email,
      subject: 'Your Aspire Bloods verification code',
      text: `Your verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.`,
      html: `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>`,
    });
  }

  return {
    trustedDeviceSkippedOtp: false,
    challengeId: otp.id,
    // Explicit opt-in only (EXPOSE_DEV_OTP_CODE=true) — lets e2e tests and
    // local dev read the code straight from the login response instead of
    // scraping the email/SMS provider log. Off by default everywhere.
    devOtpCode: env.EXPOSE_DEV_OTP_CODE ? code : undefined,
  };
}

interface OtpVerifyResult {
  accessToken: string;
  refreshTokenRaw: string;
  userId: string;
  role: 'PATIENT' | 'ADMIN' | 'CLINICIAN';
  deviceIdToTrust?: string;
}

export async function verifyOtp(
  challengeId: string,
  code: string,
  trustDevice: boolean,
  ip: string | null,
  userAgent: string | null,
): Promise<OtpVerifyResult> {
  const otp = await prisma.otpCode.findUnique({ where: { id: challengeId } });
  if (!otp || otp.consumedAt || otp.expiresAt < new Date()) {
    throw new AuthError('This verification code has expired. Please log in again.', 400);
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AuthError('Too many incorrect attempts. Please log in again.', 429);
  }

  if (otp.codeHash !== hashToken(code)) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new AuthError('Incorrect code', 400);
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: otp.userId } });

  const result = await issueSession(user.id, user.role, ip, userAgent);

  let deviceIdToTrust: string | undefined;
  if (trustDevice) {
    deviceIdToTrust = generateToken(24);
    await prisma.trustedDevice.create({
      data: {
        userId: user.id,
        deviceIdHash: hashToken(deviceIdToTrust),
        trustedUntil: new Date(Date.now() + env.TRUSTED_DEVICE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  }

  await recordAuditLog({
    actorUserId: user.id,
    action: 'LOGIN_SUCCESS',
    targetType: 'User',
    targetId: user.id,
    ipAddress: ip,
  });

  return { ...result, userId: user.id, role: user.role, deviceIdToTrust };
}

async function issueSession(
  userId: string,
  role: 'PATIENT' | 'ADMIN' | 'CLINICIAN',
  ip: string | null,
  userAgent: string | null,
) {
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshTokenRaw = generateToken(32);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshTokenRaw),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      ipAddress: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    },
  });

  return { accessToken, refreshTokenRaw };
}

export async function loginWithTrustedDevice(userId: string, role: 'PATIENT' | 'ADMIN' | 'CLINICIAN', ip: string | null, userAgent: string | null) {
  return issueSession(userId, role, ip, userAgent);
}

export async function refreshSession(refreshTokenRaw: string, ip: string | null, userAgent: string | null) {
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshTokenRaw) } });
  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    throw new AuthError('Session expired, please log in again', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!user || user.status !== 'ACTIVE') {
    throw new AuthError('Session expired, please log in again', 401);
  }

  const next = await issueSession(user.id, user.role, ip, userAgent);
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  return { ...next, userId: user.id, role: user.role };
}

export async function logout(refreshTokenRaw: string | undefined) {
  if (!refreshTokenRaw) return;
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshTokenRaw) } });
  if (existing && !existing.revokedAt) {
    await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
  }
}
