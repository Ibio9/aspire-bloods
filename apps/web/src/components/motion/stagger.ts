/**
 * Stagger timing for revealed lists: enough offset to read as a sequence,
 * capped so the twentieth item doesn't arrive noticeably after the first.
 * Lives apart from Reveal.tsx so that file exports only a component
 * (react-refresh constraint), but the two are one system — see Reveal.
 */
export function staggerDelay(index: number, stepMs = 50, capMs = 350): number {
  return Math.min(index * stepMs, capMs);
}
