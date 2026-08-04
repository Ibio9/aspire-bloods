import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import { isAdminEmail } from '../lib/adminAccess.js';
import type { UserRole } from '@aspire-bloods/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: UserRole };
    }
  }
}

/**
 * Admin role is re-derived from ADMIN_EMAILS on every single request,
 * never trusted from the JWT payload or the database. This is the whole
 * point of the env-var design: editing the Railway variable and
 * redeploying revokes (or grants) admin access on someone's very next
 * request, with no session revocation step needed.
 */
function effectiveRole(email: string, storedRole: UserRole): UserRole {
  if (isAdminEmail(email)) return 'ADMIN';
  return storedRole === 'CLINICIAN' ? 'CLINICIAN' : 'PATIENT';
}

export function authGuard(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.access_token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: effectiveRole(payload.email, payload.role) };
    return next();
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
}
