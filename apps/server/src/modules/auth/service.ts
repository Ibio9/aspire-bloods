import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { encryptField, decryptField } from '../../lib/crypto.js';
import { generateToken, generateOtpCode, hashToken } from '../../lib/crypto.js';
import { signAccessToken } from '../../lib/jwt.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { isAdminEmail } from '../../lib/adminAccess.js';
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
 * Self-registration — admin-only. ADMIN_EMAILS is the sole source of the
 * ADMIN role (see lib/adminAccess.ts); this is not a second way to grant
 * it, it's the ONLY way an ADMIN_EMAILS address ever gets a working
 * account, since there is deliberately no "make user an admin" button
 * anywhere. Patients still arrive by invite only — self-service signup for
 * patients was removed.
 *
 * Every rejection reason (email not on the admin list, account already
 * exists, ...) returns the exact same generic error — this must never leak
 * whether a given address is on ADMIN_EMAILS.
 *
 * The account is created ACTIVE, but — unlike the old patient signup flow —
 * this does NOT return a plain success. It immediately issues an OTP
 * challenge and returns the same { challengeId, devOtpCode } shape as
 * login()'s otp_required response, verified through the same
 * POST /auth/otp/verify endpoint. There is no code path that returns a
 * session, or any other terminal "you're registered" state, without that
 * verification succeeding — 2FA enrolment is mandatory and unskippable
 * because it is structurally the only way this flow can end.
 */
const REGISTRATION_REJECTED = 'Unable to complete registration with these details.';

export async function signup(input: SignupRequest, ip: string | null): Promise<LoginResult> {
  if (!isAdminEmail(input.email)) {
    throw new AuthError(REGISTRATION_REJECTED, 400);
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AuthError(REGISTRATION_REJECTED, 400);
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        // Stored role stays PATIENT — ADMIN is derived from ADMIN_EMAILS on
        // every request (authGuard's effectiveRole()), never read from this
        // column for that email. This is also what makes the "same account
        // shows both the admin area and their own results" requirement work
        // for free: it's a real patient-shaped account underneath.
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
  // Distinct from ACCOUNT_SIGNED_UP and from ADMIN_ACCESS_GRANTED (logged
  // later, at session-issuance) — this is specifically "an admin-capable
  // account was created," logged once, at creation time.
  await recordAuditLog({
    actorUserId: user.id,
    action: 'ADMIN_ACCOUNT_CREATED',
    targetType: 'User',
    targetId: user.id,
    ipAddress: ip,
    metadata: { email: user.email },
  });

  const challenge = await createOtpChallenge(user, ip);
  return { trustedDeviceSkippedOtp: false, ...challenge };
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
  email?: string;
  role?: 'PATIENT' | 'ADMIN' | 'CLINICIAN';
  challengeId?: string;
  devOtpCode?: string;
}

type OtpChallengeUser = { id: string; email: string; twoFactorMethod: 'EMAIL' | 'SMS'; phoneNumberEncrypted: string | null };

/**
 * Shared by login() (non-trusted-device path) and signup() (mandatory
 * enrolment) — creating the OtpCode row and sending it is identical either
 * way; the only difference is what happens after verification.
 *
 * Logging here is deliberately structured around IDs, never content: the
 * OTP code and the recipient's email/phone never appear in a log line,
 * only the challengeId (opaque, meaningless without DB access) and userId.
 */
async function createOtpChallenge(
  user: OtpChallengeUser,
  ip: string | null,
): Promise<{ challengeId: string; devOtpCode?: string }> {
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

  try {
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
  } catch (e) {
    // A send failure must not leave the client staring at a challengeId
    // that can never be verified with a code that never arrived — surface
    // it as a clean rejection, not a 500, and log enough to diagnose the
    // provider-side failure without the code or address.
    console.error('[otp] send failed', { challengeId: otp.id, channel, error: e instanceof Error ? e.message : e });
    if (e instanceof AuthError) throw e;
    throw new AuthError('Could not send a verification code. Please try again shortly.', 502);
  }

  console.log('[otp] challenge created', { challengeId: otp.id, channel, ip: ip ?? 'unknown' });

  return {
    challengeId: otp.id,
    // Explicit opt-in only (EXPOSE_DEV_OTP_CODE=true) — lets e2e tests and
    // local dev read the code straight from the login response instead of
    // scraping the email/SMS provider log. Off by default everywhere, and
    // impossible to enable in production — see productionBootChecks.ts.
    devOtpCode: env.EXPOSE_DEV_OTP_CODE ? code : undefined,
  };
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
      return { trustedDeviceSkippedOtp: true, userId: user.id, email: user.email, role: user.role };
    }
  }

  const challenge = await createOtpChallenge(user, ip);
  return { trustedDeviceSkippedOtp: false, ...challenge };
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
    console.warn('[otp] verify rejected: missing_consumed_or_expired', { challengeId });
    throw new AuthError('This verification code has expired. Please log in again.', 400);
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    console.warn('[otp] verify rejected: max_attempts', { challengeId, attempts: otp.attempts });
    throw new AuthError('Too many incorrect attempts. Please log in again.', 429);
  }

  if (otp.codeHash !== hashToken(code)) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    console.warn('[otp] verify rejected: incorrect_code', { challengeId, attempts: otp.attempts + 1 });
    throw new AuthError('Incorrect code', 400);
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

  // findUnique, not findUniqueOrThrow — a user row genuinely missing here
  // (never expected: users are anonymised, not deleted) must still fail as
  // a clean rejection, not an unhandled throw that surfaces as a 500.
  const user = await prisma.user.findUnique({ where: { id: otp.userId } });
  if (!user || user.status !== 'ACTIVE') {
    console.warn('[otp] verify rejected: user_missing_or_inactive', { challengeId, userId: otp.userId });
    throw new AuthError('This verification code has expired. Please log in again.', 400);
  }

  const result = await issueSession(user.id, user.email, user.role, ip, userAgent);
  console.log('[otp] verify success', { challengeId, userId: user.id });

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
  email: string,
  role: 'PATIENT' | 'ADMIN' | 'CLINICIAN',
  ip: string | null,
  userAgent: string | null,
  // False for silent token refresh — logging an admin-access grant every
  // ~15 minutes for an active session would flood the audit log with
  // noise. True for every path that represents an actual login.
  logAdminGrantIfApplicable = true,
) {
  if (logAdminGrantIfApplicable && isAdminEmail(email)) {
    await recordAuditLog({
      actorUserId: userId,
      action: 'ADMIN_ACCESS_GRANTED',
      targetType: 'User',
      targetId: userId,
      ipAddress: ip,
      metadata: { email },
    });
  }

  const accessToken = signAccessToken({ sub: userId, email, role });
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

export async function loginWithTrustedDevice(
  userId: string,
  email: string,
  role: 'PATIENT' | 'ADMIN' | 'CLINICIAN',
  ip: string | null,
  userAgent: string | null,
) {
  return issueSession(userId, email, role, ip, userAgent);
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

  const next = await issueSession(user.id, user.email, user.role, ip, userAgent, false);
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  return { ...next, userId: user.id, role: user.role };
}

export async function logout(refreshTokenRaw: string | undefined, ip: string | null) {
  if (!refreshTokenRaw) return;
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshTokenRaw) } });
  if (existing && !existing.revokedAt) {
    await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    await recordAuditLog({
      actorUserId: existing.userId,
      action: 'LOGOUT',
      targetType: 'User',
      targetId: existing.userId,
      ipAddress: ip,
    });
  }
}
