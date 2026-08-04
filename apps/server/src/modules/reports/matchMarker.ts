function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents (e.g. α)
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Best-effort name match between a parsed PDF row and our marker catalog.
 * Purely a convenience for pre-filling the admin verify table — the admin
 * can always override it, so false positives are low-stakes here.
 */
export function findBestMarkerMatch<T extends { id: string; name: string; key: string }>(
  rawName: string,
  candidates: T[],
): T | null {
  const target = normalise(rawName);
  if (!target) return null;

  for (const c of candidates) {
    if (normalise(c.name) === target || normalise(c.key) === target) return c;
  }
  for (const c of candidates) {
    const n = normalise(c.name);
    if (n.length > 3 && (target.includes(n) || n.includes(target))) return c;
  }
  return null;
}
