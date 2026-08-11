import { describe, it, expect, vi } from 'vitest';
import {
  PATIENT_IDLE_TIMEOUT_MINUTES,
  STAFF_IDLE_TIMEOUT_MINUTES,
  idleTimeoutMinutesForRole,
} from '@aspire-bloods/shared';
import { env } from '../src/config/env.js';
import { issueIdleDeadline, parseIdleDeadline, isIdleDeadlineLive } from '../src/lib/idleSession.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const MINUTE = 60 * 1000;

describe('idle timeout policy', () => {
  it('gives patients 90 minutes and staff 15', () => {
    expect(PATIENT_IDLE_TIMEOUT_MINUTES).toBe(90);
    expect(STAFF_IDLE_TIMEOUT_MINUTES).toBe(15);
    expect(idleTimeoutMinutesForRole('PATIENT')).toBe(90);
    expect(idleTimeoutMinutesForRole('ADMIN')).toBe(15);
    expect(idleTimeoutMinutesForRole('CLINICIAN')).toBe(15);
  });

  it('keeps the two roles genuinely separate rather than one deriving from the other', () => {
    expect(idleTimeoutMinutesForRole('ADMIN')).toBeLessThan(idleTimeoutMinutesForRole('PATIENT'));
  });

  /**
   * The regression this whole mechanism exists for. The idle sign-out used to
   * BE the access token lapsing, so the two numbers were the same by
   * construction and changing one changed the other. A patient idle window
   * longer than the access token lifetime is only possible once they are
   * genuinely independent.
   */
  it('is independent of the access token lifetime', () => {
    expect(env.ACCESS_TOKEN_TTL_MINUTES).toBe(15);
    expect(PATIENT_IDLE_TIMEOUT_MINUTES).toBeGreaterThan(env.ACCESS_TOKEN_TTL_MINUTES);
  });
});

describe('issueIdleDeadline', () => {
  it('sets the deadline from the role, not from a shared default', () => {
    const before = Date.now();
    const patient = issueIdleDeadline(USER, 'PATIENT');
    const admin = issueIdleDeadline(USER, 'ADMIN');

    expect(patient.deadlineMs - before).toBeGreaterThanOrEqual(89 * MINUTE);
    expect(patient.deadlineMs - before).toBeLessThanOrEqual(91 * MINUTE);
    expect(admin.deadlineMs - before).toBeGreaterThanOrEqual(14 * MINUTE);
    expect(admin.deadlineMs - before).toBeLessThanOrEqual(16 * MINUTE);
  });

  it('round-trips the user it was issued for', () => {
    const { value, deadlineMs } = issueIdleDeadline(USER, 'PATIENT');
    expect(parseIdleDeadline(value)).toEqual({ userId: USER, deadlineMs });
  });
});

describe('parseIdleDeadline', () => {
  it('refuses a value it did not sign', () => {
    const forged = `${USER}.${Date.now() + 60 * MINUTE}.notarealsignature`;
    expect(parseIdleDeadline(forged)).toBeNull();
  });

  it('refuses a deadline edited to a later time under its original signature', () => {
    const { value } = issueIdleDeadline(USER, 'PATIENT');
    const signature = value.slice(value.lastIndexOf('.') + 1);
    const extended = `${USER}.${Date.now() + 24 * 60 * MINUTE}.${signature}`;
    expect(parseIdleDeadline(extended)).toBeNull();
  });

  it.each([undefined, '', 'nonsense', 'no.signature.here'])('refuses %p', (raw) => {
    expect(parseIdleDeadline(raw as string | undefined)).toBeNull();
  });
});

describe('isIdleDeadlineLive', () => {
  it('accepts a session inside its window and rejects one past it', () => {
    const now = Date.now();
    const { value } = issueIdleDeadline(USER, 'PATIENT');

    expect(isIdleDeadlineLive(value, USER, now + 89 * MINUTE)).toBe(true);
    expect(isIdleDeadlineLive(value, USER, now + 91 * MINUTE)).toBe(false);
  });

  it('holds staff to the shorter window at the same moment a patient is still live', () => {
    const now = Date.now();
    const patient = issueIdleDeadline(USER, 'PATIENT');
    const admin = issueIdleDeadline(USER, 'ADMIN');
    // Deliberately a moment that is inside the patient's 90-minute window and
    // well past the staff 15 — the point of the pair is that raising one did
    // not raise the other.
    const twentyMinutesLater = now + 20 * MINUTE;

    expect(isIdleDeadlineLive(patient.value, USER, twentyMinutesLater)).toBe(true);
    expect(isIdleDeadlineLive(admin.value, USER, twentyMinutesLater)).toBe(false);
  });

  /** Deleting the cookie must sign you out, never exempt you from the timeout. */
  it('fails closed when the cookie is absent or unreadable', () => {
    expect(isIdleDeadlineLive(undefined, USER)).toBe(false);
    expect(isIdleDeadlineLive('tampered.value.here', USER)).toBe(false);
  });

  it('refuses a deadline issued for a different user', () => {
    const { value } = issueIdleDeadline(OTHER_USER, 'PATIENT');
    expect(isIdleDeadlineLive(value, USER)).toBe(false);
  });

  /**
   * "Idle" has to mean genuinely idle, not "90 minutes since sign-in". Signing
   * in and then interacting at the 20-minute mark has to buy another full
   * window, not run out at minute 30.
   */
  it('slides forward when activity re-issues it, rather than counting from sign-in', () => {
    vi.useFakeTimers();
    try {
      const signedInAt = new Date('2026-08-08T09:00:00Z').getTime();
      vi.setSystemTime(signedInAt);
      const atSignIn = issueIdleDeadline(USER, 'PATIENT');
      expect(isIdleDeadlineLive(atSignIn.value, USER, signedInAt + 91 * MINUTE)).toBe(false);

      // A request at minute 60 slides the deadline to minute 150.
      vi.setSystemTime(signedInAt + 60 * MINUTE);
      const afterActivity = issueIdleDeadline(USER, 'PATIENT');
      expect(afterActivity.deadlineMs).toBe(signedInAt + 150 * MINUTE);
      expect(isIdleDeadlineLive(afterActivity.value, USER, signedInAt + 91 * MINUTE)).toBe(true);
      expect(isIdleDeadlineLive(afterActivity.value, USER, signedInAt + 151 * MINUTE)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
