import { extractText, getDocumentProxy } from 'unpdf';
import { prisma } from '../../db/client.js';
import type { ResultSourceAdapter, ParsedMarkerRow, ParsedReport } from './ResultSourceAdapter.js';
import { NotImplementedError } from './ResultSourceAdapter.js';

const DATE_PATTERNS = [
  /date\s*of\s*sample\s*collection[:\s]+([\w/\-.]+)/i,
  /sample\s*date[:\s]+([\w/\-.]+)/i,
  /collection\s*date[:\s]+([\w/\-.]+)/i,
  /date\s*of\s*collection[:\s]+([\w/\-.]+)/i,
];

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

// Handles both "05/08/2026" (numeric) and "05-Aug-2026" (month name) —
// the redacted sample PDF this was built against uses the latter with
// placeholder text ("xx-xxx-xxxx"), which correctly fails to parse rather
// than producing a fake date.
function parseLooseDate(raw: string): string | null {
  const parts = raw.split(/[/\-.]/).map((p) => p.trim());
  if (parts.length !== 3) return null;
  const [d, m, yRaw] = parts;
  const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
  const month = /^\d+$/.test(m) ? m.padStart(2, '0') : MONTHS[m.toLowerCase().slice(0, 3)];
  if (!month) return null;
  const iso = `${y}-${month}-${d.padStart(2, '0')}`;
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

// Lines that carry no marker data but do show up interleaved with rows in
// the "Results for your Doctor" summary table: repeated per-page column
// headers and page footers.
const NON_DATA_LINE_PATTERNS = [
  /^test\s+result\s+units\s+reference\s+range$/i,
  /^page\s+\d+\s+of\s+\d+$/i,
  /^results?\s+for\s+your\s+doctor$/i,
];

// Panel-category subheadings Randox prints inline between groups of rows
// (e.g. "Heart Health") — structurally indistinguishable from a name-wrap
// continuation (both are bare no-digit lines immediately followed by a
// value line), so there's no way to tell them apart from layout alone.
// Confirmed against a real HSC5 Basic Screen report; other Randox panel
// types likely use category names not in this list — an unrecognised
// category heading would silently get glued onto the next marker's name,
// which is why matchMarker.ts's fuzzy matching (not an exact-string
// requirement) is what actually keeps that from mattering: "Kidney Health
// Creatinine" still matches the "Creatinine" marker.
const KNOWN_CATEGORY_HEADINGS = new Set([
  'full blood count',
  'heart health',
  'diabetes health',
  'kidney health',
  'liver health',
  'hormone health',
  'thyroid health',
  'nutritional health',
  'vitamin health',
  'prostate health',
  'female health',
  'male health',
  'immune health',
  'bone health',
  'inflammation',
  'general health',
  'other',
]);

const QUALITATIVE_RESULTS = ['not detected', 'detected', 'reactive', 'non-reactive', 'nonreactive', 'positive', 'negative'];

// A line is "data-bearing" if it contains an ASCII digit — every real row
// has a numeric value or a numeric threshold somewhere on it. Section
// subheadings ("Kidney Health") and name-wrap continuations ("Estimated
// Glomerular Filtration") never do, which is also how those get told apart
// from an actual row below.
function hasDigit(line: string): boolean {
  return /\d/.test(line);
}

// A line that's ONLY a second threshold/verdict with no leading marker name
// — e.g. "≥5.0 High" following "Total Cholesterol 5.85 mmol/l <5.0
// Desirable" on the line before. Two-sided definitions like this print
// across two physical lines in the source PDF; the second line qualifies
// the row already emitted from the first, it is never a row of its own.
const CONTINUATION_LINE = /^[<≤≥>]\s*[\d.]+\s+\S.*$/;

// Full two-sided range: "Haemoglobin 147 g/l 130.0 - 180.0 Optimal"
const FULL_RANGE_ROW = /^(.*?)\s+([\d.]+)\s+(\S+)\s+([\d.]+)\s*-\s*([\d.]+)\s+(.+)$/;

// Single-sided threshold: "Alanine Aminotransferase (ALT) 31 U/l <40 Normal"
const THRESHOLD_ROW = /^(.*?)\s+([\d.]+)\s+(\S+)\s+([<≤≥>])\s*([\d.]+)\s+(.+)$/;

// Name + value + unit with NOTHING else on the line — the three-tier
// Low/Optimal/High markers (e.g. MCH, MCV, RBC Count) print this way, with
// the actual reference range arriving two lines later as a bare
// PLAIN_RANGE_LINE (see below). "Mean Cell Haemoglobin (MCH) 32.8 pg".
const VALUE_UNIT_ONLY_ROW = /^(.*?)\s+([\d.]+)\s+(\S+)$/;

// A bare "Low - High Verdict" line with no name/value/unit prefix — the
// middle ("Optimal") tier of a three-tier definition, and the actual
// reference range for whatever VALUE_UNIT_ONLY_ROW line preceded it.
// "27.0 - 32.0 Optimal"
const PLAIN_RANGE_LINE = /^([\d.]+)\s*-\s*([\d.]+)\s+(.+)$/;

// Qualitative (non-numeric) result: "HIV Antibody Not Detected"
function buildQualitativeRow(match: RegExpMatchArray): ParsedMarkerRow | null {
  const [, rawName, resultText] = match;
  if (!rawName.trim()) return null;
  return {
    rawName: rawName.trim(),
    value: null,
    unit: null,
    referenceLow: null,
    referenceHigh: null,
    resultText,
    needsReview: true,
    reviewReason: 'Qualitative result — no numeric value or reference range to verify against.',
    rawLine: match[0],
  };
}

function qualitativeMatch(line: string): RegExpMatchArray | null {
  for (const word of QUALITATIVE_RESULTS) {
    const re = new RegExp(`^(.*?)\\s+(${word})\\s*$`, 'i');
    const m = line.match(re);
    if (m && m[1].trim()) return m;
  }
  return null;
}

function extractRows(text: string): ParsedMarkerRow[] {
  const rows: ParsedMarkerRow[] = [];
  let pendingNamePrefix = '';
  let inDoctorSection = false;

  // A VALUE_UNIT_ONLY_ROW line waiting to see whether a PLAIN_RANGE_LINE
  // follows (three-tier markers) before it's emitted one way or the other.
  let pendingBareRow: { rawName: string; value: number; unit: string; rawLine: string } | null = null;

  function flushPendingBareRow() {
    if (!pendingBareRow) return;
    rows.push({
      rawName: pendingBareRow.rawName,
      value: pendingBareRow.value,
      unit: pendingBareRow.unit,
      referenceLow: null,
      referenceHigh: null,
      resultText: null,
      needsReview: true,
      reviewReason: 'No reference range found on or after this line — enter the range manually.',
      rawLine: pendingBareRow.rawLine,
    });
    pendingBareRow = null;
  }

  const rawLines = text.split('\n').map((l) => l.trim());

  for (const line of rawLines) {
    if (!line) continue;

    if (/^results?\s+for\s+your\s+doctor$/i.test(line)) {
      inDoctorSection = true;
      pendingNamePrefix = '';
      continue;
    }
    if (!inDoctorSection) continue;

    if (NON_DATA_LINE_PATTERNS.some((p) => p.test(line))) {
      pendingNamePrefix = '';
      continue;
    }

    if (!hasDigit(line)) {
      flushPendingBareRow();
      if (KNOWN_CATEGORY_HEADINGS.has(line.toLowerCase())) {
        pendingNamePrefix = '';
        continue;
      }
      // A name-wrap continuation — buffered until the value-bearing line
      // that completes it arrives.
      pendingNamePrefix = pendingNamePrefix ? `${pendingNamePrefix} ${line}` : line;
      continue;
    }

    // Three-tier range: this line is the "Optimal" middle band, and the
    // real reference range for whatever bare name+value+unit line preceded
    // it (the surrounding "<X Low" / ">Y High" lines are handled by the
    // CONTINUATION_LINE branch below, on the way in and out).
    if (pendingBareRow) {
      const plainRange = line.match(PLAIN_RANGE_LINE);
      if (plainRange) {
        const [, low, high] = plainRange;
        rows.push({
          rawName: pendingBareRow.rawName,
          value: pendingBareRow.value,
          unit: pendingBareRow.unit,
          referenceLow: Number(low),
          referenceHigh: Number(high),
          resultText: null,
          needsReview: false,
          reviewReason: null,
          rawLine: `${pendingBareRow.rawLine} / ${line}`,
        });
        pendingBareRow = null;
        continue;
      }
      if (CONTINUATION_LINE.test(line)) {
        pendingBareRow.rawLine += ` / ${line}`;
        continue;
      }
      // Anything else means this bare row never got its range — flush it
      // as-is and fall through to process the current line fresh.
      flushPendingBareRow();
    }

    // A bare continuation line (second threshold of a two-line pair) —
    // fold it into the previously emitted row's rawLine for context and
    // move on; it never starts a new row.
    if (CONTINUATION_LINE.test(line) && !pendingNamePrefix && rows.length > 0) {
      rows[rows.length - 1].rawLine += ` / ${line}`;
      continue;
    }

    const qual = qualitativeMatch(line);
    if (qual) {
      const combinedName = pendingNamePrefix ? `${pendingNamePrefix} ${qual[1]}`.trim() : qual[1].trim();
      const row = buildQualitativeRow(qual);
      if (row) {
        row.rawName = combinedName;
        rows.push(row);
      }
      pendingNamePrefix = '';
      continue;
    }

    const fullRange = line.match(FULL_RANGE_ROW);
    if (fullRange) {
      const [, namePart, value, unit, low, high] = fullRange;
      const rawName = (pendingNamePrefix ? `${pendingNamePrefix} ${namePart}` : namePart).trim().replace(/\s+/g, ' ');
      rows.push({
        rawName,
        value: Number(value),
        unit,
        referenceLow: Number(low),
        referenceHigh: Number(high),
        resultText: null,
        needsReview: false,
        reviewReason: null,
        rawLine: line,
      });
      pendingNamePrefix = '';
      continue;
    }

    const threshold = line.match(THRESHOLD_ROW);
    if (threshold) {
      const [, namePart, value, unit, comparator, limit] = threshold;
      const rawName = (pendingNamePrefix ? `${pendingNamePrefix} ${namePart}` : namePart).trim().replace(/\s+/g, ' ');
      rows.push({
        rawName,
        value: Number(value),
        unit,
        referenceLow: null,
        referenceHigh: null,
        resultText: null,
        needsReview: true,
        reviewReason: `Single-sided threshold in source (${comparator}${limit}) — which side is the healthy range can't be inferred from text alone. Enter the full range manually.`,
        rawLine: line,
      });
      pendingNamePrefix = '';
      continue;
    }

    const bareRow = line.match(VALUE_UNIT_ONLY_ROW);
    if (bareRow) {
      const [, namePart, value, unit] = bareRow;
      const rawName = (pendingNamePrefix ? `${pendingNamePrefix} ${namePart}` : namePart).trim().replace(/\s+/g, ' ');
      pendingBareRow = { rawName, value: Number(value), unit, rawLine: line };
      pendingNamePrefix = '';
      continue;
    }

    // A digit-bearing line inside the section that matches neither shape —
    // don't guess, don't drop it silently either. Surface it so a human
    // notices instead of quietly losing a row.
    rows.push({
      rawName: (pendingNamePrefix ? `${pendingNamePrefix} ${line}` : line).trim(),
      value: null,
      unit: null,
      referenceLow: null,
      referenceHigh: null,
      resultText: null,
      needsReview: true,
      reviewReason: 'Unrecognised row shape — could not extract a value/unit/range. Enter this result manually.',
      rawLine: line,
    });
    pendingNamePrefix = '';
  }

  flushPendingBareRow();
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
 *
 * Deliberately targets ONLY the "Results for your Doctor" summary table
 * that Randox prints at the end of the report (confirmed against a real
 * HSC5 Basic Screen report, not a synthetic one) — it's the one section
 * that's both exhaustive (every marker on the report appears there once)
 * and consistently tabular. The earlier narrative pages repeat the same
 * markers in a much less regular, per-marker layout (unit/value/name/
 * range/verdict each on their own line, in a different order per marker
 * type) purely for patient readability; parsing those too would mean two
 * fragile extraction paths producing the same data, so this adapter
 * ignores them.
 */
export class PdfUploadAdapter implements ResultSourceAdapter {
  async fetchResults(): Promise<Buffer> {
    throw new NotImplementedError('PdfUploadAdapter.fetchResults (admin uploads the PDF directly instead)');
  }

  async normaliseReport(pdfBuffer: Buffer): Promise<ParsedReport> {
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return {
      sampleDate: extractSampleDate(text),
      rows: extractRows(text),
    };
  }

  async listPanels(): Promise<{ key: string; name: string }[]> {
    const panels = await prisma.panel.findMany({ where: { isActive: true }, select: { key: true, name: true } });
    return panels;
  }
}
