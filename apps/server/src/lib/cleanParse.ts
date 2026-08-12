/**
 * ============================================================================
 *  WHAT "A CLEAN PARSE" MEANS. THIS DEFINITION IS LOAD-BEARING.
 * ============================================================================
 *
 * With the admin verification stage removed, a clean parse goes straight to
 * awaiting clinician review — so anything this function lets through reaches a
 * clinician who has no way to know something is missing from it. That is the
 * whole of the risk in the single-gate pipeline, and it lives here rather than
 * being spread across the ingestion path as a handful of `if`s.
 *
 * The conditions are a CLOSED LIST, and every one of them is a fact about the
 * delivery rather than a judgement about the patient:
 *
 *   1. UNMAPPED ANALYTE. Every row the laboratory sent resolved to a marker in
 *      our catalogue. An analyte we could not identify is recorded as an
 *      exclusion so nothing is lost — but a report that advanced with a result
 *      silently missing from it puts a clinician in front of an incomplete panel
 *      with nothing saying so. The analyte map is unverified against a real
 *      Randox payload (CLAUDE.md), so this is the condition that fires most.
 *   2. UNFILED ROW. Every row that matched a marker was actually written as a
 *      result. A row that matched but could not be filed — no usable two-sided
 *      reference range, a value nothing could be made of, a duplicate marker on
 *      one report — is the same hole as (1) arrived at differently.
 *   3. UNRECOGNISED CODE. Every void or caveat code on the delivery was in the
 *      configured code map. An unrecognised code is already treated as VOID and
 *      the result withheld, which is the safe default — and it means a test the
 *      patient paid for is absent for a reason nobody has read yet. The real
 *      code list is still not available from Randox, so this is not theoretical.
 *   4. LAB DISAGREEMENT. The laboratory's own high/low indicator agreed with the
 *      status we computed from the value and the range, on every row. A
 *      disagreement usually means the range we parsed is not the range the lab
 *      applied, and quietly preferring either answer hides that.
 *   5. PARTIAL DELIVERY. The laboratory has finished reporting the order.
 *      Reviewing half a panel and releasing it shows the patient a report that
 *      is about to change underneath them.
 *
 * Anything on that list HOLDS the report: it stays at PARSED with these
 * sentences on it, it appears in the exception queue, and the clinician review
 * screen leads with them. Nothing is discarded and nothing is a failure — a held
 * report is a report with a question attached.
 *
 * Anything NOT on that list is not a hold, and the two deliberate exclusions are
 * worth stating. A result the LABORATORY withheld under a recognised void code is
 * not a hold: that report is complete as far as anyone here can make it, and the
 * exclusion is on the record. Nor is an out-of-range result — a significantly
 * raised marker is a clinical finding, which is exactly what the clinician is
 * being asked to look at, and holding on it would make the queue meaningless.
 */

export interface ParseCleanlinessInput {
  /** Rows the laboratory sent that no marker in the catalogue answered to. */
  unmappedAnalytes: string[];
  /** Rows that matched a marker but could not be written as a result, and why. */
  unfiledRows: { markerName: string; reason: string }[];
  /** Void or caveat codes on this delivery that were not in the configured map. */
  unrecognisedCodes: string[];
  /** Rows where the lab's own high/low flag contradicts our computed status. */
  labDisagreementCount: number;
  /** True when the laboratory has not finished reporting this order. */
  isPartial: boolean;
}

/** The five conditions, named, so a caller can talk about one without re-deriving it. */
export type HoldCondition =
  | 'UNMAPPED_ANALYTE'
  | 'UNFILED_ROW'
  | 'UNRECOGNISED_CODE'
  | 'LAB_DISAGREEMENT'
  | 'PARTIAL_DELIVERY';

export interface ParseCleanliness {
  /** True exactly when `holds` is empty. A clean parse awaits clinician review. */
  clean: boolean;
  /** Which conditions fired, for counting and filtering. */
  conditions: HoldCondition[];
  /**
   * Why it is held, in sentences a clinician reads. Written for the person who
   * has to decide what to do about it, so each one says what is missing and how
   * many of them there are — never a code or a field name.
   */
  holdReasons: string[];
}

/** At most five names in a sentence, so a 40-row delivery does not produce a paragraph. */
function list(names: string[]): string {
  const unique = [...new Set(names)];
  const shown = unique.slice(0, 5).join(', ');
  return unique.length > 5 ? `${shown}, …` : shown;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function assessParseCleanliness(input: ParseCleanlinessInput): ParseCleanliness {
  const conditions: HoldCondition[] = [];
  const holdReasons: string[] = [];

  if (input.unmappedAnalytes.length > 0) {
    conditions.push('UNMAPPED_ANALYTE');
    const n = new Set(input.unmappedAnalytes).size;
    holdReasons.push(
      `${n} ${plural(n, 'result', 'results')} could not be matched to a marker in our catalogue ` +
        `(${list(input.unmappedAnalytes)}). ${plural(n, 'It is', 'They are')} recorded but not on the report, ` +
        `so the panel a patient would see is incomplete.`,
    );
  }

  if (input.unfiledRows.length > 0) {
    conditions.push('UNFILED_ROW');
    const n = input.unfiledRows.length;
    holdReasons.push(
      `${n} ${plural(n, 'result', 'results')} matched a marker but could not be filed ` +
        `(${list(input.unfiledRows.map((r) => r.markerName))}).`,
    );
  }

  if (input.unrecognisedCodes.length > 0) {
    conditions.push('UNRECOGNISED_CODE');
    const n = new Set(input.unrecognisedCodes).size;
    holdReasons.push(
      `${n} ${plural(n, 'code', 'codes')} on this delivery ${plural(n, 'is', 'are')} not in our code map ` +
        `(${list(input.unrecognisedCodes)}), so the ${plural(n, 'result', 'results')} ${plural(n, 'it', 'they')} ` +
        `${plural(n, 'applies', 'apply')} to ${plural(n, 'has', 'have')} been withheld as a precaution.`,
    );
  }

  if (input.labDisagreementCount > 0) {
    const n = input.labDisagreementCount;
    conditions.push('LAB_DISAGREEMENT');
    holdReasons.push(
      `${n} ${plural(n, 'result', 'results')} where the laboratory’s own high/low flag disagrees with the ` +
        `reference range they sent, which usually means the range on the report is not the range they applied.`,
    );
  }

  if (input.isPartial) {
    conditions.push('PARTIAL_DELIVERY');
    holdReasons.push('The laboratory has not finished reporting this order, so more results are still to come.');
  }

  return { clean: holdReasons.length === 0, conditions, holdReasons };
}

/** The database fields a hold assessment writes. One shape, so no caller invents its own. */
export function holdFieldsFor(assessment: ParseCleanliness, now = new Date()) {
  return {
    holdReasons: assessment.holdReasons,
    // Null exactly when there are no holds, which is the invariant the exception
    // queue's "oldest first" sort relies on.
    heldAt: assessment.clean ? null : now,
    // A NEW hold retracts any previous acknowledgement. Otherwise a clinician
    // who acknowledged one problem would have silently pre-cleared the next
    // delivery's, which is the acknowledgement meaning something it never said.
    holdsAcknowledgedAt: null,
    holdsAcknowledgedById: null,
  };
}
