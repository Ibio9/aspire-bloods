export interface ParsedMarkerRow {
  rawName: string;
  value: number | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  rawLine: string;
  // A non-numeric result ("Not detected", "Reactive", …) — set instead of
  // value for qualitative markers. Never both.
  resultText: string | null;
  // True whenever the parser extracted something but isn't confident
  // enough to treat it as ready-to-save — a single-sided threshold whose
  // direction can't be inferred from text alone, a qualitative result, a
  // row split across a page break, etc. The admin verify table must
  // surface this rather than silently accepting a guessed range.
  needsReview: boolean;
  reviewReason: string | null;
  // The exact text the extractor read this row from — shown verbatim in the
  // admin verify table so the admin sees what was read, not just what was
  // concluded. Regex extraction: same as rawLine. LLM extraction: the
  // model's own quote of the source text for this row.
  sourceText?: string;
  // 0–1, LLM extraction only. Capped low whenever a sanity check fails —
  // never purely the model's self-reported confidence (see llmExtraction.ts
  // applySanityChecks). Null for regex extraction, which has no notion of
  // confidence — every row is either matched by the pattern or not present.
  confidence?: number | null;
  // Machine-readable reasons this row needs a closer look, e.g.
  // 'unknown_marker', 'implausible_unit', 'value_order_of_magnitude',
  // 'two_pass_disagreement'. Never used to silently drop or auto-accept a
  // row — only to flag it in the verify table. Empty for a clean row.
  flags?: string[];

  // --- Lab API sources only -------------------------------------------------

  // Caveat codes carried on this result. A caveat qualifies a result that IS
  // reportable; anything that makes a result unreportable is a void and
  // never reaches a row at all (see ParsedExclusion).
  caveatCodes?: string[];

  // The lab's own out-of-range indicator, verbatim (Randox: `lowHigh`).
  // Advisory only — we compute our own status from the value and the range.
  labStatusIndicator?: string | null;

  // True when the lab's indicator and our own computed status disagree.
  // Neither is silently preferred: the value and range are stored as the lab
  // sent them, our status is computed as usual, and the disagreement is
  // raised for an admin. A mismatch usually means the range we parsed isn't
  // the range the lab actually applied.
  labStatusDisagrees?: boolean;

  // Randox's grouping for this analyte ("Full Blood Count", "Heart Health")
  // and its patient-facing name, both straight off the result.
  group?: string | null;
  displayName?: string | null;
  sampleType?: string | null;

  // The reference bounds exactly as the lab sent them, before parsing.
  // Randox type these as strings and genuinely use "<5.0" / "≥60" / "" for
  // one-sided and absent ranges, so the parsed numbers are lossy and the
  // originals are what an admin needs to see when a range looks wrong.
  referenceLowRaw?: string | null;
  referenceHighRaw?: string | null;
}

export interface ParsedReport {
  sampleDate: string | null; // ISO date, if found in the document
  // Parsed off the report itself when present (e.g. a printed panel/profile
  // name) — left null otherwise. A report with no panel is still valid; see
  // packages/shared formatReportTitle().
  panelName?: string | null;
  rows: ParsedMarkerRow[];
  // 'api' marks structured data straight from a lab API — no OCR or model
  // guesswork involved, so it doesn't carry the same fallback concept PDF
  // extraction does.
  extractionMethod: 'llm' | 'regex' | 'api';
  // Set only when extractionMethod is 'regex' because the LLM path was
  // unavailable (no API key, request failed, timed out) — surfaced in the
  // admin UI so a degraded extraction is never mistaken for a clean one.
  fallbackReason?: string | null;
  // API sources only: the practice's own patientId, as submitted to the lab
  // at order time and echoed back on the result — this is how an inbound
  // API result is matched to one of our accounts. Null/absent for PDF and
  // manual sources.
  externalPatientRef?: string | null;
  // Who the LAB says this result belongs to, verbatim. Never used to match
  // automatically — matching on a name is exactly the mistake that puts one
  // person's results in front of another. It exists so that when
  // externalPatientRef doesn't resolve (which, now that patients register
  // themselves, is the common case rather than the exception) an admin has
  // something concrete to compare against instead of an opaque reference.
  // See modules/admin/linkingService.ts for what is and isn't allowed to
  // count as agreement.
  claimedPatient?: {
    firstName?: string | null;
    lastName?: string | null;
    /** ISO date. The field that has to agree before any link is permitted. */
    dob?: string | null;
    contactNumber?: string | null;
  } | null;
  // API sources only: the lab's key for the test profile/panel this result
  // belongs to, matched against Panel.key. Left null when the lab doesn't
  // report one we recognise — the report is still valid with no panel (see
  // formatReportTitle()).
  panelKey?: string | null;
  // API sources only: true when more markers for this order are still
  // pending (a partial report).
  isPartial?: boolean;

  // Markers the lab could not report at all. Deliberately NOT rows: a row
  // becomes a ReportResult, and a voided result must never have one. Carried
  // here so the same shape survives a trip through the unmatched queue —
  // an admin linking a parked result gets the same void handling the
  // automated path would have applied. See modules/randox/codes.ts.
  exclusions?: ParsedExclusion[];

  // Randox only: patient measurements taken at collection (height, BP,
  // smoker, …). Stored against the report; no UI yet.
  measurements?: ParsedMeasurements | null;
}

export interface ParsedExclusion {
  rawName: string;
  /** The lab code that caused it, when there was one. */
  code: string | null;
  /** False when the code wasn't in our configured map — see codes.ts. */
  codeRecognised: boolean;
  /** Admin-facing reason. Never shown to a patient. */
  reason: string;
}

/**
 * Measurements Randox return alongside results (GetOrderResultDetail).
 * Every field is optional: which are present depends on what the clinic
 * recorded at collection, and none is required to report a result.
 */
export interface ParsedMeasurements {
  heightCm?: number | null;
  weightKg?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  pulseBpm?: number | null;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  isDiabetic?: boolean | null;
  isSmoker?: boolean | null;
  knownVascularDisease?: boolean | null;
  onMedicationForHypertension?: boolean | null;
  ethnicity?: string | null;
  /**
   * Biological sex as the LAB recorded it against this sample. Normalised to
   * our own enum, or null when the source didn't report one — never guessed.
   * Used only as a fallback for resolving optimal ranges where the patient's
   * account carries no sex (see lib/optimalRange.ts); it never overrides the
   * account value and it never affects a marker's status.
   */
  biologicalSex?: 'MALE' | 'FEMALE' | null;
}

/**
 * Phase 2 §2.6: renamed from LabAdapter — the portal has more than one
 * result source now (Randox, Aspire's own in-house testing, and hand-
 * entered values), so "lab" was the wrong word. Deliberately
 * source-agnostic: PdfUploadAdapter's extraction logic doesn't know or
 * care which Source produced the PDF it's given — that's just data
 * (the `sources` table, §2.2), selected by the admin at upload time, not
 * baked into which adapter class runs. Adding a genuinely new *shape* of
 * input (not just a new source of PDFs) is the only reason to add another
 * adapter class.
 *
 * Implementations:
 *  - PdfUploadAdapter (live now): admin uploads a PDF from any PDF-based
 *    source (Randox or Aspire in-house); normaliseReport() extracts rows
 *    for the admin verify table.
 *  - ManualEntryAdapter: no document at all — admin types values directly.
 *    normaliseReport()/fetchResults() aren't meaningful here; see
 *    modules/reports/manualEntryService.ts, which bypasses parsing
 *    entirely but still uses the same verify→review→release gate.
 *
 * Randox's own API is deliberately NOT one of these. It isn't a document to
 * extract rows from; it's an order lifecycle (place, book, poll, ingest)
 * with void codes, partial deliveries and redelivery semantics that this
 * interface has no place to express. It lives in modules/randox/ and joins
 * the normalised store directly, through the same release gate — see
 * modules/randox/ingestionService.ts.
 */
export interface ResultSourceAdapter {
  fetchResults(externalId: string): Promise<Buffer>;
  normaliseReport(pdfBuffer: Buffer): Promise<ParsedReport>;
  listPanels(): Promise<{ key: string; name: string }[]>;
}

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented`);
  }
}
