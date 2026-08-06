import { extractText, getDocumentProxy } from 'unpdf';
import { prisma } from '../../db/client.js';
import type { ResultSourceAdapter, ParsedMarkerRow, ParsedReport } from './ResultSourceAdapter.js';
import { NotImplementedError } from './ResultSourceAdapter.js';
import { llmExtractionAvailable, extractWithLlm, applySanityChecks, reconcileFlaggedRows } from './llmExtraction.js';

// Fallback path only now — normaliseReport() prefers LLM extraction
// (llmExtraction.ts) whenever ANTHROPIC_API_KEY is configured, since a
// single line-match regex silently fails on wrapped names, multi-page
// layouts, "< 5.0"-style ranges, and non-numeric results like "Not
// detected". This still runs whenever the LLM path is unavailable or
// errors, so it must keep working standalone. Matches lines shaped like:
// "Total Cholesterol  4.8  mmol/L  (0.0 - 5.0)" or "Ferritin 85 µg/L
// 30-400". Deliberately loose — this is assistive extraction only, never
// published without admin verification.
const ROW_PATTERN =
  /^([A-Za-zµ][A-Za-z0-9µ%()/\-.,'\s]*?)\s+([\d]+\.?\d*)\s*([A-Za-zµ%/^0-9]{0,15})\s*[[(]?\s*([\d]+\.?\d*)\s*(?:-|–|to)\s*([\d]+\.?\d*)\s*[\])]?\s*$/;

const DATE_PATTERNS = [
  /sample\s*date[:\s]+(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
  /collection\s*date[:\s]+(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
  /date\s*of\s*collection[:\s]+(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
];

function parseLooseDate(raw: string): string | null {
  const parts = raw.split(/[/\-.]/).map((p) => p.trim());
  if (parts.length !== 3) return null;
  const [d, m, yRaw] = parts;
  const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function extractSampleDate(text: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const parsed = parseLooseDate(match[1]);
      if (parsed) return parsed;
    }
  }
  return null;
}

function extractRows(text: string): ParsedMarkerRow[] {
  const rows: ParsedMarkerRow[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(ROW_PATTERN);
    if (!match) continue;

    const [, rawName, value, unit, low, high] = match;
    rows.push({
      rawName: rawName.trim(),
      value: Number(value),
      unit: unit.trim() || null,
      referenceLow: Number(low),
      referenceHigh: Number(high),
      rawLine: trimmed,
      sourceText: trimmed,
      // The regex path has no notion of confidence — a line either matches
      // the pattern or it doesn't. Sanity checks (unknown marker, implausible
      // unit/magnitude) still run on regex output the same as LLM output.
      confidence: null,
      flags: [],
    });
  }
  return rows;
}

/**
 * Live adapter for any PDF-based result source (uploaded by the admin —
 * both Randox's white-labelled report and Aspire's own in-house reports
 * arrive as PDFs, per practice confirmation). Extraction is assistive,
 * not authoritative — every row lands in the admin verify table for
 * correction before anything is saved as a real result (see
 * modules/reports/service.ts). Which Source a given upload belongs to is
 * data the admin selects, not something this class knows about.
 */
export class PdfUploadAdapter implements ResultSourceAdapter {
  async fetchResults(): Promise<Buffer> {
    throw new NotImplementedError('PdfUploadAdapter.fetchResults (admin uploads the PDF directly instead)');
  }

  async normaliseReport(pdfBuffer: Buffer): Promise<ParsedReport> {
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
    const { text } = await extractText(pdf, { mergePages: true });

    if (!llmExtractionAvailable()) {
      return {
        sampleDate: extractSampleDate(text),
        panelName: null,
        rows: extractRows(text),
        extractionMethod: 'regex',
        fallbackReason: 'AI extraction is not configured (ANTHROPIC_API_KEY unset) — using pattern-based extraction.',
      };
    }

    try {
      const llmResult = await extractWithLlm(text);
      const catalogueMarkers = await prisma.marker.findMany({
        where: { isActive: true },
        select: { id: true, key: true, name: true, defaultUnit: true },
      });
      let rows = applySanityChecks(llmResult.rows, catalogueMarkers);
      // Two-pass only for rows a sanity check actually flagged — every
      // extraction re-reading the whole report twice regardless of quality
      // would double cost and latency for no benefit on clean rows.
      rows = await reconcileFlaggedRows(text, rows);

      return {
        sampleDate: llmResult.sampleDate ?? extractSampleDate(text),
        panelName: llmResult.panelName,
        rows,
        extractionMethod: 'llm',
      };
    } catch (e) {
      // An LLM failure (API down, malformed response, rate limit) must
      // never block extraction entirely — fall back to the regex path and
      // say so in the UI, rather than silently returning nothing.
      return {
        sampleDate: extractSampleDate(text),
        panelName: null,
        rows: extractRows(text),
        extractionMethod: 'regex',
        fallbackReason: `AI extraction failed (${e instanceof Error ? e.message : 'unknown error'}) — using pattern-based extraction.`,
      };
    }
  }

  async listPanels(): Promise<{ key: string; name: string }[]> {
    const panels = await prisma.panel.findMany({ where: { isActive: true }, select: { key: true, name: true } });
    return panels;
  }
}
