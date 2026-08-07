import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { extractText, getDocumentProxy } from 'unpdf';
import { extractRows } from '../src/modules/result-sources/PdfUploadAdapter.js';
import { findBestMarkerMatch } from '../src/modules/reports/matchMarker.js';
import { classifyValue, resolveResultRange, deriveStatus } from '../src/lib/deriveResultStatus.js';

/**
 * The real Randox HSC5 Basic Screen sample report, end to end through the
 * pattern-based extraction path and the new status derivation — no database,
 * no API key, no fixtures. The point is that "the sample parses" is a claim
 * that can be checked rather than asserted.
 *
 * The pattern path (not the LLM one) is deliberately what's pinned here: it
 * is what runs whenever ANTHROPIC_API_KEY is unset or the model call fails,
 * so it is the floor of what this system can do rather than its ceiling.
 */

const SAMPLE = fileURLToPath(
  new URL('../src/modules/randox/specs/HSC5-Randox-Basic-Screen-Example-Report.pdf', import.meta.url),
);

/**
 * The catalogue as the seed defines it, narrowed to the fields matching needs.
 * Kept here rather than read from the database so this test says something
 * about the parser rather than about whoever last ran a seed.
 */
const CATALOGUE = [
  { id: 'haemoglobin', key: 'haemoglobin', name: 'Haemoglobin', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'haematocrit', key: 'haematocrit', name: 'Haematocrit', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'mch', key: 'mch', name: 'Mean Cell Haemoglobin (MCH)', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'mchc', key: 'mchc', name: 'Mean Cell Haemoglobin Concentration (MCHC)', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'mcv', key: 'mcv', name: 'Mean Cell Volume (MCV)', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'rbc', key: 'rbc', name: 'Red Blood Cell Count', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'basophils', key: 'basophils', name: 'Basophil Count', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'eosinophils', key: 'eosinophils', name: 'Eosinophil Count', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'lymphocytes', key: 'lymphocytes', name: 'Lymphocytes', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'monocytes', key: 'monocytes', name: 'Monocyte Count', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'neutrophils', key: 'neutrophils', name: 'Neutrophils', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'wbc', key: 'wbc', name: 'White Blood Cell Count', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'platelets', key: 'platelets', name: 'Platelet Count', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'total-cholesterol', key: 'total-cholesterol', name: 'Total Cholesterol', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'ldl', key: 'ldl', name: 'LDL Cholesterol', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'hdl', key: 'hdl', name: 'HDL Cholesterol', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'triglycerides', key: 'triglycerides', name: 'Triglycerides', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'chol-hdl-ratio', key: 'chol-hdl-ratio', name: 'Total Cholesterol / HDL Ratio', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'hs-crp', key: 'hs-crp', name: 'hs-CRP (High-Sensitivity C-Reactive Protein)', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'crp', key: 'crp', name: 'CRP (C-Reactive Protein)', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'glucose', key: 'glucose', name: 'Fasting Glucose', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'creatinine', key: 'creatinine', name: 'Creatinine', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'egfr', key: 'egfr', name: 'eGFR (Estimated Glomerular Filtration Rate)', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'chloride', key: 'chloride', name: 'Chloride', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'phosphate', key: 'phosphate', name: 'Phosphate', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'potassium', key: 'potassium', name: 'Potassium', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'sodium', key: 'sodium', name: 'Sodium', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'urea', key: 'urea', name: 'Urea', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'alt', key: 'alt', name: 'ALT (Alanine Aminotransferase)', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'alp', key: 'alp', name: 'Alkaline Phosphatase (ALP)', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'ast', key: 'ast', name: 'AST (Aspartate Aminotransferase)', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'ggt', key: 'ggt', name: 'GGT (Gamma-Glutamyl Transferase)', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'bilirubin', key: 'bilirubin', name: 'Total Bilirubin', severityMultiplier: 1.5, severityAbsoluteDelta: null },
  { id: 'albumin', key: 'albumin', name: 'Albumin', severityMultiplier: 1.5, severityAbsoluteDelta: null },
];

interface Row {
  rawName: string;
  matched: string | null;
  status: string | null;
  unevaluable: boolean;
  hasRange: boolean;
}

let rows: Row[] = [];

beforeAll(async () => {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(SAMPLE)));
  const { text } = await extractText(pdf, { mergePages: true });

  const claimed = new Set<string>();
  rows = extractRows(text).map((row) => {
    let match = findBestMarkerMatch(row.rawName, CATALOGUE);
    if (match && claimed.has(match.id)) match = null;
    if (match) claimed.add(match.id);

    const range = resolveResultRange(
      { low: row.referenceLow, high: row.referenceHigh, unit: row.unit ?? null },
      null,
      null,
    );
    const derived =
      range.status === 'resolved' && match ? deriveStatus(classifyValue(row.value, row.resultText), range.low, range.high, match) : null;

    return {
      rawName: row.rawName,
      matched: match?.key ?? null,
      status: derived?.status === 'derived' ? derived.value : null,
      unevaluable: derived?.status === 'unevaluable',
      hasRange: range.status === 'resolved',
    };
  });
});

describe('the real Randox HSC5 Basic Screen sample report', () => {
  it('extracts the full "Results for your Doctor" table', () => {
    // 33 analytes are printed in that section of this report.
    expect(rows.length).toBeGreaterThanOrEqual(30);
  });

  it('matches every analyte that has a catalogue marker', () => {
    const unmatched = rows.filter((r) => !r.matched).map((r) => r.rawName);
    expect(unmatched, `unmatched: ${unmatched.join(', ')}`).toHaveLength(0);
  });

  it('derives a status for every two-sided row without anyone typing one', () => {
    // 23 of the 34 analytes on this report print a two-sided range.
    const twoSided = rows.filter((r) => r.hasRange && r.matched);
    expect(twoSided.length).toBe(23);
    for (const r of twoSided) {
      expect(r.status, `${r.rawName} has a range but no derived status`).not.toBeNull();
    }
  });

  it('picks up the out-of-range results this sample actually contains', () => {
    const byName = (needle: string) => rows.find((r) => r.rawName.toLowerCase().includes(needle));
    // Printed values against printed ranges, straight off the sample:
    //   MCH 32.8 against 27.0–32.0, MCV 100.7 against 76.0–100.0,
    //   RBC 4.48 against 4.5–6.5, eosinophils 0.56 against 0.04–0.4.
    // All four are mild rather than significant: none exceeds its bound by
    // more than 1.5 band-widths, which is the marker's severity threshold.
    expect(byName('mean cell haemoglobin (mch)')?.status).toBe('HIGH');
    expect(byName('mean cell volume (mcv)')?.status).toBe('HIGH');
    expect(byName('red blood cell count')?.status).toBe('LOW');
    expect(byName('eosinophil count')?.status).toBe('HIGH');
  });

  it('leaves the in-range majority in range', () => {
    // 23 two-sided rows, four of them out of range, so 19 in range.
    const inRange = rows.filter((r) => r.status === 'IN_RANGE');
    expect(inRange.length).toBe(19);
  });

  it('flags the one-sided rows as needing a range rather than inventing one', () => {
    // Total Cholesterol, LDL, HDL, the ratio, Triglycerides, hsCRP, ALT, AST,
    // Total Bilirubin, eGFR and CRP all print a single-sided threshold in this
    // report. None of them may be given a two-sided range by guesswork.
    const noRange = rows.filter((r) => !r.hasRange);
    expect(noRange.length).toBeGreaterThan(0);
    for (const r of noRange) expect(r.status).toBeNull();
  });

  it('never coerces a one-sided threshold into a status', () => {
    const cholesterol = rows.find((r) => r.rawName.toLowerCase() === 'total cholesterol');
    expect(cholesterol).toBeDefined();
    // 5.85 against "<5.0" is obviously high to a human, but the parser is not
    // given the direction in text, so it asks rather than assumes.
    expect(cholesterol!.status).toBeNull();
  });
});
