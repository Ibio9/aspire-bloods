/**
 * House style, applied to copy that lives in the database rather than in the
 * repository.
 *
 * The product has no em dashes. Keeping the source files clean is only half of
 * that: marker explanations and copy blocks are rows, seeded once and then
 * never updated (every upsert in prisma/seed.ts is deliberately `update: {}`,
 * so the seed cannot overrule somebody's edit). The consequence, found by
 * reading the rendered pages rather than the source, was that a style
 * correction made months ago had never reached a single environment. The
 * repository was spotless and the screen was not.
 */

/**
 * Replace a spaced em dash with a full stop or a comma.
 *
 * PUNCTUATION ONLY, and that is the whole reason this is safe to run over
 * clinical copy nobody here wrote: not one word is added, removed or
 * reordered, so a reviewed sentence still says exactly what its reviewer
 * approved. The only other change is the case of the single letter following a
 * full stop, which is what a full stop requires.
 *
 * Only the SPACED form is touched. An unspaced em dash could be part of a
 * compound or a range, where replacing it would change meaning rather than
 * punctuation.
 */
export function removeEmDashes(text: string): string {
  // The dash and the character after it are matched together, so the
  // replacement can capitalise where a full stop demands it rather than
  // needing a second pass that would also touch sentences already there.
  return text.replace(/\s+—\s+(.?)/g, (_match, next: string) => {
    if (!next) return '.';
    // A full stop where what follows can begin a sentence; a comma where it
    // cannot take a capital — a numeral, a quotation mark, or a proper noun
    // that reads as an apposition ("Aspire Clinic, Manchester").
    if (next >= 'a' && next <= 'z') return `. ${next.toUpperCase()}`;
    return `, ${next}`;
  });
}

/**
 * The straight apostrophe, curled.
 *
 * The product had both, side by side and often in the same card: seeded copy
 * written with `’` next to a UI label written with `'`, so "your blood’s
 * acid-base balance" sat two lines above "If it's high". One or the other, and
 * curly is the one a typographic serif page wants.
 *
 * ONLY BETWEEN TWO LETTERS, which is the whole of a contraction or a singular
 * possessive. A quotation mark is left alone deliberately: it is a pair, and
 * curling one half of a pair is worse than curling neither.
 */
export function curlyApostrophes(text: string): string {
  return text.replace(/(\p{L})'(\p{L})/gu, '$1’$2');
}

/**
 * A BALANCED PAIR of straight double quotes, curled: `"good"` → `“good”`.
 *
 * The note above says a quotation mark is left alone because it is a pair and
 * curling one half of a pair is worse than curling neither. That is still the
 * rule; this is the case it excludes. When the marks come in an even number,
 * both halves are known, so both can be curled and the objection does not
 * apply.
 *
 * The three rows this was written for are the ones the product could least
 * afford to have wrong, because they are on the lipid panel and a patient
 * reads all three together: HDL's `"good" cholesterol`, LDL's and ApoB's
 * `"bad" cholesterol`. The straight marks were the only straight quotation
 * marks left in any stored copy, sitting two lines from curled apostrophes on
 * the same card.
 *
 * ODD COUNT, NOTHING HAPPENS. An unbalanced mark is more likely to be an inch
 * or a foot, or a sentence somebody truncated, than half a quotation — and
 * guessing which half it is is exactly the failure the original note is about.
 *
 * The WORDS are untouched, which is the only reason this may run over copy
 * nobody here reviewed. In particular it does NOT touch what is inside the
 * quotes: `"good"` and `"bad"` are the colloquial names for HDL and LDL, they
 * are in quotation marks precisely to mark them as somebody else's words, and
 * replacing terms a patient recognises is a clinical wording decision rather
 * than a style correction.
 */
export function curlyQuotes(text: string): string {
  const count = (text.match(/"/g) ?? []).length;
  if (count === 0 || count % 2 !== 0) return text;
  let open = true;
  return text.replace(/"/g, () => {
    const mark = open ? '“' : '”';
    open = !open;
    return mark;
  });
}

/**
 * An en dash inside a WORD, replaced with a hyphen: `acid–base` → `acid-base`.
 *
 * Deliberately not every en dash. Between two numbers it is a range —
 * `3.9–5.1 mmol/L` is set that way in every reference range on screen and in
 * the PDF — and between two abbreviations it is usually a range too
 * (`Oct–Mar`). Those are correct and are left exactly as they are. A dash
 * joining two words is a compound, and the house style for a compound is a
 * plain hyphen.
 */
export function plainCompoundDashes(text: string): string {
  return text.replace(/(\p{Ll})–(\p{Ll})/gu, '$1-$2');
}

/**
 * The whole house style, in the order it must run.
 *
 * PUNCTUATION ONLY — not one word is added, removed or reordered by any of the
 * four, which is what makes it safe to run over clinical copy nobody in this
 * repository wrote.
 *
 * `curlyQuotes` runs AFTER `removeEmDashes`, and the order is load-bearing:
 * removeEmDashes decides between a full stop and a comma by looking at the
 * character following the dash, and it treats a straight `"` as a character
 * that cannot take a capital. Curling first would hand it a `“` it has no case
 * for. It runs BEFORE `curlyApostrophes` for no reason at all — the two touch
 * different characters and cannot interfere — but a fixed order is still worth
 * having, because "it happens not to matter" is a fact somebody has to
 * re-derive.
 */
export function applyHouseStyle(text: string): string {
  return plainCompoundDashes(curlyApostrophes(curlyQuotes(removeEmDashes(text))));
}

/**
 * The non-diagnostic vocabulary rule, as a FIXED SUBSTITUTION TABLE and
 * nothing more.
 *
 * The product never labels a result or a level good, bad, healthy, unhealthy,
 * normal, abnormal, concerning or dangerous. Its vocabulary is: in range, above
 * range, below range, significantly out, and "the usual range". Seeded copy had
 * drifted off that in a handful of places, all of the same shape — a lifestyle
 * line ending "support healthy levels", and one "if SHBG is abnormal".
 *
 * WHY A TABLE AND NOT A RULE. This is clinical copy that no clinician has
 * signed off, and a session must not rewrite clinical wording. A fixed list of
 * exact phrase → exact replacement is the narrowest possible instrument: every
 * substitution was decided once, is written down here, is reviewable in a
 * diff, and cannot fire on a sentence nobody looked at. A regex over
 * `/healthy/` would have caught "healthy weight" and "good dietary sources"
 * too, which are not breaches — the rule is about labelling a RESULT, and a
 * food can be a good source of zinc.
 *
 * Each entry restates the same fact in the product's own vocabulary. Nothing
 * here changes what is claimed, which is why it is applied without review;
 * anything that would have gone in the audit report for a clinician instead.
 */
export const VOCABULARY_CORRECTIONS: readonly (readonly [string, string])[] = [
  // The longer phrase first: it contains the shorter one's words and would
  // otherwise be half-corrected into "support cholesterol levels in the usual
  // range levels".
  ['support healthy cholesterol levels', 'support cholesterol levels in the usual range'],
  ['supports healthy levels', 'supports levels in the usual range'],
  ['support healthy levels', 'support levels in the usual range'],
  ['if SHBG is abnormal', 'if SHBG is outside its usual range'],
] as const;

/** Apply the table above. Returns the text unchanged when nothing matches. */
export function applyVocabularyRule(text: string): string {
  let out = text;
  for (const [from, to] of VOCABULARY_CORRECTIONS) out = out.split(from).join(to);
  return out;
}

/**
 * "The same words, differently punctuated."
 *
 * Used to decide whether a stored string is still the seed's own copy in an
 * older style, and may therefore be replaced with the current wording. Strip
 * punctuation and case from both sides: if they match, this file wrote it. If
 * anybody has changed a word, they do not, and the stored text is left alone.
 *
 * It does mean a human edit that changed ONLY punctuation gets overwritten.
 * That is the trade, and it is the right way round: house style is the thing
 * being enforced.
 */
export function sameWords(a: string | null | undefined, b: string | null | undefined): boolean {
  const normalise = (s: string | null | undefined) =>
    (s ?? '')
      .toLowerCase()
      .replace(/[–—‘’“”'"\-,.;:!?()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return normalise(a) === normalise(b);
}
