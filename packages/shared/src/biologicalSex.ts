/**
 * Biological sex — the value set, and how it maps onto Randox's.
 *
 * This is not our vocabulary to invent. Randox's Nexus API publishes its own
 * reference list at `GET /BiologicalSex/GetBiologicalSex`, and
 * `CreatePendingOrder` requires a `BiologicalSexId` drawn from it — an order
 * without one is rejected outright. Their list is two entries:
 *
 *     [{ "id": "1", "name": "Male" }, { "id": "2", "name": "Female" }]
 *
 * So our stored `Sex` enum has to map onto those ids exactly, and this file is
 * the single place that mapping lives. If Randox ever extends the list, this
 * is the one file that changes and the one place to check against a fresh
 * GetBiologicalSex response.
 *
 * Note what is deliberately NOT here: `ANY`. That's a property of a reference
 * *range* ("this range applies regardless of sex"), never of a person, and it
 * has no Randox id because it is not something you can order a test as. A
 * patient's sex is MALE, FEMALE, or not recorded — and "not recorded" is a
 * real, supported state everywhere downstream (see resolveReferenceRange).
 */

/** The only values that may be stored against a patient. */
export const PATIENT_BIOLOGICAL_SEXES = ['MALE', 'FEMALE'] as const;
export type PatientBiologicalSex = (typeof PATIENT_BIOLOGICAL_SEXES)[number];

/**
 * Randox `BiologicalSexId`, verbatim from their reference list. Their ids are
 * strings in the GetBiologicalSex response but an integer in the
 * CreatePendingOrder request body — integers here, since ordering is the only
 * thing that consumes them.
 */
export const RANDOX_BIOLOGICAL_SEX_ID: Record<PatientBiologicalSex, number> = {
  MALE: 1,
  FEMALE: 2,
};

/** Their wording, for anywhere we echo the value back at their API or a lab form. */
export const RANDOX_BIOLOGICAL_SEX_NAME: Record<PatientBiologicalSex, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
};

export function isPatientBiologicalSex(value: unknown): value is PatientBiologicalSex {
  return typeof value === 'string' && (PATIENT_BIOLOGICAL_SEXES as readonly string[]).includes(value);
}

/**
 * Null in, null out — an account with no sex recorded genuinely cannot be
 * turned into a Randox order, and the honest response to that is to stop and
 * ask the patient, not to guess a default. Every caller has to handle null.
 */
export function toRandoxBiologicalSexId(sex: string | null | undefined): number | null {
  return isPatientBiologicalSex(sex) ? RANDOX_BIOLOGICAL_SEX_ID[sex] : null;
}

/** How the portal says it to a patient. */
export function biologicalSexLabel(sex: string | null | undefined): string {
  if (sex === 'MALE') return 'Male';
  if (sex === 'FEMALE') return 'Female';
  return 'Not recorded';
}

/**
 * The one explanation of why we ask, reused verbatim on every screen that
 * asks — registration, the account page, and the booking gate. Three
 * different phrasings of the same clinical reason would read as three
 * different reasons.
 *
 * SHORTENED (Aug 2026), and the cut is the examples. It used to name ferritin
 * and haemoglobin, which is a fact about which analytes are sex-dependent
 * offered to somebody who has not yet had a blood test — two marker names to
 * carry no decision, in a sentence that had to fit under a form field. It is
 * the same reason in half the words; the account page, where a patient reads
 * this having actually seen some results, has room for the fuller version if
 * one is ever wanted and does not have it yet.
 */
export const BIOLOGICAL_SEX_PURPOSE =
  'Some reference ranges differ for men and women, so this decides which range your results are read against.';
