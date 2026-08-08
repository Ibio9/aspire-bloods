import type { NextFunction, Request, Response } from 'express';
import { IDLE_TIMEOUT_ERROR_CODE, type UserRole } from '@aspire-bloods/shared';
import { verifyAccessToken } from '../lib/jwt.js';
import { effectiveRole } from '../lib/adminAccess.js';
import { IDLE_COOKIE_NAME, isIdleDeadlineLive } from '../lib/idleSession.js';
import { setIdleDeadlineCookie, clearAuthCookies } from '../lib/cookies.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: UserRole };
      /** When the session will go idle, as of this request. Set by authGuard. */
      idleDeadlineMs?: number;
    }
  }
}

/**
 * Authentication, and the server side of the idle timeout.
 *
 * Reaching a guarded endpoint IS activity — the SPA only calls these when
 * someone is using it. The one authenticated request that must not count is
 * the silent token refresh, and that is excluded structurally rather than by a
 * path check: /auth/refresh authenticates on the refresh cookie and never
 * passes through this guard, so a background timer can rotate tokens all night
 * without ever moving the deadline (see modules/auth/router.ts).
 *
 * Reading a long page issues no requests at all, so the browser reports real
 * interaction through POST /auth/activity, which does pass through here. That
 * is a client-asserted signal — no server can observe a mouse — but it can
 * only ever be asserted by a live, authenticated, CSRF-valid request, and the
 * deadline itself is held and enforced here.
 */
export function authGuard(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.access_token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }

  const role = effectiveRole(payload.email, payload.role);

  // Fails closed: a missing or unverifiable idle cookie is treated as expired,
  // so deleting it signs you out rather than exempting you from the timeout.
  if (!isIdleDeadlineLive(req.cookies?.[IDLE_COOKIE_NAME], payload.sub)) {
    clearAuthCookies(res);
    return res.status(401).json({
      error: 'Signed out after a period of inactivity',
      code: IDLE_TIMEOUT_ERROR_CODE,
    });
  }

  req.user = { id: payload.sub, email: payload.email, role };
  // Slid on the effective role, so an admin never inherits the patient window.
  req.idleDeadlineMs = setIdleDeadlineCookie(res, payload.sub, role);
  return next();
}
