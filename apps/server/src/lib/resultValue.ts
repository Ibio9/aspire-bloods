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

export interface DecodedResultValue {
  /** The numeric value, or null when the stored value is textual. */
  value: number | null;
  /** The verbatim lab text ("< 0.6", "Not detected"), or null when numeric. */
  valueText: string | null;
}

export function decodeResultValue(decrypted: string): DecodedResultValue {
  const trimmed = decrypted.trim();
  if (NUMERIC_VALUE.test(trimmed)) {
    return { value: Number(trimmed), valueText: null };
  }
  return { value: null, valueText: trimmed };
}
