import type { RangeCitation } from './publishedReferenceRanges.js';

/**
 * ===========================================================================
 *  AGE-BANDED REFERENCE RANGES. THE CAPABILITY IS HERE AND THE DATA IS NOT.
 * ===========================================================================
 *
 * `ReferenceRange` has carried `ageMin` and `ageMax` since the schema was
 * written, and `resolveReferenceRange()` already scores an age-bracketed row
 * above an unbounded one — so a chart that says "for a 63-year-old, this is the
 * range" needs no code at all, only rows. Fourteen analytes in the catalogue
 * have a reference interval that genuinely moves with age. **Zero of them carry
 * an age bracket**, so every one of the fourteen suggests a single adult-wide
 * band at the verify form, which for four of them is close to meaningless.
 *
 * ── HOW MANY ARE LOADED, AND WHY IT IS NONE ───────────────────────────────
 *
 * `AGE_BANDED_RANGES` IS EMPTY, and that is the finding rather than an
 * omission. The rule this file is written under is the same one the sex-
 * specific work was done under and it is not negotiable:
 *
 *     A reference range comes from the result, then from a named published
 *     document with a citation on the row. Never from a session's own
 *     knowledge, never from a plausible-looking number, never extrapolated
 *     from a related marker.
 *
 * Every document this repository holds has been checked against that rule and
 * none of them carries an age-banded interval:
 *
 *  · `src/modules/randox/specs/HSC5-Randox-Basic-Screen-Example-Report.pdf` is
 *    the only document in the tree with reference ranges in it at all. It
 *    prints ONE interval per analyte and does not say whose — not the age and
 *    not the sex. Adopting one of those as an age band would be inventing the
 *    bracket, which is the whole failure this rule exists to stop.
 *  · The NHS Lothian document behind `publishedReferenceRanges.ts` is
 *    sex-specific by its own title and excludes hormones. It says nothing about
 *    age.
 *  · There is NO API route to reference ranges, confirmed against the OpenAPI
 *    spec: `GetTests` returns id, name, code, stabilityTime, sampleTubes, cost
 *    and currency, and nothing else in the document returns an interval outside
 *    `GetOrderResultDetail`, which is per result. Nobody should go looking
 *    again.
 *
 * So the honest state is: fourteen analytes flagged, the mechanism built and
 * exercised, and a worksheet (`docs/audits/age-specific-ranges.md`) that names
 * what to ask for. Loading a partially-right set from memory would look like
 * progress and would be the one change here capable of doing harm — an
 * age-banded range is MORE specific than the blanket one, so the resolver would
 * prefer it, and a wrong specific answer beats a right general one every time.
 *
 * ── WHAT TO ASK RANDOX FOR ────────────────────────────────────────────────
 *
 * The Pathology Services Catalogue, which is already on the list for the
 * sex-specific gap and for every tier above Basic Screen. Ask explicitly for
 * the AGE BRACKETS as well as the sex splits, because a catalogue that prints
 * "adult" and nothing else does not close this.
 *
 * ── WHEN A SOURCE ARRIVES ─────────────────────────────────────────────────
 *
 * Add rows to `AGE_BANDED_RANGES` in exactly the shape below and the seed picks
 * them up — the loader (`seedAgeBandedReferenceRanges` in seed.ts) is written,
 * tested and runs on every seed today; with an empty list it writes nothing and
 * says so. Each row carries its printed form, its stored form, the conversion
 * between them as data where they differ, and the citation. The test asserts
 * the arithmetic AND the literal expected numbers separately, for the reason
 * recorded in publishedReferenceRanges.ts: a wrong conversion factor produces a
 * correctly formatted number in the right column that is out by a thousand.
 */

export interface AgeBandedRange {
  markerKey: string;
  /** Null means "any", which is the blanket band an age bracket sits inside. */
  sex: 'MALE' | 'FEMALE' | null;
  /** Inclusive lower bound of the bracket, in whole years. Null is "from birth". */
  ageMin: number | null;
  /** Inclusive upper bound, in whole years. Null is "and above". */
  ageMax: number | null;
  /** Exactly as the source document prints it, before anything is done to it. */
  printed: { low: number; high: number; unit: string };
  /** Null where the printed unit is already ours. */
  conversion: { factor: number; why: string } | null;
  /** What is written to the row. */
  stored: { low: number; high: number; unit: string };
  citation: RangeCitation;
  note?: string;
}

/**
 * EMPTY ON PURPOSE. See the header. This is not a stub waiting to be filled in
 * from memory — it is waiting for a document.
 */
export const AGE_BANDED_RANGES: AgeBandedRange[] = [];

/** How badly an adult-wide band serves this analyte. Ordered worst first in the worksheet. */
export type AgeBandSeverity = 'UNUSABLE' | 'MISLEADING' | 'IMPRECISE';

export interface AwaitingAgeBand {
  markerKey: string;
  name: string;
  severity: AgeBandSeverity;
  /** What the age dependence actually is, positionally. Never a number we do not have a source for. */
  why: string;
}

/**
 * THE FOURTEEN, AND WHAT AN ADULT-WIDE BAND COSTS EACH OF THEM.
 *
 * These are FLAGS, not ranges. Saying "this analyte's interval moves with age"
 * is a statement about which question to ask; saying "the interval for a
 * 65-year-old is 40 to 130" is an answer, and answers need a document. Nothing
 * in this list is or becomes a number.
 *
 * FOUR OF THEM ARE CALLED OUT AS UNUSABLE, and they are the ones where a single
 * adult band is not merely imprecise but close to meaningless: ALP, IGF-1,
 * Total PSA and DHEAS. In each case the interval does not shift a little with
 * age, it moves by a multiple across adult life — so one band either flags
 * healthy younger patients or fails to flag genuinely raised older ones, and it
 * does the second one silently.
 */
export const AWAITING_AGE_BAND: AwaitingAgeBand[] = [
  {
    markerKey: 'alp',
    name: 'Alkaline Phosphatase (ALP)',
    severity: 'UNUSABLE',
    why:
      'Bone growth is a large part of circulating ALP, so the interval is far higher through adolescence, falls to an adult plateau, and rises again in later life. A single adult-wide band spans none of those states well. It is also the analyte most often raised for a reason worth finding, which is exactly when a band that is wrong for the patient’s age matters.',
  },
  {
    markerKey: 'igf-1',
    name: 'Insulin Like Growth Factor 1 (IGF-1)',
    severity: 'UNUSABLE',
    why:
      'IGF-1 falls steadily and steeply across adult life — it is the analyte whose reference interval is most routinely quoted per decade rather than for adults as a group. An adult-wide band is not a usable comparison for either end of that range, and this marker is reported precisely because somebody wants to place a patient against their own age group.',
  },
  {
    markerKey: 'total-psa',
    name: 'Total PSA',
    severity: 'UNUSABLE',
    why:
      'PSA rises with age in men with no prostate disease, and age-specific thresholds are the ordinary clinical practice rather than a refinement of it. One adult band over-refers younger men and under-refers older ones; the second of those is the failure that does not announce itself.',
  },
  {
    markerKey: 'dhea-s',
    name: 'DHEAS',
    severity: 'UNUSABLE',
    why:
      'DHEAS peaks in early adulthood and declines markedly thereafter, which is the single largest age effect of any analyte in this catalogue. It is also on the WITHHELD list for the sex-specific work (the source excludes hormones), so it currently has neither split.',
  },
  {
    markerKey: 'fsh',
    name: 'Follicle Stimulating Hormone (FSH)',
    severity: 'MISLEADING',
    why:
      'The interval changes at menopause rather than gradually, so for women it is age-related in a step rather than a slope. A single band cannot express a step and reads as one continuous population.',
  },
  {
    markerKey: 'lh',
    name: 'Luteinising Hormone',
    severity: 'MISLEADING',
    why: 'Same step change at menopause as FSH, and the two are read together.',
  },
  {
    markerKey: 'oestradiol',
    name: 'Oestradiol',
    severity: 'MISLEADING',
    why:
      'Falls at menopause and is cycle-dependent before it, so a single adult band is a range that applies to nobody in particular. Also on the sex-specific WITHHELD list.',
  },
  {
    markerKey: 'amh',
    name: 'Anti-Mullerian Hormone (AMH)',
    severity: 'MISLEADING',
    why:
      'AMH declines with age throughout adult life and is reported almost exclusively to place somebody against their own age group. A band without one answers a different question from the one being asked.',
  },
  {
    markerKey: 'testosterone',
    name: 'Testosterone',
    severity: 'MISLEADING',
    why: 'Declines gradually through adult life in men. Also on the sex-specific WITHHELD list, so it currently has neither split.',
  },
  {
    markerKey: 'shbg',
    name: 'Sex Hormone Binding Globulin (SHBG)',
    severity: 'MISLEADING',
    why:
      'Rises with age, which partly offsets the testosterone decline — so an age-blind SHBG and an age-blind testosterone are wrong in opposite directions, and the free androgen index derived from both inherits whatever they get.',
  },
  {
    markerKey: 'creatinine',
    name: 'Creatinine',
    severity: 'IMPRECISE',
    why:
      'Tracks muscle mass, which falls with age, so an older patient sits lower for the same kidney function. It DOES now carry a sex split from NHS Lothian, which is the larger of the two effects; the age effect is on top of that.',
  },
  {
    markerKey: 'egfr',
    name: 'eGFR',
    severity: 'IMPRECISE',
    why:
      'Age is already INSIDE the calculation, so the reported value is age-adjusted before it reaches us — but the interval it is compared against is not, and normal eGFR declines with age regardless. This one needs the least urgent attention of the fourteen and is on the list so nobody re-derives that reasoning.',
  },
  {
    markerKey: 'tsh',
    name: 'TSH',
    severity: 'IMPRECISE',
    why:
      'The upper limit of the population interval rises with age, so older patients are flagged as subclinically raised against a younger population’s ceiling. The effect is smaller than the four above and lands on a very large number of patients.',
  },
  {
    markerKey: 'haemoglobin',
    name: 'Haemoglobin',
    severity: 'IMPRECISE',
    why:
      'The interval differs in later life as well as by sex. The sex split is loaded (NHS Lothian); the age effect on top of it is not, and anaemia in older patients is exactly where the difference is read.',
  },
];

/** The sentence written into `ReferenceRange.source` for a loaded age-banded row. */
export function ageBandedRangeSource(range: AgeBandedRange): string {
  const bracket =
    range.ageMin === null && range.ageMax === null
      ? 'all ages'
      : range.ageMin === null
        ? `up to ${range.ageMax}`
        : range.ageMax === null
          ? `${range.ageMin} and over`
          : `${range.ageMin}–${range.ageMax}`;
  const who = range.sex === null ? '' : `${range.sex === 'MALE' ? 'Male' : 'Female'}, `;
  const cited = `${range.citation.publisher}, "${range.citation.document}", ${range.citation.date}`;
  const converted = range.conversion
    ? ` Converted from ${range.printed.low}–${range.printed.high} ${range.printed.unit} (×${range.conversion.factor}): ${range.conversion.why}`
    : '';
  return (
    `${who}age ${bracket}: ${range.stored.low}–${range.stored.high} ${range.stored.unit}. ` +
    `Source: ${cited}. NOT a Randox range — replaced when the Pathology Services Catalogue arrives.${converted}` +
    (range.note ? ` ${range.note}` : '')
  );
}
