import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Double-submit cookie CSRF check: the SPA reads the non-httpOnly
 * `csrf_token` cookie and echoes it in the `X-CSRF-Token` header on every
 * mutating request. A cross-site attacker can trigger the request but
 * cannot read the cookie to forge the header (same-origin policy).
 */
export function verifyCsrf(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.header('X-CSRF-Token');

  if (
    !cookieToken ||
    !headerToken ||
    cookieToken.length !== headerToken.length ||
    !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
  ) {
    return res.status(403).json({ error: 'CSRF token missing or invalid' });
  }
  return next();
}
