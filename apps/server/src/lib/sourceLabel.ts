/**
 * Phase 2 §2.7: "quiet" plain-language source labels — small, secondary,
 * never reads as a disclaimer, never implies one source is less
 * trustworthy than another. Keyed by Source.key so admins can add a new
 * source (§2.2) and this falls back to a generic, still-calm label rather
 * than showing nothing.
 */
const LABELS: Record<string, string> = {
  randox_pdf: 'Analysed by Randox Health',
  randox_portal: 'Analysed by Randox Health',
  randox_api: 'Analysed by Randox Health',
  aspire_inhouse: 'Analysed in-house at Aspire Clinic',
  manual_entry: 'Recorded by the Aspire clinical team',
};

export function sourceLabel(sourceKey: string, sourceName: string): string {
  return LABELS[sourceKey] ?? `Analysed by ${sourceName}`;
}
