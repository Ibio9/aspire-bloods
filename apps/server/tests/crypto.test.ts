import { describe, it, expect } from 'vitest';
import { encryptField, decryptField, generateToken, hashToken, generateOtpCode } from '../src/lib/crypto.js';

describe('encryptField / decryptField', () => {
  it('round-trips a plaintext value', () => {
    const plaintext = '1990-01-01';
    const ciphertext = encryptField(plaintext);
    expect(ciphertext).not.toContain(plaintext);
    expect(decryptField(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', () => {
    const a = encryptField('same value');
    const b = encryptField('same value');
    expect(a).not.toBe(b);
  });

  it('throws if the ciphertext has been tampered with', () => {
    const ciphertext = encryptField('sensitive');
    const tampered = ciphertext.slice(0, -4) + 'XXXX';
    expect(() => decryptField(tampered)).toThrow();
  });
});

describe('hashToken', () => {
  it('is deterministic for the same input', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });
});

describe('generateOtpCode', () => {
  it('generates a 6-digit numeric code by default', () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });
});
