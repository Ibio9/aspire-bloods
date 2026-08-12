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
  /**
   * Deliberately EMPTY, and empty is a value here rather than a gap.
   *
   * It used to read "Analysed in-house at Aspire Clinic", which sat on the
   * report header and on every marker card and told a patient something about
   * the practice's laboratory arrangements and nothing whatever about their
   * result. Where a result genuinely came from Randox the provenance earns its
   * line, because it is the reason two values might not be comparable. Where
   * the clinic analysed it itself, there is no second party to name and the
   * line is noise on the one screen that should be quietest.
   *
   * Every surface that prints a source label guards it, so an empty string
   * renders nothing at all rather than an empty row.
   */
  aspire_inhouse: '',
  manual_entry: 'Recorded by the Aspire Clinic clinical team',
};

export function sourceLabel(sourceKey: string, sourceName: string): string {
  return LABELS[sourceKey] ?? `Analysed by ${sourceName}`;
}
