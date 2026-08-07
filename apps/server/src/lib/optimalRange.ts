import type { OptimalRangeDTO, Sex } from '@aspire-bloods/shared';
import { resolveOptimalRange, isWithinOptimal } from '@aspire-bloods/shared';
import { prisma } from '../db/client.js';
import { decryptField } from './crypto.js';
import { ageFromDob } from './resolveReferenceRange.js';

/**
 * Resolving a patient's optimal band, server-side, from the static table in
 * packages/shared/optimalRanges.ts.
 *
 * Two constraints shape this file:
 *
 *  - Personalisation is by age and biological sex ONLY. Never by the
 *    patient's own history: a value that has climbed steadily for a decade
 *    must not have that climb absorbed into "optimal for you", which is
 *    exactly what fitting a band to someone's own past results would do.
 *  - No model call. Every band resolves from the static table, at read time,
 *    with no network in the path — an advisory band that varies between two
 *    page loads of the same result isn't advice, it's noise.
 */

export interface OptimalContext {
  sex: Sex | null;
  age: number | null;
}

/**
 * Age and sex for one patient.
 *
 * Sex comes from the account first. Where the account has none, it falls back
 * to what the lab recorded on the patient's most recent result payload — the
 * clinic captures biological sex at order time and Randox echo it back, so
 * for an API-sourced report there is a second copy of the same fact. The
 * account is preferred because the patient owns it and can correct it; the
 * payload is a fallback, never an override.
 */
export async function optimalContextForPatient(patientId: string): Promise<OptimalContext> {
  const profile = await prisma.patientProfile.findUnique({ where: { userId: patientId } });
  const age = profile?.dobEncrypted ? ageFromDob(decryptField(profile.dobEncrypted)) : null;

  if (profile?.sex && profile.sex !== 'ANY') return { sex: profile.sex, age };

  const fromLab = await prisma.reportMeasurements.findFirst({
    where: { report: { patientId }, biologicalSex: { in: ['MALE', 'FEMALE'] } },
    orderBy: { createdAt: 'desc' },
    select: { biologicalSex: true },
  });

  return { sex: (fromLab?.biologicalSex as Sex | undefined) ?? null, age };
}

/**
 * The optimal band for one result, or null.
 *
 * Null is a real answer and the common one: most markers have no established
 * optimal range, and those must show the lab range alone with nothing said
 * about optimal at all — not an empty band, not a placeholder.
 */
export function optimalFor(
  markerKey: string,
  displayUnit: string,
  value: number | null,
  ctx: OptimalContext,
): OptimalRangeDTO | null {
  const resolved = resolveOptimalRange(markerKey, displayUnit, ctx.sex, ctx.age);
  if (resolved.status !== 'established') return null;

  return {
    low: resolved.low,
    high: resolved.high,
    unit: resolved.unit,
    source: resolved.source,
    within: isWithinOptimal(value, resolved.low, resolved.high),
  };
}
