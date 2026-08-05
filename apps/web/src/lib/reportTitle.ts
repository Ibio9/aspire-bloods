/** "14 March 2026" — used only where a report has no panel and the date has to carry the title. */
export function formatDatePretty(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * A report with no panel (Aspire's own in-house testing, one-off markers)
 * has no name to title itself with — it's titled by what it actually
 * contains instead: marker count and sample date, e.g. "12 markers · 14
 * March 2026".
 */
export function reportTitle(panelName: string | null, markerCount: number | null | undefined, sampleDate: string): string {
  if (panelName) return panelName;
  const dateLabel = formatDatePretty(sampleDate);
  if (markerCount == null) return dateLabel;
  return `${markerCount} marker${markerCount === 1 ? '' : 's'} · ${dateLabel}`;
}
