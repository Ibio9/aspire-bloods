/**
 * Resolves the best-matching reference range from a marker's catalogue
 * (ReferenceRange rows, seeded and managed over the panels API) for a
 * given patient's sex and age. Pure convenience for pre-filling the verify /
 * manual-entry forms — the admin can always override it, and the value that
 * actually gets saved on a report always comes from what they confirm at
 * verify time (see reports/service.ts verifyReport), never from this
 * catalogue directly. That's what keeps "reference ranges read from the
 * result, not the marker" true even though the marker-level catalogue now
 * feeds a suggestion into that result.
 *
 * The interesting case is a patient with no sex recorded. Sex is optional at
 * registration on purpose (registration stays frictionless), so this function
 * has to cope with it — and the one thing it must never do is quietly hand
 * back the ANY range as though it were the answer. A ferritin range for
 * "anyone" is not the range for a man and is not the range for a woman; if
 * the marker distinguishes them and we don't know which applies, the only
 * honest output is "unavailable, and here's why". Hence the result type: a
 * caller cannot read a range out of this without first passing a branch that
 * makes them acknowledge it might not be there.
 */
export interface CatalogRange {
  id: string;
  sex: 'MALE' | 'FEMALE' | 'ANY';
  ageMin: number | null;
  ageMax: number | null;
  unit: string;
  low: number;
  high: number;
  /**
   * WHAT KIND OF AUTHORITY IS BEHIND THIS NUMBER.
   *
   * It travels through so the verify form can SHOW it, which is the main
   * point: a suggestion that is usually correct is one people stop checking,
   * and the tier is what stops an unverified fallback looking identical to a
   * range from the laboratory that ran the test.
   *
   * It is also the TIE-BREAK, and only the tie-break — see specificity()
   * below. It never outranks a more specific row.
   */
  provenance?: RangeProvenance;
  citation?: RangeCitation | null;
}

export type RangeProvenance = 'RANDOX' | 'PUBLISHED' | 'UNSOURCED';

export interface RangeCitation {
  document: string | null;
  publisher: string | null;
  date: string | null;
  url: string | null;
}

/**
 * One sentence per tier, so the admin console and any API response say the
 * same thing. Written for somebody holding the paper result, which is why each
 * one ends in what to actually do.
 */
export const PROVENANCE_LABEL: Record<RangeProvenance, { label: string; detail: string }> = {
  RANDOX: {
    label: 'From Randox',
    detail: 'Transcribed from a Randox document. The laboratory that runs this assay, so it is the strongest source available. Still check it against the paper.',
  },
  PUBLISHED: {
    label: 'Published, not Randox',
    detail:
      'From a named third-party laboratory or guideline. Reference intervals are assay-specific, so this describes somebody else’s instrument and population. Treat it as a prompt, not an answer, and take the range off the paper.',
  },
  UNSOURCED: {
    label: 'Unverified',
    detail: 'A seeded standard adult band that no document has been checked against. Enter the range printed on the result.',
  },
};

export type PatientSex = 'MALE' | 'FEMALE' | 'ANY' | null;

export type RangeUnavailableReason =
  /** The marker has sex-specific ranges and we don't know the patient's sex. */
  | 'SEX_NOT_RECORDED'
  /** Nothing in the catalogue covers this patient at all (usually an age gap, or an empty catalogue). */
  | 'NO_MATCHING_RANGE';

export type ResolvedRange =
  | { status: 'resolved'; range: CatalogRange }
  | { status: 'unavailable'; reason: RangeUnavailableReason };

/** One phrasing per reason, so admin UI and API responses can't drift apart. */
export const RANGE_UNAVAILABLE_MESSAGE: Record<RangeUnavailableReason, string> = {
  SEX_NOT_RECORDED:
    "This marker’s reference range differs by sex, and this patient has no biological sex on file, so there is no range to suggest. Enter the range printed on the result, or ask the patient to add their sex to their account.",
  NO_MATCHING_RANGE:
    'No range in the catalogue covers this patient. Enter the range printed on the result.',
};

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

/**
 * THE TIE-BREAK, AND IT IS ONLY EVER A TIE-BREAK.
 *
 * Two rows of identical specificity is not a hypothetical: `ReferenceRange`
 * holds the catalogue AND one row per result ever materialised, so a marker
 * accumulates dozens of rows with the same sex and no age bracket. Until this
 * existed the winner among them was whatever order Postgres happened to
 * return — the range suggested at verify time was effectively arbitrary among
 * every range that marker had ever carried.
 *
 * Any deterministic rule beats that, and this is the one that is also right:
 * where two rows make the same claim about the same patient, prefer the one
 * with a source behind it. It CANNOT override specificity, because it is
 * applied second — an unsourced sex-specific band still beats a Randox `ANY`
 * one for a patient whose sex we know, and it should, since the wrong sex is a
 * bigger error than a weaker citation.
 *
 * A row with no provenance at all is treated as UNSOURCED, which is what it is.
 */
const PROVENANCE_RANK: Record<RangeProvenance, number> = { RANDOX: 2, PUBLISHED: 1, UNSOURCED: 0 };

function sourceRank(r: CatalogRange): number {
  return PROVENANCE_RANK[r.provenance ?? 'UNSOURCED'];
}

export function resolveReferenceRange(
  ranges: CatalogRange[],
  patientSex: PatientSex,
  age: number | null,
): ResolvedRange {
  const ageMatching = ranges.filter((r) => ageMatches(r, age));

  // Sex unknown, and this marker draws a distinction that depends on it.
  // Falling through to the ANY range here is the silent-wrong-answer this
  // whole function exists to avoid: it would read as a resolved range,
  // pre-fill the verify form, and be indistinguishable from a correct one.
  if (patientSex == null && ageMatching.some((r) => r.sex !== 'ANY')) {
    return { status: 'unavailable', reason: 'SEX_NOT_RECORDED' };
  }

  const candidates = ageMatching.filter((r) => r.sex === 'ANY' || r.sex === patientSex);
  if (candidates.length === 0) {
    return { status: 'unavailable', reason: 'NO_MATCHING_RANGE' };
  }

  return {
    status: 'resolved',
    range: candidates.slice().sort((a, b) => specificity(b) - specificity(a) || sourceRank(b) - sourceRank(a))[0],
  };
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
