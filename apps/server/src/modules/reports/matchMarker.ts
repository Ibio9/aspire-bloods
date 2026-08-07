function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents (e.g. α)
    .replace(/[^a-z0-9]/g, '');
}

/**
 * "Neutrophil Count" and "Neutrophils" are the same analyte printed two ways.
 * Stripping the counting noun and a trailing plural reduces both to the same
 * stem without loosening the match to anything else — this is not fuzzy
 * matching, it is two spellings of one word.
 */
function stem(s: string): string {
  return s.replace(/(counts?|levels?)$/, '').replace(/s$/, '');
}

/**
 * The same words in any order, ignoring repeats: "Total Cholesterol / HDL
 * Cholesterol Ratio" (as Randox print it) and "Total Cholesterol / HDL Ratio"
 * (as our catalogue holds it) reduce to the same set. Tight enough to be safe
 * — every word has to be present on both sides — while surviving the fact
 * that no two labs punctuate or repeat a compound analyte name the same way.
 */
function tokenSet(s: string): string {
  const tokens = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return [...new Set(tokens)].sort().join('|');
}

/**
 * Labs print an analyte's abbreviation on either side of its full name:
 * Randox print "Alanine Aminotransferase (ALT)", our catalogue holds "ALT
 * (Alanine Aminotransferase)". Once punctuation is stripped, those two are
 * cyclic rotations of one another — so a rotation check reads exactly the
 * cases this is meant to catch and nothing else. Two genuinely different
 * markers being exact cyclic rotations of each other is not a thing that
 * happens; a length check keeps it that way.
 */
function isRotation(a: string, b: string): boolean {
  return a.length > 3 && a.length === b.length && (a + a).includes(b);
}

/**
 * Best-effort name match between a parsed lab row and our marker catalogue.
 *
 * Every match is a suggestion — the admin sees it in the verify table and can
 * change it before anything is saved. So the cost of a near-miss is one
 * correction, and the cost of a WRONG confident match is a result filed under
 * the wrong analyte. Those are not symmetric, which is why the substring pass
 * at the end picks the closest-length candidate rather than the first one it
 * finds: "CRP" is a substring of both "CRP (C-Reactive Protein)" and "hs-CRP
 * (High-Sensitivity C-Reactive Protein)", and first-wins made that a coin
 * flip decided by catalogue ordering between two genuinely different tests.
 */
/**
 * How confidently two names identify the same analyte.
 *
 * The five passes in `findBestMarkerMatch` are not equally safe. The first
 * four each assert that the same WORDS are present on both sides — a
 * different spelling of one name. The fifth only asserts that one name
 * contains the other, which is true of "Magnesium" and "RBC Magnesium", of
 * "Testosterone" and "Free Testosterone", and of "Bilirubin" and "Direct
 * Bilirubin". Every one of those pairs is two genuinely different analytes.
 *
 * That difference doesn't matter when the answer is a suggestion an admin
 * confirms in the verify table, which is what findBestMarkerMatch feeds. It
 * matters enormously when the answer decides whether the catalogue gets one
 * record or two, because nobody is watching a seed run. So the tier is
 * exposed and the catalogue seed merges on the first four only, reporting the
 * fifth for a human to look at.
 */
export type MatchTier = 'exact' | 'rotation' | 'tokens' | 'stem' | 'substring';

export function classifyMarkerMatch(rawName: string, candidate: { name: string; key: string }): MatchTier | null {
  const target = normalise(rawName);
  if (!target) return null;
  const name = normalise(candidate.name);

  if (name === target || normalise(candidate.key) === target) return 'exact';
  if (isRotation(name, target)) return 'rotation';

  const targetTokens = tokenSet(rawName);
  if (targetTokens.includes('|') && tokenSet(candidate.name) === targetTokens) return 'tokens';

  const s = stem(name);
  if (s.length > 3 && s === stem(target)) return 'stem';

  if (name.length > 3 && (target.includes(name) || name.includes(target))) return 'substring';
  return null;
}

/** The four tiers that assert the same words, not merely an overlap. */
export const STRONG_MATCH_TIERS: readonly MatchTier[] = ['exact', 'rotation', 'tokens', 'stem'];

export function findBestMarkerMatch<T extends { id: string; name: string; key: string }>(
  rawName: string,
  candidates: T[],
): T | null {
  const target = normalise(rawName);
  if (!target) return null;
  const targetStem = stem(target);

  // 1. Exact, on either the printed name or our own key.
  for (const c of candidates) {
    if (normalise(c.name) === target || normalise(c.key) === target) return c;
  }

  // 2. Same words, abbreviation on the other side.
  for (const c of candidates) {
    if (isRotation(normalise(c.name), target)) return c;
  }

  // 3. Same words, differently ordered or repeated.
  const targetTokens = tokenSet(rawName);
  if (targetTokens.includes('|')) {
    for (const c of candidates) {
      if (tokenSet(c.name) === targetTokens) return c;
    }
  }

  // 4. Same word, one of them pluralised or suffixed with "count".
  for (const c of candidates) {
    const s = stem(normalise(c.name));
    if (s.length > 3 && s === targetStem) return c;
  }

  // 5. One name contains the other. Closest length wins, so the more specific
  //    marker isn't beaten by a shorter one that merely happens to be inside it.
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const n = normalise(c.name);
    if (n.length <= 3) continue;
    if (!target.includes(n) && !n.includes(target)) continue;
    const distance = Math.abs(n.length - target.length);
    if (distance < bestDistance) {
      best = c;
      bestDistance = distance;
    }
  }
  return best;
}
