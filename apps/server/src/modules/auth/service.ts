import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { encryptField, decryptField } from '../../lib/crypto.js';
import { generateToken, generateOtpCode, hashToken } from '../../lib/crypto.js';
import { signAccessToken } from '../../lib/jwt.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { isAdminEmail } from '../../lib/adminAccess.js';
import { emailProvider, smsProvider, isSmsEnabled } from '../notifications/index.js';
import { maskEmail } from '@aspire-bloods/shared';
import type { ActivateAccountRequest, PatientProfileForm, SignupRequest } from '@aspire-bloods/shared';
import type { Prisma } from '@prisma/client';

export const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const INVITE_TTL_DAYS = 7;

/**
 * Resend policy. The cooldown is the anti-abuse floor the UI counts down
 * against; the cap is the point at which sending another code has clearly
 * stopped being the answer and the patient needs a human. Both are enforced
 * here, server-side — the client's countdown is a courtesy, not the control.
 */
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
export const OTP_MAX_RESENDS = 3;

/**
 * Email verification is a six-digit code now, not a link, so it inherits the
 * OTP rules wholesale — same cooldown, same cap, same attempt ceiling. One
 * code to verify, one code to sign in; there is no reason for the two to
 * behave differently, and every reason for them not to.
 */
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = OTP_RESEND_COOLDOWN_SECONDS;
export const EMAIL_VERIFICATION_MAX_RESENDS = OTP_MAX_RESENDS;
const EMAIL_VERIFICATION_MAX_ATTEMPTS = OTP_MAX_ATTEMPTS;

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
    addressEncrypted: profile.address ? encryptField(profile.address) : null,
    postcode: profile.postcode ?? null,
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

export interface SignupResult {
  status: 'verification_sent';
  /** Masked — enough to confirm which inbox to open, never the full address back. */
  sentTo: string;
  expiresInMinutes: number;
  /** How long before another code can be requested — the UI counts down against this. */
  cooldownSeconds: number;
  /** EXPOSE_DEV_OTP_CODE only, same opt-in as devOtpCode — lets e2e drive the flow. */
  devVerificationCode?: string;
}

/**
 * Issues the six-digit confirmation code and emails it. Deliberately not a
 * link: a link is a second, differently-shaped thing to explain, and it drags
 * a day-long token along with it. A code is the interaction the patient is
 * about to meet again at 2FA thirty seconds later.
 *
 * Any code already outstanding for this account is retired first, so exactly
 * one code is ever live — reissuing must reset the guessing window, not widen
 * it. Retiring before sending is the safe direction to fail in.
 */
async function sendVerificationCode(userId: string, email: string, resendCount = 0): Promise<string> {
  await prisma.emailVerificationCode.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateOtpCode();
  const ttlMinutes = env.EMAIL_VERIFICATION_TTL_MINUTES;
  await prisma.emailVerificationCode.create({
    data: {
      userId,
      codeHash: hashToken(code),
      resendCount,
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
    },
  });

  await emailProvider.sendEmail({
    to: email,
    subject: 'Your Aspire Bloods confirmation code',
    text: `Welcome to the Aspire Bloods patient portal. Your confirmation code is ${code}.\n\nEnter it on the confirm-your-email screen to finish setting up. It expires in ${ttlMinutes} minutes. If you didn't create an account, ignore this email.`,
    html: `<p>Welcome to the Aspire Bloods patient portal.</p><p>Your confirmation code is <strong>${code}</strong>.</p><p>Enter it on the confirm-your-email screen to finish setting up. It expires in ${ttlMinutes} minutes. If you didn't create an account, ignore this email.</p>`,
  });

  return code;
}

/**
 * Open patient registration. Invitation-only was the wrong shape for this
 * practice: an account with nothing attached to it carries no clinical data
 * and protects nothing, so there is no approval step, no waiting state, and
 * nothing here that should feel guarded. A new account is an empty account.
 *
 * The care lives in linking (modules/admin/linkingService.ts), not here.
 *
 * Invites still work exactly as before — createInvite/activateAccount are
 * untouched, and the two paths coexist: the practice can still set an
 * account up for someone directly.
 *
 * Admin registration is likewise unchanged, because there is nothing to
 * change: ADMIN_EMAILS remains the sole source of the ADMIN role, re-derived
 * per request in authGuard, and this function grants nobody anything. The
 * stored role is PATIENT for every account it creates — including an
 * admin's, which is what lets one account show both the console and its
 * owner's own results.
 *
 * Two rules survive from the old admin-only version, for different reasons:
 *
 *  1. An already-registered address gets the SAME response as a fresh one.
 *     Registration being open doesn't make "does this person bank here" a
 *     fair question to answer, and this endpoint is unauthenticated. The
 *     existing account holder gets an email telling them someone tried, so
 *     the honest signal goes to the person entitled to it.
 *  2. Verification is not optional and not skippable. The account is created
 *     PENDING_VERIFICATION and login() refuses it in that state, so the only
 *     route out is the emailed six-digit code — which then leads straight
 *     into 2FA enrolment (see verifyEmail()). There is no code path from here
 *     to a session that doesn't pass through both.
 */
export async function signup(input: SignupRequest, ip: string | null): Promise<SignupResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });

  if (existing) {
    // Deliberately not an error. Telling the caller "that's taken" turns
    // this endpoint into a membership oracle for a medical practice.
    await emailProvider
      .sendEmail({
        to: existing.email,
        subject: 'Someone tried to register with your email',
        text: `Someone just tried to create an Aspire Bloods account with this email address, but you already have one. If that was you, sign in at ${env.APP_BASE_URL}/login, and reset your password there if you've forgotten it. If it wasn't you, no new account was created and nothing about yours has changed.`,
        html: `<p>Someone just tried to create an Aspire Bloods account with this email address, but you already have one.</p><p>If that was you, <a href="${env.APP_BASE_URL}/login">sign in</a> instead. If it wasn't, no new account was created and nothing about yours has changed.</p>`,
      })
      .catch((e) => {
        // The notice failing must not change the response shape and give
        // the game away. Log it and carry on.
        console.error('[signup] duplicate-registration notice failed', {
          userId: existing.id,
          error: e instanceof Error ? e.message : e,
        });
      });

    await recordAuditLog({
      actorUserId: existing.id,
      action: 'SIGNUP_ATTEMPTED_EXISTING_EMAIL',
      targetType: 'User',
      targetId: existing.id,
      ipAddress: ip,
    });

    // Byte-for-byte the same shape as the success path below — and carrying
    // nothing the caller needs in order to submit a code, which is what lets
    // it stay that way. Verification is keyed on the email address the caller
    // already typed, not on an id only a real registration could have been
    // given.
    return {
      status: 'verification_sent',
      sentTo: maskEmail(input.email),
      expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
      cooldownSeconds: EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    };
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        // Stored role stays PATIENT — ADMIN is derived from ADMIN_EMAILS on
        // every request (authGuard's effectiveRole()), never read from this
        // column. This is also what makes the "same account shows both the
        // admin area and their own results" requirement work for free: it's
        // a real patient-shaped account underneath.
        role: 'PATIENT',
        status: 'PENDING_VERIFICATION',
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
  if (isAdminEmail(user.email)) {
    // Distinct from ACCOUNT_SIGNED_UP and from ADMIN_ACCESS_GRANTED (logged
    // later, at session-issuance) — this is specifically "an account that
    // ADMIN_EMAILS will grant the console to was created," logged once, at
    // creation time. It records a fact; it doesn't confer anything.
    await recordAuditLog({
      actorUserId: user.id,
      action: 'ADMIN_ACCOUNT_CREATED',
      targetType: 'User',
      targetId: user.id,
      ipAddress: ip,
      metadata: { email: user.email },
    });
  }

  let verificationCode: string;
  try {
    verificationCode = await sendVerificationCode(user.id, user.email);
  } catch (e) {
    // The account exists but is unreachable — PENDING_VERIFICATION can't
    // sign in, so it's inert rather than dangerous, and "resend" fixes it.
    // Say so plainly instead of returning a success the patient can't act on.
    console.error('[signup] verification email send failed', {
      userId: user.id,
      error: e instanceof Error ? e.message : e,
    });
    throw new AuthError(
      "We couldn't send your confirmation email. Your details are saved, so try again in a few minutes.",
      502,
    );
  }

  return {
    status: 'verification_sent',
    sentTo: maskEmail(user.email),
    expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
    cooldownSeconds: EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    devVerificationCode: env.EXPOSE_DEV_OTP_CODE ? verificationCode : undefined,
  };
}

/** Every rejection here says the same thing, whichever of the several ways it
 *  failed — an unknown address, a wrong code and an expired code must not be
 *  distinguishable, or this endpoint becomes the membership oracle that
 *  signup() goes to some trouble not to be. */
const VERIFICATION_REJECTED = 'That code is incorrect or has expired. Please request a new one.';

/**
 * Entering the emailed code. This is the moment the account becomes real:
 * PENDING_VERIFICATION → ACTIVE, and immediately an OTP challenge in the
 * same { challengeId, devOtpCode } shape login() returns, verified through
 * the same POST /auth/otp/verify endpoint.
 *
 * Email verification first, 2FA enrolment second, and no terminal state in
 * between — this function cannot return a session, and verifyOtp() is the
 * only thing that can. Enrolment isn't an optional follow-up step the
 * patient could wander away from; it's structurally the only way the flow
 * ends in anything other than being signed out.
 *
 * Keyed on (email, code) rather than a challenge id, which is what lets
 * signup() answer identically for a fresh address and one already registered:
 * its response carries nothing this step needs.
 */
export async function verifyEmail(email: string, code: string, ip: string | null): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || (user.status !== 'PENDING_VERIFICATION' && user.status !== 'ACTIVE')) {
    throw new AuthError(VERIFICATION_REJECTED, 400);
  }

  const record = await prisma.emailVerificationCode.findFirst({
    where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) {
    throw new AuthError(VERIFICATION_REJECTED, 400);
  }

  // Six digits is a million-wide space, so the attempt ceiling is the real
  // control here, not the expiry.
  if (record.attempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
    console.warn('[email-verification] rejected: max_attempts', { userId: user.id, attempts: record.attempts });
    throw new AuthError('Too many incorrect attempts. Please request a new code.', 429);
  }

  if (record.codeHash !== hashToken(code)) {
    await prisma.emailVerificationCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    console.warn('[email-verification] rejected: incorrect_code', { userId: user.id, attempts: record.attempts + 1 });
    throw new AuthError(VERIFICATION_REJECTED, 400);
  }

  await prisma.$transaction(async (tx) => {
    if (user.status === 'PENDING_VERIFICATION') {
      await tx.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
    }
    // Every outstanding code for this account is spent, not just the one that
    // was used — a second code sitting in the same inbox must not stay usable
    // once one has done its job.
    await tx.emailVerificationCode.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  });

  await recordAuditLog({
    actorUserId: user.id,
    action: 'ACCOUNT_EMAIL_VERIFIED',
    targetType: 'User',
    targetId: user.id,
    ipAddress: ip,
  });

  const challenge = await createOtpChallenge(user, ip);
  return { trustedDeviceSkippedOtp: false, ...challenge };
}

export interface ResendVerificationResult {
  /** Masked back from what the caller submitted — never a lookup result. */
  sentTo: string;
  expiresInMinutes: number;
  cooldownSeconds: number;
  devVerificationCode?: string;
}

/**
 * "The confirmation email never arrived." Same anti-enumeration posture as
 * signup(): the response is identical whether the address is unknown, already
 * verified, in cooldown, or over its reissue cap — only an account actually
 * sitting in PENDING_VERIFICATION and past its cooldown causes an email to go
 * out.
 *
 * That constant response is why the cooldown and the cap are enforced here
 * *silently* rather than reported as 429s the way resendOtp() can afford to:
 * by this point in the OTP flow the caller has already proved they hold the
 * password, and there is nothing left to leak. Here they have proved nothing.
 * The client counts down and caps in the UI against the same numbers; the
 * server is what actually holds the line.
 */
export async function resendVerificationCode(email: string, ip: string | null): Promise<ResendVerificationResult> {
  const constantResponse: ResendVerificationResult = {
    sentTo: maskEmail(email),
    expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
    cooldownSeconds: EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== 'PENDING_VERIFICATION') {
    return constantResponse;
  }

  const outstanding = await prisma.emailVerificationCode.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  if (outstanding) {
    const elapsedSeconds = (Date.now() - outstanding.createdAt.getTime()) / 1000;
    if (elapsedSeconds < EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS) return constantResponse;
    if (outstanding.resendCount >= EMAIL_VERIFICATION_MAX_RESENDS) {
      await recordAuditLog({
        actorUserId: user.id,
        action: 'ACCOUNT_VERIFICATION_RESEND_CAPPED',
        targetType: 'User',
        targetId: user.id,
        ipAddress: ip,
        metadata: { resendCount: outstanding.resendCount },
      });
      return constantResponse;
    }
  }

  const nextResendCount = (outstanding?.resendCount ?? 0) + 1;
  const code = await sendVerificationCode(user.id, user.email, nextResendCount);

  await recordAuditLog({
    actorUserId: user.id,
    action: 'ACCOUNT_VERIFICATION_RESENT',
    targetType: 'User',
    targetId: user.id,
    ipAddress: ip,
    // Counts only — never the code or the address.
    metadata: { resendCount: nextResendCount },
  });

  return { ...constantResponse, devVerificationCode: env.EXPOSE_DEV_OTP_CODE ? code : undefined };
}

/**
 * "I've forgotten my password."
 *
 * Same anti-enumeration posture as signup() and resendVerificationCode(),
 * and for the same reason: this endpoint is unauthenticated, and "does this
 * person use this clinic" is not a question it may answer. The response is
 * byte-identical whether the address is unknown, belongs to a disabled
 * account, or is a live patient — only the last of those produces an email.
 *
 * PENDING_VERIFICATION is deliberately excluded. Someone who never confirmed
 * their address has no business proving ownership of it via a *second*
 * emailed link; the fix for that account is to finish verification, and the
 * login error already says so.
 *
 * INVITED is excluded for a different reason: that account has never had a
 * password, only the unusable placeholder createInvite() sets. Its route in
 * is the activation link, and offering a reset instead would let someone who
 * knows an invited address bypass the invite.
 */
export async function requestPasswordReset(email: string, ip: string | null): Promise<{ devResetUrl?: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== 'ACTIVE') {
    // Log the miss so a spray against many addresses is visible in the audit
    // trail, without an actor and without confirming anything to the caller.
    await recordAuditLog({
      action: 'PASSWORD_RESET_REQUESTED_UNKNOWN',
      targetType: 'User',
      targetId: user?.id ?? null,
      ipAddress: ip,
      metadata: { email },
    });
    return {};
  }

  // Any older outstanding link is spent the moment a new one is issued —
  // two live reset links for one account widens the window instead of
  // replacing it, exactly as with OTP reissue.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = generateToken(32);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
    },
  });

  const resetUrl = `${env.APP_BASE_URL}/reset-password?token=${rawToken}`;
  const expiry = `${env.PASSWORD_RESET_TTL_MINUTES} minutes`;
  await emailProvider.sendEmail({
    to: user.email,
    subject: 'Reset your Aspire Bloods password',
    text: `Someone asked to reset the password for your Aspire Bloods account. Choose a new one here: ${resetUrl}\n\nThis link expires in ${expiry} and can only be used once. If it wasn't you, you can ignore this email. Your password has not changed.`,
    html: `<p>Someone asked to reset the password for your Aspire Bloods account.</p><p><a href="${resetUrl}">Choose a new password</a></p><p>This link expires in ${expiry} and can only be used once. If it wasn't you, you can ignore this email. Your password has not changed.</p>`,
  });

  await recordAuditLog({
    actorUserId: user.id,
    action: 'PASSWORD_RESET_REQUESTED',
    targetType: 'User',
    targetId: user.id,
    ipAddress: ip,
  });

  return { devResetUrl: env.EXPOSE_DEV_OTP_CODE ? resetUrl : undefined };
}

/**
 * Spending the reset link. Three things happen together, and all three matter:
 *
 *  1. the password changes;
 *  2. the token is consumed, along with every other outstanding one;
 *  3. every existing refresh token is revoked.
 *
 * (3) is the one that's easy to leave out. A password reset is what someone
 * does when they think somebody else is in their account — leaving that
 * somebody else's session alive would make the reset theatre. They are signed
 * out everywhere, including here: this function issues no session, so the
 * patient comes back through /login and therefore through 2FA. Holding the
 * reset link alone must never be enough to read results.
 */
export async function resetPassword(rawToken: string, newPassword: string, ip: string | null): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AuthError('This reset link is invalid or has expired. Please request a new one.', 400);
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user || user.status !== 'ACTIVE') {
    throw new AuthError('This reset link is invalid or has expired. Please request a new one.', 400);
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await recordAuditLog({
    actorUserId: user.id,
    action: 'PASSWORD_RESET_COMPLETED',
    targetType: 'User',
    targetId: user.id,
    ipAddress: ip,
  });

  // Told, not asked. If this wasn't them, this email is the only warning
  // they get, and it goes to the address that still owns the account.
  await emailProvider
    .sendEmail({
      to: user.email,
      subject: 'Your Aspire Bloods password was changed',
      text: `The password on your Aspire Bloods account was just changed, and you have been signed out on every device. If this wasn't you, call the clinic straight away.`,
      html: `<p>The password on your Aspire Bloods account was just changed, and you have been signed out on every device.</p><p>If this wasn't you, call the clinic straight away.</p>`,
    })
    .catch((e) => {
      // The reset itself has already succeeded and been audited — a failed
      // courtesy notice must not turn that into an error the patient sees.
      console.error('[password-reset] change notice failed', {
        userId: user.id,
        error: e instanceof Error ? e.message : e,
      });
    });
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
  sentTo?: string;
  channel?: 'EMAIL' | 'SMS';
  expiresInMinutes?: number;
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
  resendCount = 0,
): Promise<{ challengeId: string; sentTo: string; channel: 'EMAIL' | 'SMS'; expiresInMinutes: number; devOtpCode?: string }> {
  const channel = user.twoFactorMethod === 'SMS' && !isSmsEnabled() ? 'EMAIL' : user.twoFactorMethod;
  const code = generateOtpCode();
  const otp = await prisma.otpCode.create({
    data: {
      userId: user.id,
      codeHash: hashToken(code),
      channel,
      resendCount,
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
    // Masked, so the OTP screen can tell the patient where to look without
    // disclosing the full address to anyone reading the response.
    sentTo: channel === 'SMS' ? 'the number we hold for you' : maskEmail(user.email),
    channel,
    expiresInMinutes: OTP_TTL_MINUTES,
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

  // Correct password on an unverified account is the one case where saying
  // more leaks nothing: whoever typed that password owns the account, so
  // "check your email" tells them something they're entitled to know rather
  // than answering "is this address registered" for a stranger. Every other
  // failure — unknown address, wrong password, disabled account — still
  // returns the same message and the same timing profile.
  if (user && passwordOk && user.status === 'PENDING_VERIFICATION') {
    await recordAuditLog({
      actorUserId: user.id,
      action: 'LOGIN_BLOCKED_UNVERIFIED',
      targetType: 'User',
      targetId: user.id,
      ipAddress: ip,
    });
    throw new AuthError(
      'Confirm your email address first, using the code we emailed when you registered. You can ask for a new one on the confirm-your-email page.',
      403,
    );
  }

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

export interface ResendOtpResult {
  challengeId: string;
  /** Masked, never the full address — enough to confirm we're sending where they expect. */
  sentTo: string;
  channel: 'EMAIL' | 'SMS';
  expiresInMinutes: number;
  cooldownSeconds: number;
  resendsRemaining: number;
  devOtpCode?: string;
}

/**
 * "The code didn't arrive." Without this the patient's only option is to
 * abandon login entirely, so it's a genuine dead end rather than a missing
 * nicety.
 *
 * Every rule here is enforced server-side; the client's countdown is a
 * courtesy on top of it, never the control:
 *  - a fixed cooldown between sends, reported back so the UI can count down
 *    against the server's clock rather than guessing;
 *  - a cap on reissues per login attempt, after which the answer is a phone
 *    call to the practice, not another email;
 *  - the previous code is consumed the moment a new one is issued, so only
 *    ever one code works — a reissued challenge must not leave the old code
 *    live, or resending would widen the guessing window instead of
 *    resetting it.
 */
export async function resendOtp(challengeId: string, ip: string | null): Promise<ResendOtpResult> {
  const otp = await prisma.otpCode.findUnique({ where: { id: challengeId } });
  if (!otp || otp.consumedAt) {
    throw new AuthError('This sign-in attempt has expired. Please sign in again.', 400);
  }

  const elapsedSeconds = (Date.now() - otp.createdAt.getTime()) / 1000;
  if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
    const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds);
    throw new AuthError(`Please wait ${wait} more second${wait === 1 ? '' : 's'} before requesting another code.`, 429);
  }

  if (otp.resendCount >= OTP_MAX_RESENDS) {
    throw new AuthError(
      'We\'ve sent several codes to this account already. Please call the clinic so we can help you sign in.',
      429,
    );
  }

  const user = await prisma.user.findUnique({ where: { id: otp.userId } });
  if (!user || user.status !== 'ACTIVE') {
    throw new AuthError('This sign-in attempt has expired. Please sign in again.', 400);
  }

  // Invalidate before issuing: if the send below fails we have still
  // retired the old code, which is the safe direction to fail in.
  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

  const nextResendCount = otp.resendCount + 1;
  const challenge = await createOtpChallenge(user, ip, nextResendCount);

  const channel = user.twoFactorMethod === 'SMS' && isSmsEnabled() ? 'SMS' : 'EMAIL';

  await recordAuditLog({
    actorUserId: user.id,
    action: 'OTP_RESENT',
    targetType: 'User',
    targetId: user.id,
    ipAddress: ip,
    // IDs and counts only — never the code, the address, or the phone number.
    metadata: { previousChallengeId: otp.id, newChallengeId: challenge.challengeId, resendCount: nextResendCount, channel },
  });

  return {
    challengeId: challenge.challengeId,
    sentTo: channel === 'SMS' ? 'the number we hold for you' : maskEmail(user.email),
    channel,
    expiresInMinutes: OTP_TTL_MINUTES,
    cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    resendsRemaining: Math.max(0, OTP_MAX_RESENDS - nextResendCount),
    devOtpCode: challenge.devOtpCode,
  };
}

/**
 * "Wrong email — let me start again." The 2FA step used to be a one-way door:
 * once a code was sent the only escape was reloading the page, which left the
 * challenge live server-side until it aged out.
 *
 * Abandoning is deliberately treated as a real state change, not just a UI
 * back-button: the outstanding code is consumed immediately, so a code sitting
 * in an inbox belonging to a mistyped address can never be used afterwards.
 * Unknown/already-consumed challenge ids succeed silently — the caller is
 * walking away either way, and distinguishing the two would turn this into an
 * oracle for whether a given challenge id is live.
 */
export async function cancelOtpChallenge(challengeId: string, ip: string | null): Promise<void> {
  const otp = await prisma.otpCode.findUnique({ where: { id: challengeId } });
  if (!otp || otp.consumedAt) return;

  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

  await recordAuditLog({
    actorUserId: otp.userId,
    action: 'OTP_CHALLENGE_ABANDONED',
    targetType: 'User',
    targetId: otp.userId,
    ipAddress: ip,
    metadata: { challengeId: otp.id },
  });
}

interface OtpVerifyResult {
  accessToken: string;
  refreshTokenRaw: string;
  userId: string;
  email: string;
  /** As stored. The caller re-derives the effective role — see lib/adminAccess.ts. */
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

  return { ...result, userId: user.id, email: user.email, role: user.role, deviceIdToTrust };
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
