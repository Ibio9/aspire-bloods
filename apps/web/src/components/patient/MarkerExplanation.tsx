/**
 * ===========================================================================
 *  WHAT THIS MARKER MEANS — THREE LEVELS, AND THE LABELS ARE THE TOP ONE.
 * ===========================================================================
 *
 * SIX SETTINGS, AND THE FIRST FIVE WERE THE SAME MISTAKE. Every one of them
 * was a contest between the card's HEADING and the LABELS inside it, refereed
 * by size: 12px, then 14, then 16, then 28, then back to 16, with the
 * definition dragged down to 21px in the fourth attempt to get out of the
 * heading's way. It came back wrong in a new direction each time because the
 * question was wrong. There were never two kinds of label in this card.
 *
 *     ONE LABEL CLASS FOR ALL FOUR, AND THE LABELS LEAD.
 *
 * "What this marker means", "If it's high", "If it's low", "Lifestyle context"
 * are four labels of one kind and they are set identically. Nothing here
 * varies by content length, and nothing varies by which fields a marker
 * happens to have — a marker with only `highMeans` gets the same label at the
 * same size as one with all three, because the label describes the question,
 * not the answer's length.
 *
 * ── THE THREE LEVELS ──────────────────────────────────────────────────────
 *
 *   1. THE LABELS. `.card-label`: 16px, Plex 600, SENTENCE CASE, 0.01em, full
 *      tone. The most prominent text in the card, and the case is why 16px is
 *      enough to be — uppercase at 0.14em reads as loud regardless of size,
 *      which is the sentence the five previous attempts were missing. Dropping
 *      the case at the same 16px is what makes this the middle ground between
 *      the old heading and the old sub-labels rather than a sixth guess.
 *   2. THE DEFINITION. Fraunces 400 at 14px, opsz-small, full tone. The only
 *      display face in the card and deliberately SMALLER than the label above
 *      it. WONK stays at 0 — `font-display` carries it — because this is
 *      somebody's blood marker.
 *   3. THE ANSWERS. Plex 400 at 12px, /85. The quietest and smallest text
 *      here. The card is a reference somebody scans for the one question they
 *      have; the labels are what they scan, and the answer to the one they
 *      stop at is what they read.
 *
 * ⚠ 12px IS THE FLOOR OF THE TYPE SCALE and body copy is not usually set
 * there. It is the cost of three descending steps starting at 16 — 16/14/12,
 * and the scale has nothing under 12. If it ever has to give, RAISE THE
 * ANSWERS and take the labels to 18 with them, keeping the order. Do not open
 * a fourth level and do not set the four labels differently from each other.
 *
 * ── SPACING: PAIRS READ AS PAIRS, AND IT IS MEASURED AT THE PAINT ─────────
 * A margin is not a gap. Half-leading is part of what a reader sees, so the
 * figures here are chosen for what lands on screen rather than for what reads
 * tidily in the source — which is how the previous setting ended up at 4:1 in
 * the file and barely 2:1 on the page.
 *
 *     between one block and the next   mt-9 (36px)  →  44.5px painted
 *     from a label to its own answer   mt-1 (4px)   →  12.6px painted
 *
 * A 12px answer at `leading-relaxed` (1.625) carries 3.75px of half-leading
 * above its first line and a 16px label at 1.6 carries 4.8px below its last, so
 * every gap in this card paints 8.55px WIDER than its margin. The measured
 * ratio is 3.5:1 — which is why the pair's margin is 4px and not the 14 the
 * first pass wrote: 14px of margin paints as 22.6, against 44.5 between blocks,
 * and 1.98:1 is the exact "a label sits almost as far from its own answer as
 * from the block above" complaint arriving from the other side. Both figures
 * are read off the rendered card by the spec rather than reasoned about here.
 *
 * ── ONE COMPONENT, AND IT RENDERS THE FIRST LABEL TOO ─────────────────────
 * "What this marker means" used to be typed at the call site in a different
 * class from the three below it, which is exactly how four labels of one kind
 * ended up in two tiers. It is rendered here now, so there is one place all
 * four are set and no way for a call site to disagree with the other one.
 * `labels` is the only thing that differs between the two surfaces, because
 * the library is read without a result in front of you ("If it's above the
 * usual range") and the marker page is read with one ("If it's high").
 *
 * WARNING — IF THIS LOOKS WRONG AGAIN: MEASURE THE COMPUTED SIZE, WEIGHT,
 * TRACKING, CASE AND COLOUR OF ALL THREE LEVELS, AND THE PAINTED GAPS
 * INCLUDING HALF-LEADING, BEFORE TOUCHING A VALUE. It has been adjusted by eye
 * five times and come back wrong in a new direction each time.
 * `e2e/explanation-card-hierarchy.spec.ts` reads every one of those numbers off
 * the rendered card in both themes and asserts the ORDER rather than the
 * values.
 */

export interface MarkerExplanationCopy {
  whatItIs: string;
  highMeans?: string | null;
  lowMeans?: string | null;
  lifestyleContext?: string | null;
}

const LABELS = {
  /** On a marker's own page, beside that patient's own result. */
  result: {
    whatItIs: 'What this marker means',
    high: 'If it’s high',
    low: 'If it’s low',
    lifestyle: 'Lifestyle context',
  },
  /** In the library, where there is no result on screen to be high or low. */
  library: {
    whatItIs: 'What this marker means',
    high: 'If it’s above the usual range',
    low: 'If it’s below the usual range',
    lifestyle: 'Lifestyle context',
  },
} as const;

/**
 * A LABEL AND ITS ANSWER, AND THE ONLY THING THAT DIFFERS BETWEEN INSTANCES IS
 * THE WORDS. Same class, same size, same weight, same tone, same two margins,
 * whichever of the three questions it is answering.
 */
function Block({ label, body }: { label: string; body: string }) {
  return (
    // mt-9 (36px) from the block above, mt-1 (4px) to its own answer — which
    // paints as 44.5px against 12.6px once each line's half-leading is counted.
    // See the note at the top of this file: every gap here paints 8.55px wider
    // than its margin, so these are chosen at the paint and not at the margin.
    <div className="mt-9">
      <p className="card-label">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-espresso/85">{body}</p>
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
    // THE TEXT COLUMN. 68ch resolves against the element's OWN font size, so
    // the cap belongs here at the reading step rather than on any one
    // paragraph — on a 28px display line it capped at about 1050px, which is
    // wider than the card and therefore capped nothing at all.
    <div className="max-w-measure text-reading">
      {/* THE FIRST OF FOUR IDENTICAL LABELS. It is not a heading and it is not
          a different class from the three below it; that distinction is what
          this card spent five attempts failing to referee. */}
      <p className="card-label">{words.whatItIs}</p>
      {/* THE DEFINITION. Fraunces at the small optical size, regular weight,
          full tone — the only display face in the card and, deliberately,
          smaller than the label above it. The same mt-1 as every other
          label/answer pair, because that is what this is. */}
      <p className="font-display opsz-small mt-1 text-sm leading-snug text-espresso">{explanation.whatItIs}</p>
      {explanation.highMeans && <Block label={words.high} body={explanation.highMeans} />}
      {explanation.lowMeans && <Block label={words.low} body={explanation.lowMeans} />}
      {explanation.lifestyleContext && <Block label={words.lifestyle} body={explanation.lifestyleContext} />}
    </div>
  );
}
