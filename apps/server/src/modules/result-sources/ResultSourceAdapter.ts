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
}

export interface ParsedReport {
  sampleDate: string | null; // ISO date, if found in the document
  // Parsed off the report itself when present (e.g. a printed panel/profile
  // name) — left null otherwise. A report with no panel is still valid; see
  // packages/shared formatReportTitle().
  panelName?: string | null;
  rows: ParsedMarkerRow[];
  // 'api' marks structured data straight from RandoxApiAdapter — no OCR or
  // model guesswork involved, so it doesn't carry the same fallback concept
  // PDF extraction does.
  extractionMethod: 'llm' | 'regex' | 'api';
  // Set only when extractionMethod is 'regex' because the LLM path was
  // unavailable (no API key, request failed, timed out) — surfaced in the
  // admin UI so a degraded extraction is never mistaken for a clean one.
  fallbackReason?: string | null;
  // RandoxApiAdapter only: the practice's own patientId, as submitted to
  // Randox at order time and echoed back on the result — this is how an
  // inbound API result is matched to one of our accounts. Null/absent for
  // PDF and manual sources.
  externalPatientRef?: string | null;
  // RandoxApiAdapter only: Randox's key for the test profile/panel this
  // result belongs to, matched against Panel.key. Left null when Randox
  // doesn't report one we recognise — the report is still valid with no
  // panel (see formatReportTitle()).
  panelKey?: string | null;
  // RandoxApiAdapter only: true when Randox has indicated more markers for
  // this order are still pending (a partial report) — see
  // randoxIngestionService.ts, which merges later deliveries for the same
  // externalId into the same Report rather than creating duplicates.
  isPartial?: boolean;
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
 *  - RandoxApiAdapter (live now): Randox's direct results API. fetchResults()
 *    pulls one result by their externalId; normaliseReport() maps their JSON
 *    payload onto the same row shape as the other adapters. Driven by
 *    randoxIngestionService.ts on a schedule, never by the interactive
 *    PDF-upload flow — see that file for patient/marker mapping, dedupe,
 *    and how ingestion still stops short of the release gate.
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
