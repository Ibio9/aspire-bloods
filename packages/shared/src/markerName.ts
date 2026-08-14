/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A MARKER'S NAME, SPLIT INTO THE ABBREVIATION AND THE EXPANSION (Aug 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The catalogue stores one string per marker, expansion first:
 *
 *     High Sensitivity C Reactive Protein (hsCRP)
 *
 * On a 15rem card that is four lines of eyebrow, and the four-letter part that
 * a patient actually recognises is the last thing on the last line. Set the
 * other way up it is one strong line and one quiet one:
 *
 *     hsCRP
 *     High Sensitivity C Reactive Protein
 *
 * ── THE HARD PART IS THAT MOST PARENTHESES ARE NOT ABBREVIATIONS ────────────
 *
 * The catalogue has 207 food items in it and a great many of them are
 * qualified rather than abbreviated: `Bean (Broad)`, `Milk (Goat)`,
 * `Melon (Galia/Honeydew)`, `Grape (Black/Red/White)`, `Cabbage (Savoy/White)`,
 * plus the nine urinalysis pads (`Glucose (urine)`, and that qualifier is
 * load-bearing — it is what stops a dipstick reading merging into a fasting
 * plasma glucose) and `Calcium (adjusted)`.
 *
 * Splitting one of those puts `Broad` on the strong line above `Bean`, which
 * says a patient was tested for broadness. So this REFUSES far more often than
 * it splits, and the brief's own rule is the reason: **do not invent
 * abbreviations**. Everything that is not recognisably an initialism of the
 * words before it stays exactly as it is, on one line.
 *
 * ── THE FOUR TESTS, AND WHAT EACH ONE IS FOR ────────────────────────────────
 *
 * A trailing `(...)`, and then all four of:
 *
 *  1. NO SPACES INSIDE IT. `Curry (Mixed Spices)` and `Bean (White Haricot)`
 *     are two words of qualifier. It also loses `Cancer Antigen 125 (CA 125)`,
 *     which genuinely is an abbreviation — accepted, because a rule that admits
 *     a space admits every two-word qualifier in the food list with it, and one
 *     marker on one line is a smaller loss than "Red Kidney" set as a heading.
 *  2. AT LEAST TWO CAPITALS. `Bean (Broad)` passes test 3 (both start with b)
 *     and this is what stops it: an initialism of a multi-word name carries a
 *     capital per word. It also removes every lowercase qualifier at once —
 *     `(urine)`, `(adjusted)`, `(a)`.
 *  3. THE FIRST LETTER MATCHES, case-insensitively. This is the one doing most
 *     of the work: `Grape (Black/…)`, `Melon (Galia/…)`, `Cabbage (Savoy/…)`,
 *     `Pepper (Green/…)` and `Milk (Cow)` all fail on it. Case-INSENSITIVE
 *     because `hsCRP` starts lowercase and is exactly the case the brief names.
 *  4. SHORTER THAN WHAT IT ABBREVIATES, and at most 12 characters. An
 *     "abbreviation" as long as the name is not one.
 *
 * A stricter check was tried first — every capital in the parenthetical has to
 * appear as a word initial, in order — and it is wrong: `Anti-Thyroid
 * Peroxidase Antibody (Anti-TPO)` abbreviates the last word to two letters, so
 * `ATPO` is not a subsequence of `ATPA` and a real abbreviation was refused.
 *
 * Deliberately NOT a lookup table of known abbreviations. There are 186
 * clinical markers and a table would be a second place for a name to live, out
 * of step with the catalogue the day anybody renames one.
 */

export interface MarkerNameParts {
  /** The strong line. The abbreviation where there is one, otherwise the whole name. */
  primary: string;
  /** The quiet second line, or null where the name is a single line. */
  expansion: string | null;
}

/** How long a parenthetical may be and still be read as an abbreviation. */
const MAX_ABBREVIATION = 12;

/**
 * SUFFIXES THIS CODEBASE ADDED ITSELF, WHICH ARE NEVER THE MARKER'S NAME.
 *
 * Every one of the 207 food-sensitivity items is stored as `Cod (IgG)`, and
 * that suffix is ours — see `bareSensitivityName` in markerCatalogue.ts. Today
 * no food begins with an i, so the first-letter test refuses all 207 on its
 * own; the day somebody adds `Iceberg Lettuce (IgG)` it would pass all four
 * tests and render as **IgG** over "Iceberg Lettuce", which is an assay class
 * presented as the thing a patient was tested for.
 *
 * A latent trap that fires on one new row is worth closing while the reason is
 * still legible, and this is not a special case so much as the general rule
 * stated: an assay-class marker is not an abbreviation of a food.
 */
const OUR_OWN_SUFFIXES = new Set(['IgG', 'IgE']);

const TRAILING_PARENTHETICAL = /^(.+?)\s+\(([^()]+)\)$/;

function firstLetter(text: string): string | null {
  const match = /\p{L}/u.exec(text);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Does `abbreviation` read as a short form of `expansion`? The four tests
 * above, applied to a pair in either order.
 */
function abbreviates(abbreviation: string, expansion: string): boolean {
  // 0. Not a suffix we bolted on ourselves.
  if (OUR_OWN_SUFFIXES.has(abbreviation)) return false;
  // 1. One token.
  if (/\s/.test(abbreviation)) return false;
  // 2. An initialism carries a capital per word it stands for.
  if ((abbreviation.match(/\p{Lu}/gu) ?? []).length < 2) return false;
  // 3. It abbreviates THESE words, not some other ones.
  const first = firstLetter(abbreviation);
  if (first === null || first !== firstLetter(expansion)) return false;
  // 4. Shorter than what it stands for.
  return abbreviation.length <= MAX_ABBREVIATION && abbreviation.length < expansion.length;
}

/**
 * ── BOTH ORDERS, BECAUSE THE PRODUCT HAS BOTH (Aug 2026) ────────────────────
 *
 * The first version of this read `Full Name (ABBREV)` only, because that is the
 * order `markerCatalogue.ts` writes. The DATABASE is mostly the other way round
 * — and it is what a patient reads:
 *
 *     ALT (Alanine Aminotransferase)      eGFR (Estimated Glomerular …)
 *     hs-CRP (High-Sensitivity C-Reactive Protein)
 *
 * `hs-CRP` is the brief's own example, so the brief was quoting the real data
 * and the first implementation was built against the source of a different one.
 * It rendered `ALT (ALANINE AMINOTRANSFERASE)` on a card unchanged — which is
 * the exact string the two-line change exists to remove — while splitting
 * `Interleukin-10 (IL-10)` correctly two cards along. Caught in a screenshot,
 * which is the only place it was visible.
 *
 * THE TWO FORMS CANNOT BOTH MATCH, and that is structural rather than lucky:
 * an abbreviation is a single token, so a parenthetical containing a space can
 * only be an expansion and one without can only be an abbreviation.
 */
export function splitMarkerName(name: string): MarkerNameParts {
  const whole = name.trim();
  const match = TRAILING_PARENTHETICAL.exec(whole);
  if (!match) return { primary: whole, expansion: null };

  const before = match[1].trim();
  const inner = match[2].trim();

  // `Mean Cell Haemoglobin (MCH)` — the catalogue's order.
  if (abbreviates(inner, before)) return { primary: inner, expansion: before };
  // `ALT (Alanine Aminotransferase)` — the database's, and the one a patient
  // actually sees.
  if (abbreviates(before, inner)) return { primary: before, expansion: inner };

  return { primary: whole, expansion: null };
}
