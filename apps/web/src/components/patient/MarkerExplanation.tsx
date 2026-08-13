/**
 * ===========================================================================
 *  WHAT THIS MARKER MEANS — FOUR LEVELS, EACH VISIBLY DIFFERENT FROM THE ONE
 *  ABOVE IT.
 * ===========================================================================
 *
 * The hierarchy in this card used to be inverted, and not subtly:
 *
 *   · `WHAT THIS MARKER MEANS` is the card's heading, and it was the SMALLEST
 *     thing in it — a 12px eyebrow.
 *   · `If it’s high`, `If it’s low` and `Lifestyle context` are subheadings
 *     under it, and at the base step in medium weight they were visibly LARGER
 *     than the heading they sit beneath.
 *   · The lead sentence — the definition of the marker, and the single most
 *     important line in the card — was set in the same face and nearly the same
 *     weight as the sentences underneath it.
 *
 * So the card read as a flat list of four paragraphs and nothing in it said
 * what to read first. Rebuilt as four levels:
 *
 *   1. HEADING. `.card-eyebrow`: two steps up the scale (16px), semibold, full
 *      tone, and the only uppercase tracked line in the card. It labels the
 *      card; it is not competing to be read — but it does have to be the most
 *      prominent LABEL in it.
 *   2. THE LEAD. Fraunces at the section optical size, one step below a page
 *      title. It is the definition, and it should be the loudest thing here.
 *   3. THE LABELS. `.sublabel`: sentence case, 12px, muted. They introduce an
 *      answer; they are not headings competing with the card title.
 *   4. THE ANSWERS. Plex Sans at reading size, regular weight, one step muted
 *      against the lead.
 *
 * ── AND THE FIRST FIX WAS HALF A FIX (Aug 2026) ────────────────────────────
 *
 * Levels 1 and 3 were both `.eyebrow`: 12px, medium, uppercase, tracked, /80 —
 * IDENTICAL. So the card still had four peers in it, with nothing saying which
 * was the heading, and three repetitions of the treatment underneath one
 * instance of it read as the stronger thing. Both moved apart: the heading up a
 * step in size, weight and tone; the labels out of the uppercase tracking,
 * which is what makes 12px shout and is the only thing they had left to give up
 * (12px is the floor of the type scale and /80 the floor of the opacity
 * ladder). The lead in Fraunces is untouched and is still the loudest line.
 *
 * SPACE BETWEEN BLOCKS, NOT INSIDE THEM. `If it’s high` used to sit `mt-8` from
 * the block above and `mt-2` from its own answer — nearly the same distance
 * either side, which is what made three label/answer PAIRS read as six
 * unrelated paragraphs. The gap between a label and its answer is now a
 * fraction of the gap between blocks, so the pairing is done by proximity
 * before anybody reads a word.
 *
 * THE MEASURE IS THE COLUMN'S, NOT EACH PARAGRAPH'S. `max-w-measure` is 68ch,
 * and `ch` resolves against the element's OWN font size — so putting it on a
 * 28px display line caps it at about 1050px, which is wider than the card and
 * therefore caps nothing at all. That is why the lead ran the full card width
 * with the token already on it. The cap belongs on the text COLUMN, set at the
 * reading step, and everything inside it — including the display lead — is held
 * to the same 68-character line.
 *
 * ONE COMPONENT, EVERY PLACE THIS CARD APPEARS: the marker detail page and the
 * Understanding results library, which had the same four blocks styled two
 * different ways. `labels` is the only thing that differs between them, because
 * the library is read without a result in front of you ("If it’s above the
 * usual range") and the marker page is read with one ("If it’s high").
 */

export interface MarkerExplanationCopy {
  whatItIs: string;
  highMeans?: string | null;
  lowMeans?: string | null;
  lifestyleContext?: string | null;
}

const LABELS = {
  /** On a marker's own page, beside that patient's own result. */
  result: { high: 'If it’s high', low: 'If it’s low', lifestyle: 'Lifestyle context' },
  /** In the library, where there is no result on screen to be high or low. */
  library: {
    high: 'If it’s above the usual range',
    low: 'If it’s below the usual range',
    lifestyle: 'Lifestyle context',
  },
} as const;

function Block({ label, body }: { label: string; body: string }) {
  return (
    // mt-7 (28px) from the block above, mt-1.5 (6px) to its own answer. Still
    // nearly five to one, which is what makes this a pair rather than two
    // paragraphs that happen to be adjacent — and now LESS than the 32px the
    // card heading has under it, which is the half of the hierarchy that was
    // running backwards. A sub-label alone in more air than the heading gets
    // reads as the start of a section however the heading is set.
    <div className="mt-7">
      {/* `.sublabel`, not `.eyebrow` — see globals.css. Same size, same tone,
          sentence case: 12px is the floor of the scale and /80 the floor of the
          opacity ladder, so what a label subordinate to a card heading can give
          up is the uppercase tracking, which is the whole of what makes 12px
          shout. */}
      <p className="sublabel">{label}</p>
      <p className="mt-1.5 text-reading leading-relaxed text-espresso/90">{body}</p>
    </div>
  );
}

export function MarkerExplanationBody({
  explanation,
  labels = 'result',
}: {
  explanation: MarkerExplanationCopy;
  labels?: keyof typeof LABELS;
}) {
  const words = LABELS[labels];
  return (
    // THE TEXT COLUMN. `text-reading` is what the 68ch is measured at — see the
    // note above. Everything inside is capped to this one line length.
    <div className="max-w-measure text-reading">
      {/* THE LEAD. Fraunces, section optical size, regular weight. WONK is
          carried by `font-display` and stays at 0 — a whimsical axis on the
          definition of somebody's blood marker.

          21px, DOWN from 28px (Aug 2026), and the heading above it is what
          moved it. `WHAT THIS MARKER MEANS` has to be larger than this
          sentence — it is the card's own label and it was the third largest
          thing in the card — and the way to get there was to bring this line
          down rather than push the label up to 38px, where it is wider than
          the card at every width this product is read at. It is still the
          loudest thing under the heading, still the only Fraunces line in the
          card, and still a step above the answers at 18px. */}
      <p className="font-display opsz-section text-lg leading-snug text-espresso">{explanation.whatItIs}</p>
      {explanation.highMeans && <Block label={words.high} body={explanation.highMeans} />}
      {explanation.lowMeans && <Block label={words.low} body={explanation.lowMeans} />}
      {explanation.lifestyleContext && <Block label={words.lifestyle} body={explanation.lifestyleContext} />}
    </div>
  );
}
