import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Self-contained, short-expiry signed file tokens — the local-disk
 * equivalent of an S3 presigned URL. Encodes fileId + expiry + HMAC
 * signature so the download route needs no session cookie to verify it,
 * matching "signed, short-expiry URLs only, never a public bucket."
 * Swapping to a real object store later means returning its presigned URL
 * instead of this token from the same call site — nothing else changes.
 */
export function generateFileToken(fileId: string, ttlMinutes = env.FILE_URL_TTL_MINUTES): string {
  const exp = Date.now() + ttlMinutes * 60 * 1000;
  const payload = `${fileId}.${exp}`;
  const sig = crypto.createHmac('sha256', env.FILE_SIGNING_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyFileToken(token: string): { fileId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [fileId, expStr, sig] = parts;
  const payload = `${fileId}.${expStr}`;
  const expected = crypto.createHmac('sha256', env.FILE_SIGNING_SECRET).update(payload).digest('base64url');

  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  if (Number(expStr) < Date.now()) return null;
  return { fileId };
}
