import { describe, it, expect } from 'vitest';
import {
  DemoSeedGuardError,
  assertIsDemoAccount,
  assertOnlyDemoReports,
} from '../src/modules/admin/demoSeedGuards.js';

/**
 * The demo teardown is the only hard-delete path in the product. These tests
 * exist for one reason: to make it impossible for that path to reach a real
 * patient's reports. Every case below is a way it could have, and must not.
 */

const DEMO = 'demo-patient-id';
const REAL = 'a-real-patient-id';

describe('assertOnlyDemoReports', () => {
  it('allows a batch that belongs entirely to the demo patient', () => {
    expect(() =>
      assertOnlyDemoReports(
        [
          { id: 'r1', patientId: DEMO },
          { id: 'r2', patientId: DEMO },
        ],
        DEMO,
      ),
    ).not.toThrow();
  });

  it('allows an empty batch', () => {
    expect(() => assertOnlyDemoReports([], DEMO)).not.toThrow();
  });

  it('refuses a batch containing another patient’s report', () => {
    expect(() =>
      assertOnlyDemoReports(
        [
          { id: 'r1', patientId: DEMO },
          { id: 'r2', patientId: REAL },
        ],
        DEMO,
      ),
    ).toThrow(DemoSeedGuardError);
  });

  it('refuses a batch that is entirely another patient’s', () => {
    expect(() => assertOnlyDemoReports([{ id: 'r1', patientId: REAL }], DEMO)).toThrow(/do not belong to the demo patient/);
  });

  /** An unresolved demo id must never be treated as "matches everything". */
  it('refuses when no demo patient id was resolved', () => {
    expect(() => assertOnlyDemoReports([{ id: 'r1', patientId: REAL }], '')).toThrow(DemoSeedGuardError);
  });

  it('names how many other patients were involved, so the log is actionable', () => {
    try {
      assertOnlyDemoReports(
        [
          { id: 'r1', patientId: 'p1' },
          { id: 'r2', patientId: 'p2' },
          { id: 'r3', patientId: DEMO },
        ],
        DEMO,
      );
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('2 report(s)');
      expect((e as Error).message).toContain('2 other patient(s)');
    }
  });
});

describe('assertIsDemoAccount', () => {
  const demoEmail = 'demo.showcase@aspireshield.dev';

  it('accepts the account SEED_DEMO_EMAIL names', () => {
    expect(() => assertIsDemoAccount({ id: DEMO, email: demoEmail }, demoEmail)).not.toThrow();
  });

  it('accepts it regardless of case or surrounding whitespace', () => {
    expect(() => assertIsDemoAccount({ id: DEMO, email: '  Demo.Showcase@AspireShield.dev ' }, demoEmail)).not.toThrow();
  });

  it('refuses any other account', () => {
    expect(() => assertIsDemoAccount({ id: REAL, email: 'olivia.bennett@example.com' }, demoEmail)).toThrow(
      DemoSeedGuardError,
    );
  });

  /** A blank SEED_DEMO_EMAIL must fail closed, not match the first account it sees. */
  it('refuses when no demo email is configured', () => {
    expect(() => assertIsDemoAccount({ id: REAL, email: 'anyone@example.com' }, '')).toThrow(DemoSeedGuardError);
  });

  it('does not leak the configured address into the error message', () => {
    try {
      assertIsDemoAccount({ id: REAL, email: 'someone@example.com' }, demoEmail);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).not.toContain(demoEmail);
      expect((e as Error).message).not.toContain('someone@example.com');
    }
  });
});
