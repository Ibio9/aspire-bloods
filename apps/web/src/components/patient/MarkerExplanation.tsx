/**
 * ===========================================================================
 *  WHAT THIS MARKER MEANS - FOUR LEVELS, AND THE DEFINITION IS LEVEL ONE.
 * ===========================================================================
 *
 * FIVE ATTEMPTS, AND THE FIRST FOUR ASKED THE WRONG QUESTION. Each of them was
 * a contest between the card's heading and one other thing in the card - the
 * sub-labels three times, then the lead - and each ended by moving the heading.
 * The heading went 12px to 14 to 16 to 28, and the lead was brought DOWN to
 * 21px to get out of its way, at which point a label was shouting over the
 * sentence it labels.
 *
 * The question is not how big the label should be. It is:
 *
 *     THE DEFINITION IS THE CONTENT OF THIS CARD. IT WINS. THE REST IS
 *     STRUCTURE, AND STRUCTURE IS READ BEFORE THE CONTENT, NOT INSTEAD OF IT.
 *
 * Which settles all four levels at once, in the order a reader meets them, each
 * distinct from the one above on more than one axis:
 *
 *   1. THE DEFINITION. Fraunces 400 at 28px, opsz-section, full tone. The only
 *      display face in the card and the largest thing in it. WONK stays at 0 -
 *      `font-display` carries it - because this is somebody's blood marker.
 *   2. THE HEADING. `.card-eyebrow`: 16px, Plex 600, UPPERCASE, 0.14em, full
 *      tone. Unmistakably a label - the only uppercase tracked line here - and
 *      43% smaller than the sentence it introduces.
 *   3. THE SUB-LABELS. `.sublabel`: 12px, Plex 600, sentence case, 0.01em, full
 *      tone. A third the size of the definition and a quarter smaller than the
 *      heading, with the shout given up rather than the weight.
 *   4. THE ANSWERS. Plex 400 at 18px, /90. The longest lines in the card and
 *      the lightest.
 *
 * LEVELS 3 AND 4 USED TO RUN BACKWARDS, which is why they read as one flat
 * level. The label was 500 at /80 and its answer 400 at /90 - the label was the
 * FAINTER of the two, and the only size difference between them favours the
 * answer. It is now the darkest and heaviest text in its own pair. The answers
 * were not dimmed to achieve it: raising the label costs no contrast, and
 * dimming body copy in a medical portal to win a typographic argument is not a
 * trade worth making.
 *
 * SPACE BETWEEN BLOCKS, NOT INSIDE THEM - AND THE OLD FIGURES WERE MEASURED
 * WRONG. The margins were 24px between blocks and 6px from a label to its own
 * answer, which reads as 4:1 in the source and is not what a reader sees.
 * Half-leading is part of the gap: an 18px answer at 1.65 puts ~5.9px of space
 * above its own first line, and the 12px label ~3px below its last. So the real
 * gaps were ~33px and ~15px - barely 2:1, which is exactly the "a sub-label
 * sits almost as far from its answer as from the block above" complaint.
 *
 * Corrected AT THE PAINTED GAP rather than at the margin: 36px and 4px, which
 * with the same leading lands at ~45px against ~13px, or 3.5:1. And the card
 * heading sits 16px above the lead - LESS than a pair's own gap would suggest
 * on purpose, because the heading and the definition are one unit (the card's
 * header) and the three pairs are three others.
 *
 * THE MEASURE IS THE COLUMN'S, NOT EACH PARAGRAPH'S. `max-w-measure` is 68ch,
 * and `ch` resolves against the element's OWN font size - so putting it on a
 * 28px display line caps it at about 1050px, which is wider than the card and
 * therefore caps nothing at all. The cap belongs on the text COLUMN, set at the
 * reading step, and everything inside it - including the display lead - is held
 * to the same 68-character line.
 *
 * ONE COMPONENT, EVERY PLACE THIS CARD APPEARS: the marker detail page and the
 * Understanding results library, which had the same four blocks styled two
 * different ways. `labels` is the only thing that differs between them, because
 * the library is read without a result in front of you ("If it's above the
 * usual range") and the marker page is read with one ("If it's high").
 *
 * WARNING - IF THIS LOOKS WRONG AGAIN: MEASURE THE COMPUTED SIZE, WEIGHT,
 * TRACKING AND COLOUR OF ALL FOUR, AND THE PAINTED GAPS INCLUDING HALF-LEADING,
 * BEFORE TOUCHING A VALUE. It has been adjusted by eye five times and come back
 * wrong in a new direction each time.
 * `e2e/explanation-card-hierarchy.spec.ts` reads every one of those numbers off
 * the rendered card in both themes.
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
    // mt-9 (36px) from the block above, mt-1 (4px) to its own answer — set at
    // the MARGIN to land a painted gap of ~45px against ~13px once each line's
    // half-leading is counted. The previous 24/6 measured barely 2:1 on screen
    // while reading as 4:1 in the source, which is the whole of why three pairs
    // read as six loose paragraphs. See the note at the top of this file.
    <div className="mt-9">
      {/* `.sublabel`, not `.eyebrow` — see globals.css. Sentence case at the
          floor of the scale: what a label subordinate to a card heading gives
          up is the uppercase tracking, which is the whole of what makes 12px
          shout. What it does NOT give up is weight or tone — it is semibold at
          full tone, so it is the darkest text in its own pair rather than the
          faintest, which is what it used to be. */}
      <p className="sublabel">{label}</p>
      <p className="mt-1 text-reading leading-relaxed text-espresso/90">{body}</p>
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
      {/* LEVEL ONE. THE DEFINITION, AND THE LARGEST THING IN THE CARD.
          Fraunces at the section optical size, regular weight, full tone. WONK
          is carried by `font-display` and stays at 0 — a whimsical axis on the
          definition of somebody's blood marker.

          28px, back UP from 21px (Aug 2026). It was brought down to get out of
          the way of a heading that had been pushed to 28px, which put a label
          above the thing it labels. The heading came down to 16px instead and
          this line went back to where it belongs: 75% larger than the label
          over it, and the only display face on the card. */}
      <p className="font-display opsz-section text-xl leading-snug text-espresso">{explanation.whatItIs}</p>
      {explanation.highMeans && <Block label={words.high} body={explanation.highMeans} />}
      {explanation.lowMeans && <Block label={words.low} body={explanation.lowMeans} />}
      {explanation.lifestyleContext && <Block label={words.lifestyle} body={explanation.lifestyleContext} />}
    </div>
  );
}
