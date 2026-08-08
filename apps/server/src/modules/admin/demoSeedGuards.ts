/**
 * The guard that stands between the demo teardown and real patient data.
 *
 * Split out of demoSeedService.ts so it can be tested without a database.
 * The teardown is the only hard-delete path in the product (everything else
 * voids or deactivates — see CLAUDE.md), so "which rows may it touch" is not
 * a detail to leave implicit in a where-clause. The rule is: every report it
 * is about to delete must belong to the one patient row resolved from
 * SEED_DEMO_EMAIL, and that patient must itself have been resolved by that
 * address. Anything else throws before a single row is removed.
 */

export class DemoSeedGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoSeedGuardError';
  }
}

export interface ReportOwnership {
  id: string;
  patientId: string;
}

/**
 * Throws unless every report belongs to `demoPatientId`.
 *
 * Deliberately takes the rows as they were read back from the database rather
 * than trusting the id list the caller assembled: the point is to re-check
 * ownership against storage immediately before deleting, so a stale or
 * mis-scoped query upstream cannot smuggle another patient's report into the
 * batch.
 */
export function assertOnlyDemoReports(reports: ReportOwnership[], demoPatientId: string): void {
  if (!demoPatientId) {
    throw new DemoSeedGuardError('Refusing to delete reports: no demo patient id was resolved.');
  }

  const foreign = reports.filter((r) => r.patientId !== demoPatientId);
  if (foreign.length > 0) {
    const owners = [...new Set(foreign.map((r) => r.patientId))];
    throw new DemoSeedGuardError(
      `Refusing to delete ${foreign.length} report(s) that do not belong to the demo patient ` +
        `(${owners.length} other patient(s) involved). Demo teardown is scoped to SEED_DEMO_EMAIL only.`,
    );
  }
}

/**
 * Throws unless the resolved patient is the one SEED_DEMO_EMAIL names.
 *
 * Email comparison is case-insensitive and trimmed, matching how addresses are
 * compared everywhere else (see lib/adminAccess.ts).
 */
export function assertIsDemoAccount(patient: { id: string; email: string }, demoEmail: string): void {
  const expected = demoEmail.trim().toLowerCase();
  const actual = patient.email.trim().toLowerCase();
  if (!expected) {
    throw new DemoSeedGuardError('Refusing to touch demo data: no demo email is configured.');
  }
  if (actual !== expected) {
    throw new DemoSeedGuardError(
      `Refusing to touch demo data: resolved account does not match SEED_DEMO_EMAIL. This is the guard that keeps the teardown off real patient records.`,
    );
  }
}
