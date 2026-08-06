/**
 * A panel just labels the test package (Insight 360, Signature...) — it
 * titles the report but does no clinical work, so a report with no panel
 * (an ad-hoc marker set, or a source that doesn't map onto one of ours) is
 * still fully valid. Falls back to a title built from what the report
 * actually contains: how many markers, from when.
 */
export function reportTitle(panelName: string | null | undefined, sampleDateIso: string, markerCount: number): string {
  if (panelName) return panelName;
  const date = new Date(sampleDateIso);
  const dateLabel = Number.isNaN(date.getTime())
    ? sampleDateIso
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${markerCount} marker${markerCount === 1 ? '' : 's'} · ${dateLabel}`;
}
