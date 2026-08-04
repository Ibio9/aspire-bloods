export interface ParsedMarkerRow {
  rawName: string;
  value: number | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  rawLine: string;
}

export interface ParsedReport {
  sampleDate: string | null; // ISO date, if found in the document
  rows: ParsedMarkerRow[];
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
 *  - RandoxApiAdapter (scaffold only): Randox's API requires a one-off
 *    £5,000 activation payment that hasn't happened — every method throws
 *    NotImplemented until it's switched on via LAB_ADAPTER env config.
 */
export interface ResultSourceAdapter {
  fetchResults(externalId: string): Promise<Buffer>;
  normaliseReport(pdfBuffer: Buffer): Promise<ParsedReport>;
  listPanels(): Promise<{ key: string; name: string }[]>;
}

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented — RandoxApiAdapter is a scaffold pending Randox API activation`);
  }
}
