/**
 * Resolves the best-matching reference range from a marker's catalogue
 * (ReferenceRange rows, admin-managed under Content & configuration) for a
 * given patient's sex and age. Pure convenience for pre-filling the verify /
 * manual-entry forms — the admin can always override it, and the value that
 * actually gets saved on a report always comes from what they confirm at
 * verify time (see reports/service.ts verifyReport), never from this
 * catalogue directly. That's what keeps "reference ranges read from the
 * result, not the marker" true even though the marker-level catalogue now
 * feeds a suggestion into that result.
 */
export interface CatalogRange {
  id: string;
  sex: 'MALE' | 'FEMALE' | 'ANY';
  ageMin: number | null;
  ageMax: number | null;
  unit: string;
  low: number;
  high: number;
}

export type PatientSex = 'MALE' | 'FEMALE' | 'ANY' | null;

function ageMatches(r: CatalogRange, age: number | null): boolean {
  if (r.ageMin != null && (age == null || age < r.ageMin)) return false;
  if (r.ageMax != null && (age == null || age > r.ageMax)) return false;
  return true;
}

// More specific ranges (sex-specific, age-bracketed) win over ANY/unbounded
// ones when more than one candidate matches — e.g. a MALE 18-39 bracket
// beats a blanket ANY range for a 30-year-old male patient.
function specificity(r: CatalogRange): number {
  let score = 0;
  if (r.sex !== 'ANY') score += 2;
  if (r.ageMin != null || r.ageMax != null) score += 1;
  return score;
}

export function resolveReferenceRange(
  ranges: CatalogRange[],
  patientSex: PatientSex,
  age: number | null,
): CatalogRange | null {
  const candidates = ranges.filter((r) => (r.sex === 'ANY' || r.sex === patientSex) && ageMatches(r, age));
  if (candidates.length === 0) return null;
  return candidates.slice().sort((a, b) => specificity(b) - specificity(a))[0];
}

/** Whole-years age as of today, from an ISO (YYYY-MM-DD or full datetime) date-of-birth string. */
export function ageFromDob(dob: string, now: Date = new Date()): number | null {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}
