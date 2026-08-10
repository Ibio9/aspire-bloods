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
