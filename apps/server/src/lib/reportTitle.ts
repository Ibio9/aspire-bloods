/**
 * A report with no panel (Aspire's own in-house testing, one-off markers)
 * has no name to fall back on — it's titled by what it actually contains
 * instead. Kept in one place so the PDF, DSAR export, and any future
 * server-rendered surface agree on the wording.
 */
export function reportPanelLabel(panelName: string | null, markerCount: number): string {
  if (panelName) return panelName;
  return `${markerCount} marker${markerCount === 1 ? '' : 's'}`;
}
