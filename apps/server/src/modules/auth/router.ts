import { Router } from 'express';
import { z } from 'zod';
import {
  loginRequestSchema,
  otpVerifyRequestSchema,
  activateAccountRequestSchema,
  inviteRequestSchema,
  signupRequestSchema,
  verifyEmailRequestSchema,
  resendVerificationRequestSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
} from '@aspire-bloods/shared';
import { authGuard } from '../../middleware/authGuard.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import {
  loginRateLimiter,
  otpRateLimiter,
  otpResendRateLimiter,
  signupRateLimiter,
  emailVerificationResendRateLimiter,
  passwordResetRateLimiter,
  resetLoginAttempts,
} from '../../middleware/rateLimit.js';
import { verifyCsrf, generateCsrfToken } from '../../middleware/csrf.js';
import {
  setAccessTokenCookie,
  setRefreshTokenCookie,
  setCsrfCookie,
  setTrustedDeviceCookie,
  setIdleDeadlineCookie,
  clearAuthCookies,
} from '../../lib/cookies.js';
import { effectiveRole } from '../../lib/adminAccess.js';
import { IDLE_COOKIE_NAME, parseIdleDeadline } from '../../lib/idleSession.js';
import { IDLE_TIMEOUT_ERROR_CODE } from '@aspire-bloods/shared';
import { prisma } from '../../db/client.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import {
  AuthError,
  createInvite,
  activateAccount,
  signup,
  verifyEmail,
  resendVerificationCode,
  requestPasswordReset,
  resetPassword,
  login,
  loginWithTrustedDevice,
  verifyOtp,
  resendOtp,
  cancelOtpChallenge,
  refreshSession,
  logout,
} from './service.js';

/** Every OTP challenge response has the same shape, whichever flow created it. */
function otpChallengeResponse(result: {
  challengeId?: string;
  sentTo?: string;
  channel?: 'EMAIL' | 'SMS';
  expiresInMinutes?: number;
  devOtpCode?: string;
}) {
  return {
    status: 'otp_required' as const,
    challengeId: result.challengeId,
    sentTo: result.sentTo,
    channel: result.channel,
    expiresInMinutes: result.expiresInMinutes,
    devOtpCode: result.devOtpCode,
  };
}

export const authRouter = Router();

function clientIp(req: import('express').Request): string | null {
  return req.ip ?? null;
}

authRouter.post('/invite', authGuard, roleGuard('ADMIN'), verifyCsrf, asyncHandler(async (req, res) => {
  const parsed = inviteRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await createInvite(parsed.data.email, req.user!.id, clientIp(req));
    res.status(201).json(result);
  } catch (e) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

authRouter.post('/activate', asyncHandler(async (req, res) => {
  const parsed = activateAccountRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await activateAccount(parsed.data, clientIp(req));
    res.status(200).json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

// Open registration. This endpoint never returns a session and never
// returns a 2FA challenge — it can only ever say "we've emailed you a code".
// The ordering the practice asked for (verify the address, THEN enrol 2FA) is
// enforced by there being no other exit: /auth/verify-email is what issues
// the OTP challenge, and /auth/otp/verify is what issues the session.
authRouter.post('/signup', signupRateLimiter, asyncHandler(async (req, res) => {
  const parsed = signupRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await signup(parsed.data, clientIp(req));
    res.status(201).json(result);
  } catch (e) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

// The LAST step of registration, and it is the only code a new patient enters.
//
// It used to answer with a second OTP challenge, so registering meant reading
// one six-digit code out of an email and then a second one out of a second
// email, on a screen that looked identical — the same proof, asked for twice.
// See verifyEmail(): this now issues the session, and two-factor sign-in is
// unchanged and still mandatory on every subsequent login.
//
// Shares otpRateLimiter's budget deliberately — it is the same thing being
// guessed (a six-digit code) at the same stakes, and giving it its own bucket
// would just hand an attacker a second million-guess allowance.
authRouter.post('/verify-email', otpRateLimiter, asyncHandler(async (req, res) => {
  const parsed = verifyEmailRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter the 6-digit code we emailed you.' });

  try {
    const result = await verifyEmail(
      parsed.data.email,
      parsed.data.code,
      clientIp(req),
      req.header('user-agent') ?? null,
    );
    setAccessTokenCookie(res, result.accessToken);
    setRefreshTokenCookie(res, result.refreshTokenRaw);
    setCsrfCookie(res, generateCsrfToken());
    setIdleDeadlineCookie(res, result.userId, effectiveRole(result.email, result.role));
    res.json({ status: 'authenticated' });
  } catch (e) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

// Always 202 with the same body, whether or not anything was sent — see
// resendVerificationCode()'s anti-enumeration note. The cooldown and the
// reissue cap are enforced inside that function rather than reported here,
// for the same reason.
authRouter.post('/verify-email/resend', emailVerificationResendRateLimiter, asyncHandler(async (req, res) => {
  const parsed = resendVerificationRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await resendVerificationCode(parsed.data.email, clientIp(req));
  res.status(202).json({ status: 'verification_sent', ...result });
}));

// Always 202 with the same body, whether or not anything was sent — same
// reasoning as the verification resend above. See requestPasswordReset().
authRouter.post('/password-reset/request', passwordResetRateLimiter, asyncHandler(async (req, res) => {
  const parsed = passwordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await requestPasswordReset(parsed.data.email, clientIp(req));
  res.status(202).json({ status: 'reset_requested', ...result });
}));

// Spending the link. Deliberately returns no session and no 2FA challenge:
// the patient signs in afterwards through /login like anyone else, so a
// stolen reset link can change a password but can never read a result.
authRouter.post('/password-reset/confirm', passwordResetRateLimiter, asyncHandler(async (req, res) => {
  const parsed = passwordResetConfirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await resetPassword(parsed.data.token, parsed.data.password, clientIp(req));
    res.json({ status: 'password_reset' });
  } catch (e) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

authRouter.post('/login', loginRateLimiter, asyncHandler(async (req, res) => {
  const parsed = loginRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await login(parsed.data.email, parsed.data.password, req.cookies?.device_id, clientIp(req));

    // Credentials were right, so this connection's failed-attempt count is
    // noise from a person mistyping, not evidence of guessing. Clearing it
    // here (rather than only letting the window age out) is what stops a
    // successful sign-in from leaving someone half-way to a lockout on
    // their next one.
    await resetLoginAttempts(loginRateLimiter, req);

    if (result.trustedDeviceSkippedOtp) {
      const session = await loginWithTrustedDevice(
        result.userId!,
        result.email!,
        result.role!,
        clientIp(req),
        req.header('user-agent') ?? null,
      );
      setAccessTokenCookie(res, session.accessToken);
      setRefreshTokenCookie(res, session.refreshTokenRaw);
      setCsrfCookie(res, generateCsrfToken());
      setIdleDeadlineCookie(res, result.userId!, effectiveRole(result.email!, result.role!));
      return res.json({ status: 'authenticated' });
    }

    return res.json(otpChallengeResponse(result));
  } catch (e) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

// "The code didn't arrive" — without this the patient's only way out of the
// 2FA step is to abandon signing in. Rate-limited here and cooldown-capped
// in the service; the client's countdown is presentation, not the control.
const otpResendRequestSchema = z.object({ challengeId: z.string().uuid() });

authRouter.post('/otp/resend', otpResendRateLimiter, asyncHandler(async (req, res) => {
  const parsed = otpResendRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A valid sign-in attempt is required.' });

  try {
    const result = await resendOtp(parsed.data.challengeId, clientIp(req));
    res.json({ status: 'otp_resent', ...result });
  } catch (e) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

// Backing out of the 2FA step ("wrong email — let me start again"). Without
// this, leaving the OTP screen only ever abandoned it client-side: the code
// stayed live until it expired. Deliberately unauthenticated and un-rate-limited
// beyond the schema check — it only ever retires a code, so the worst a caller
// can do with a guessed id is invalidate a challenge, which is what the owner
// of that challenge is asking for anyway.
const otpCancelRequestSchema = z.object({ challengeId: z.string().uuid() });

authRouter.post('/otp/cancel', asyncHandler(async (req, res) => {
  const parsed = otpCancelRequestSchema.safeParse(req.body);
  // Nothing to cancel and nothing to report — the caller is leaving regardless.
  if (!parsed.success) return res.json({ status: 'otp_cancelled' });

  await cancelOtpChallenge(parsed.data.challengeId, clientIp(req));
  res.json({ status: 'otp_cancelled' });
}));

authRouter.post('/otp/verify', otpRateLimiter, asyncHandler(async (req, res) => {
  const parsed = otpVerifyRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await verifyOtp(
      parsed.data.challengeId,
      parsed.data.code,
      parsed.data.trustDevice,
      clientIp(req),
      req.header('user-agent') ?? null,
    );
    setAccessTokenCookie(res, result.accessToken);
    setRefreshTokenCookie(res, result.refreshTokenRaw);
    setCsrfCookie(res, generateCsrfToken());
    setIdleDeadlineCookie(res, result.userId, effectiveRole(result.email, result.role));
    if (result.deviceIdToTrust) {
      setTrustedDeviceCookie(res, result.deviceIdToTrust);
    }
    res.json({ status: 'authenticated' });
  } catch (e) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

/**
 * Silent token rotation. Deliberately does NOT slide the idle deadline: this is
 * a background timer, not a person, and a session that only ever sees refresh
 * calls is by definition idle. It checks the deadline before rotating, so an
 * abandoned tab cannot keep minting fresh access tokens overnight and then be
 * resurrected by a single click the next morning.
 *
 * The check happens before refreshSession() rather than after because rotation
 * revokes the presented token — rejecting afterwards would leave the session
 * unusable either way, but this way an idle refresh is a clean no-op.
 */
authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) return res.status(401).json({ error: 'Not authenticated' });

  const idle = parseIdleDeadline(req.cookies?.[IDLE_COOKIE_NAME]);
  if (!idle || Date.now() > idle.deadlineMs) {
    clearAuthCookies(res);
    return res.status(401).json({
      error: 'Signed out after a period of inactivity',
      code: IDLE_TIMEOUT_ERROR_CODE,
    });
  }

  try {
    const result = await refreshSession(refreshToken, clientIp(req), req.header('user-agent') ?? null);
    // The deadline that authorised this rotation has to belong to the session
    // being rotated, or one user's activity would keep another's alive.
    if (idle.userId !== result.userId) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Not authenticated' });
    }
    setAccessTokenCookie(res, result.accessToken);
    setRefreshTokenCookie(res, result.refreshTokenRaw);
    setCsrfCookie(res, generateCsrfToken());
    res.json({ status: 'refreshed' });
  } catch (e) {
    clearAuthCookies(res);
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

/**
 * "Someone is still here." Reading a long report issues no other requests, so
 * without this the browser could show a fully active session that the server
 * had already timed out. authGuard slides the deadline for every request that
 * passes through it, including this one, so the handler only has to report
 * where the deadline now sits — the client aligns its warning modal to that
 * rather than to its own clock.
 */
authRouter.post('/activity', authGuard, verifyCsrf, asyncHandler(async (req, res) => {
  res.json({ status: 'active', idleDeadlineMs: req.idleDeadlineMs });
}));

authRouter.post('/logout', verifyCsrf, asyncHandler(async (req, res) => {
  await logout(req.cookies?.refresh_token, clientIp(req));
  clearAuthCookies(res);
  res.json({ status: 'logged_out' });
}));

authRouter.get('/me', authGuard, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { patientProfile: true, staffProfile: true },
  });
  if (!user) return res.status(404).json({ error: 'Not found' });

  /**
   * IS THERE A RESULTS-READY MOMENT WAITING?
   *
   * Answered HERE rather than by the screen itself, and the difference is what
   * the patient sees. HomeRouter runs on "/" and has to decide where a sign-in
   * lands; if it had to fetch this separately it would render the Overview
   * first and then replace it, so a moment meant to be the first thing somebody
   * sees would arrive as an interruption of the page behind it.
   *
   * A BOOLEAN, like `walkthroughSeen` and for the same reason: the only
   * question here is "send them there or not", and shipping the report id
   * invites something to render it. The screen fetches its own detail.
   *
   * Only for accounts with a patient profile — a clinician-only account has no
   * reports of their own and the query would be a round trip to learn zero.
   */
  const resultsReadyPending = user.patientProfile
    ? (await prisma.report.count({
        where: { patientId: user.id, status: 'RELEASED', voidedAt: null, resultsReadySeenAt: null },
      })) > 0
    : false;

  res.json({
    id: user.id,
    email: user.email,
    // req.user.role, not user.role — authGuard already re-derived this
    // from ADMIN_EMAILS; the raw DB column must never be shown or trusted
    // directly (see lib/adminAccess.ts).
    role: req.user!.role,
    displayName: user.patientProfile
      ? `${user.patientProfile.firstName} ${user.patientProfile.lastName}`
      : user.staffProfile
        ? `${user.staffProfile.firstName} ${user.staffProfile.lastName}`
        : user.email,
    // Self-registered admins are patient-shaped accounts underneath (see
    // auth/service.ts signup()) — this is what lets the frontend show
    // "my results" alongside the admin console on the same account.
    hasPatientProfile: !!user.patientProfile,
    // Whether this patient has been shown the introduction. A boolean rather
    // than the timestamp: the client's only question is "show it or not", and
    // sending a date invites somebody to render it.
    walkthroughSeen: user.walkthroughSeenAt !== null,
    // Whether a released report this patient has never opened is waiting. See
    // above; it is per REPORT and stored on the report, so it cannot come back
    // on the next sign-in the way anything session- or storage-keyed would.
    resultsReadyPending,
  });
}));
