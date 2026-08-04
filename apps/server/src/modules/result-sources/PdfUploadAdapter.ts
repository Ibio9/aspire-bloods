import { extractText, getDocumentProxy } from 'unpdf';
import { prisma } from '../../db/client.js';
import type { ResultSourceAdapter, ParsedMarkerRow, ParsedReport } from './ResultSourceAdapter.js';
import { NotImplementedError } from './ResultSourceAdapter.js';

// Matches lines shaped like: "Total Cholesterol  4.8  mmol/L  (0.0 - 5.0)"
// or "Ferritin 85 µg/L 30-400". Deliberately loose — this is assistive
// extraction only, never published without admin verification. Format-
// agnostic: this pattern doesn't assume Randox's layout specifically, so
// the same adapter serves any PDF-based source (Randox or Aspire's own
// in-house reports) — the admin picks the actual Source at upload time.
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
