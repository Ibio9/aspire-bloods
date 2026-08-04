import { Router } from 'express';
import {
  loginRequestSchema,
  otpVerifyRequestSchema,
  activateAccountRequestSchema,
  inviteRequestSchema,
  signupRequestSchema,
} from '@aspire-bloods/shared';
import { authGuard } from '../../middleware/authGuard.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { loginRateLimiter, otpRateLimiter, signupRateLimiter } from '../../middleware/rateLimit.js';
import { verifyCsrf, generateCsrfToken } from '../../middleware/csrf.js';
import {
  setAccessTokenCookie,
  setRefreshTokenCookie,
  setCsrfCookie,
  setTrustedDeviceCookie,
  clearAuthCookies,
} from '../../lib/cookies.js';
import { prisma } from '../../db/client.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import {
  AuthError,
  createInvite,
  activateAccount,
  signup,
  login,
  loginWithTrustedDevice,
  verifyOtp,
  refreshSession,
  logout,
} from './service.js';

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

authRouter.post('/login', loginRateLimiter, asyncHandler(async (req, res) => {
  const parsed = loginRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await login(parsed.data.email, parsed.data.password, req.cookies?.device_id, clientIp(req));

    if (result.trustedDeviceSkippedOtp) {
      const session = await loginWithTrustedDevice(result.userId!, result.role!, clientIp(req), req.header('user-agent') ?? null);
      setAccessTokenCookie(res, session.accessToken);
      setRefreshTokenCookie(res, session.refreshTokenRaw);
      setCsrfCookie(res, generateCsrfToken());
      return res.json({ status: 'authenticated' });
    }

    return res.json({ status: 'otp_required', challengeId: result.challengeId, devOtpCode: result.devOtpCode });
  } catch (e) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
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
    if (result.deviceIdToTrust) {
      setTrustedDeviceCookie(res, result.deviceIdToTrust);
    }
    res.json({ status: 'authenticated' });
  } catch (e) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const result = await refreshSession(refreshToken, clientIp(req), req.header('user-agent') ?? null);
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

authRouter.post('/logout', verifyCsrf, asyncHandler(async (req, res) => {
  await logout(req.cookies?.refresh_token);
  clearAuthCookies(res);
  res.json({ status: 'logged_out' });
}));

authRouter.get('/me', authGuard, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { patientProfile: true, staffProfile: true },
  });
  if (!user) return res.status(404).json({ error: 'Not found' });

  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.patientProfile
      ? `${user.patientProfile.firstName} ${user.patientProfile.lastName}`
      : user.staffProfile
        ? `${user.staffProfile.firstName} ${user.staffProfile.lastName}`
        : user.email,
  });
}));
