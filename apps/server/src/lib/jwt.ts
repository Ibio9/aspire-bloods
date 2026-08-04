import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { UserRole } from '@aspire-bloods/shared';

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  // Role as stored in the database at the time of login — advisory only
  // for non-admin distinctions (CLINICIAN vs PATIENT). NEVER trusted
  // directly for ADMIN: authGuard re-derives that from ADMIN_EMAILS on
  // every request (see lib/adminAccess.ts), specifically so removing
  // someone from the env var revokes admin immediately, without waiting
  // for their session to expire or be revoked.
  role: UserRole;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}
