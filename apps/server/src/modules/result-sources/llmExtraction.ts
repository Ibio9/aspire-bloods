import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { hasKnownConversion } from '../../lib/unitConversion.js';
import { findBestMarkerMatch } from '../reports/matchMarker.js';
import type { ParsedMarkerRow } from './ResultSourceAdapter.js';

export function llmExtractionAvailable(): boolean {
  return env.ANTHROPIC_API_KEY.length > 0;
}

let cachedClient: Anthropic | null = null;
function client(): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return cachedClient;
}

interface LlmRow {
  rawName: string;
  sourceText: string;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  confidence: number;
}

interface LlmExtractionResult {
  panelName: string | null;
  sampleDate: string | null;
  rows: LlmRow[];
}

const rowItemSchema = {
  type: 'object',
  properties: {
    rawName: { type: 'string' },
    sourceText: { type: 'string' },
    value: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    valueText: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    unit: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    referenceLow: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    referenceHigh: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    confidence: { type: 'number' },
  },
  required: ['rawName', 'sourceText', 'value', 'valueText', 'unit', 'referenceLow', 'referenceHigh', 'confidence'],
  additionalProperties: false,
};

const extractionResponseSchema = {
  type: 'object',
  properties: {
    panelName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    sampleDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    rows: { type: 'array', items: rowItemSchema },
  },
  required: ['panelName', 'sampleDate', 'rows'],
  additionalProperties: false,
};

// This is assistive extraction shown to an admin for correction, never
// auto-saved — see PdfUploadAdapter and reports/service.ts verifyReport().
// The prompt still asks for care because a wrong-but-plausible value (5.4
// read as 54) is far more dangerous than an obviously-failed extraction:
// the regex fallback fails loudly with zero rows, an LLM can fail quietly.
const EXTRACTION_SYSTEM_PROMPT = `You are extracting blood test results from a lab report's raw text for a clinical admin to verify. Every value you extract will be shown to a human before it is ever saved — your job is to read accurately and flag anything uncertain, not to guess.

For every marker/result row in the text, extract:
- rawName: the marker name as printed
- sourceText: the exact line(s) of source text this row came from, verbatim — this lets the admin check your reading against the original document.
- value: the numeric result, if the result is numeric. Pay extreme attention to decimal points — a misread decimal (4.5 vs 45) is a serious clinical error.
- valueText: if the result is NOT purely numeric (e.g. "Not detected", "Positive", "Trace"), put the full text here and leave value null. If a bound like "< 5.0" or "> 40" has a clear numeric reading, put the number in value AND the original text in valueText.
- unit: the unit as printed (e.g. mmol/L, µg/L, %) — null if none is printed.
- referenceLow / referenceHigh: the reference range printed alongside THIS result, if any — null if not present. For a one-sided range like "< 5.0" use referenceHigh only; for "> 40" use referenceLow only.
- confidence: your own confidence (0 to 1) that you read this row correctly — lower it for anything blurry, ambiguous, wrapped across lines, or where the layout is unclear.

Also extract:
- panelName: the name of the test panel/profile printed on the report (e.g. "Insight 360", "Advanced GP3"), if one is printed. Null if none is printed — do not guess one.
- sampleDate: the sample/collection date in ISO format (YYYY-MM-DD), if found. Null otherwise.

Extract every row you can find and let confidence reflect your certainty — do not skip a row because it looks unusual. Never invent a value that is not in the text.

Many lab reports print the same result twice — once in a narrative "explanation" section and again in a plain summary table near the end (often headed something like "Results for your Doctor"). When you recognise the same marker appearing more than once, extract it only ONCE, preferring the clearer/more complete printing (the summary table is usually cleaner). Do not return two rows for one result.`;

async function callExtraction(text: string, focusHint?: string): Promise<LlmExtractionResult> {
  const userContent = focusHint
    ? `${focusHint}\n\nFull report text follows:\n\n${text}`
    : text;

  const response = await client().messages.create({
    model: 'claude-opus-5',
    max_tokens: 8000,
    system: EXTRACTION_SYSTEM_PROMPT,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: extractionResponseSchema },
    },
    messages: [{ role: 'user', content: userContent.slice(0, 150000) }],
  });

  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!block) throw new Error('LLM extraction returned no text content');
  return JSON.parse(block.text) as LlmExtractionResult;
}

/**
 * Sanity checks applied after extraction (LLM or regex), catalogue-aware.
 * Never used to silently drop or "fix" a row — only to flag it so the
 * admin sees a warning in the verify table. Mirrors the spirit of
 * manualEntryService's findImplausibleRows, generalised with a catalogue
 * lookup for marker/unit plausibility.
 */
export function applySanityChecks<T extends { id: string; name: string; key: string; defaultUnit: string }>(
  rows: ParsedMarkerRow[],
  catalogueMarkers: T[],
): ParsedMarkerRow[] {
  return rows.map((row) => {
    const flags = [...(row.flags ?? [])];
    const match = findBestMarkerMatch(row.rawName, catalogueMarkers);

    if (!match) {
      flags.push('unknown_marker');
    } else if (row.unit && row.unit !== match.defaultUnit && !hasKnownConversion(match.key, row.unit, match.defaultUnit)) {
      flags.push('implausible_unit');
    }

    if (row.value != null && row.referenceLow != null && row.referenceHigh != null) {
      const width = row.referenceHigh - row.referenceLow || 1;
      const farOutside = row.value < row.referenceLow - width * 10 || row.value > row.referenceHigh + width * 10;
      const wrongMagnitude =
        row.value > 0 && (row.value > row.referenceHigh * 10 || (row.referenceLow > 0 && row.value < row.referenceLow / 10));
      if (farOutside || wrongMagnitude) flags.push('value_order_of_magnitude');
    }

    // Sanity failures cap confidence hard — a model that's 0.9 confident
    // but wrong about the marker/unit/magnitude is exactly the failure
    // mode these checks exist to catch; the flag must survive the number.
    const confidence = flags.length > 0 ? Math.min(row.confidence ?? 1, 0.4) : row.confidence;

    return { ...row, flags, confidence };
  });
}

/**
 * Re-runs extraction focused on just the flagged rows' source text and
 * compares against the first pass. Never resolves a disagreement itself —
 * a mismatch is surfaced as a flag for the admin, same as any other sanity
 * failure. Rows the second pass doesn't return, or agrees with, are left
 * as flagged-by-sanity-check-only (still needs admin sign-off, just not a
 * two-pass disagreement specifically).
 */
async function reconcileFlaggedRows(fullText: string, rows: ParsedMarkerRow[]): Promise<ParsedMarkerRow[]> {
  const flaggedIndexes = rows.map((r, i) => (r.flags && r.flags.length > 0 ? i : -1)).filter((i) => i >= 0);
  if (flaggedIndexes.length === 0) return rows;

  const focusHint =
    `A first extraction pass flagged ${flaggedIndexes.length} row(s) as uncertain. ` +
    `Re-read the report closely and re-extract ONLY these rows, focusing on their exact printed text:\n` +
    flaggedIndexes.map((i) => `- "${rows[i].sourceText || rows[i].rawLine}"`).join('\n');

  let second: LlmExtractionResult;
  try {
    second = await callExtraction(fullText, focusHint);
  } catch {
    // Second pass failing is not fatal — the first pass's flags (and low
    // confidence) already carry the row into the admin's attention.
    return rows;
  }

  const next = rows.slice();
  for (const i of flaggedIndexes) {
    const original = next[i];
    const rematch = second.rows.find((r) => r.rawName.trim().toLowerCase() === original.rawName.trim().toLowerCase());
    if (!rematch) continue;

    const disagrees =
      rematch.value !== original.value ||
      (rematch.unit ?? null) !== (original.unit ?? null) ||
      rematch.referenceLow !== original.referenceLow ||
      rematch.referenceHigh !== original.referenceHigh;

    if (disagrees) {
      next[i] = {
        ...original,
        flags: [...(original.flags ?? []), 'two_pass_disagreement'],
        confidence: Math.min(original.confidence ?? 1, 0.2),
      };
    }
  }
  return next;
}

export interface LlmExtractionOutcome {
  panelName: string | null;
  sampleDate: string | null;
  rows: ParsedMarkerRow[];
}

/**
 * Many real lab reports (Randox's included — confirmed against a real
 * sample) print every result twice: once in a narrative explanation
 * section and again in a plain summary table. The prompt asks the model
 * to dedupe itself, but this is a cheap, cheap-to-verify safety net for
 * when it doesn't — collapsing to the highest-confidence printing rather
 * than silently keeping whichever the model happened to list first. If
 * the two printings disagree on value, that's flagged rather than
 * silently discarded — a same-marker mismatch is exactly the kind of
 * thing a sanity check exists to catch.
 */
function dedupeByMarkerName(rows: ParsedMarkerRow[]): ParsedMarkerRow[] {
  const byName = new Map<string, ParsedMarkerRow>();
  for (const row of rows) {
    const key = row.rawName.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, row);
      continue;
    }
    const disagrees = existing.value !== row.value || (existing.unit ?? null) !== (row.unit ?? null);
    const kept = (row.confidence ?? 0) > (existing.confidence ?? 0) ? row : existing;
    byName.set(key, disagrees ? { ...kept, flags: [...(kept.flags ?? []), 'duplicate_printing_disagreement'] } : kept);
  }
  return [...byName.values()];
}

export async function extractWithLlm(pdfText: string): Promise<LlmExtractionOutcome> {
  const first = await callExtraction(pdfText);

  const rows: ParsedMarkerRow[] = dedupeByMarkerName(
    first.rows.map((r) => ({
      rawName: r.rawName,
      value: r.value,
      unit: r.unit,
      referenceLow: r.referenceLow,
      referenceHigh: r.referenceHigh,
      rawLine: r.sourceText,
      sourceText: r.sourceText,
      confidence: r.confidence,
      // A qualitative result has no numeric value to check against a range,
      // so it always goes to the admin rather than being treated as ready.
      resultText: r.valueText ?? null,
      needsReview: r.value == null,
      reviewReason:
        r.value == null ? 'Non-numeric result — no value or reference range to verify against.' : null,
      flags: r.valueText && r.value == null ? ['non_numeric_result'] : [],
    })),
  );

  return {
    panelName: first.panelName,
    sampleDate: first.sampleDate,
    rows,
  };
}

/** Second-pass reconciliation, run only after sanity checks have flagged rows. */
export { reconcileFlaggedRows };
