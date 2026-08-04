import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = Buffer.from(env.ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256)');
  }
  return key;
}

/** Encrypts a field value for at-rest storage. Layout: base64(iv || authTag || ciphertext). */
export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/** Decrypts a value produced by encryptField. Throws if tampered or key mismatch. */
export function decryptField(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Generates a URL-safe random token (invite links, OTP challenge ids, refresh tokens). */
export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * One-way hash for opaque tokens/OTP codes stored for lookup+comparison
 * (invite tokens, refresh tokens, OTP codes — not passwords, see
 * lib/password.ts, and not the AES field key above — a distinct HMAC
 * secret keeps encryption and token-hashing key material separate).
 */
export function hashToken(token: string): string {
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

/** Generates a numeric OTP code, e.g. "483920". */
export function generateOtpCode(digits = 6): string {
  const max = 10 ** digits;
  const n = crypto.randomInt(0, max);
  return n.toString().padStart(digits, '0');
}
