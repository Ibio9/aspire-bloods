/**
 * A lab result is usually a number, but not always: assays report censored
 * values ("< 0.6" when the analyte sits below the detection limit) and
 * qualitative outcomes ("Not detected"). ReportResult.valueEncrypted has
 * always stored the value as a string, so both kinds fit — this is the one
 * place that decides which kind a stored value is, so every read path
 * (portal, admin, PDF, DSAR export) classifies identically instead of each
 * calling Number() and rendering NaN when the value was never numeric.
 */

const NUMERIC_VALUE = /^-?\d+(\.\d+)?$/;

/**
 * Stored strings that are not a result at all.
 *
 * Two sources. The first is our own: the verify path wrote
 * `encryptField(String(row.value))`, so a row that arrived with no value at
 * all was persisted as the four characters "null" — and, alongside it, a
 * status of IN_RANGE. The second is the laboratory's: a row printed as "—",
 * "N/A" or "Not reported" is the lab saying the test was not performed, which
 * is the same fact.
 *
 * Both decode to NOTHING here, so a marker that was never measured has no
 * value and no text on any read path, and is therefore dropped rather than
 * rendered with a status somebody has to interpret. This is what repairs the
 * rows already in the database: the mis-stamped status is still on the row,
 * but nothing reads it, because the result it belonged to no longer exists as
 * far as every query is concerned.
 *
 * Deliberately a short, literal list. Anything genuinely qualitative
 * ("Not detected", "Reactive") is a real result and must survive.
 */
const NOT_A_RESULT = new Set([
  '',
  'null',
  'undefined',
  'nan',
  '-',
  '--',
  '–', // en dash
  '—', // em dash
  'n/a',
  'na',
  'not reported',
  'no result',
  'not performed',
  'not tested',
]);

export interface DecodedResultValue {
  /**
   * The numeric value, or null when the stored value is textual OR when there
   * is no result at all — `valueText` separates those two cases.
   */
  value: number | null;
  /**
   * The verbatim lab text ("< 0.6", "Not detected"). Null when the value is
   * numeric, and null when there is no result: value and valueText BOTH null
   * is the shape that means "nothing was measured", which every read path
   * filters on. See hasResultValue in packages/shared.
   */
  valueText: string | null;
}

export function decodeResultValue(decrypted: string): DecodedResultValue {
  const trimmed = decrypted.trim();
  if (NUMERIC_VALUE.test(trimmed)) {
    return { value: Number(trimmed), valueText: null };
  }
  if (NOT_A_RESULT.has(trimmed.toLowerCase())) {
    return { value: null, valueText: null };
  }
  return { value: null, valueText: trimmed };
}
