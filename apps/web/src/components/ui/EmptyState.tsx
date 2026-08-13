import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  /**
   * Optional, and usually omitted. An empty state earns a second line only
   * when it can say something the title cannot: why there is nothing here, or
   * what will put something here. It does not earn one for restating the title
   * or for telling somebody to clear a filter they can see the button for.
   */
  description?: string;
  action?: ReactNode;
}

/**
 * Warm and reassuring, not blank (brief §3.7). Used for "no results yet" and
 * "results pending" states.
 *
 * Padding is square and sized to what's in it. It used to be p-10/sm:p-14,
 * which around three lines of text made a card that was mostly air, and far
 * taller than it was padded at the sides. The space read as something missing
 * rather than as room deliberately left, which is the opposite of what an
 * empty state is for. Still generous, since this is usually the only card on
 * the page; just no longer cavernous.
 *
 * ── THE ARCH (Aug 2026) ────────────────────────────────────────────────────
 * One of exactly three places the product's repeating shape appears, and one of
 * the two quiet ones. A single faint arch behind the message — a hairline, no
 * fill, half opacity — which gives an otherwise empty box something to be empty
 * INSIDE. It is `aria-hidden` and it is the only thing here that is decorative;
 * everything a reader needs is in the words.
 *
 * It is drawn behind the content rather than around it, deliberately: an arch
 * that framed the text would be a second border on a card that already has one,
 * and this is meant to be noticed at about the level a watermark is.
 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    // `min-h` and the taller vertical padding are what the arch needs and are
    // not decoration for its own sake: the shape has to be WIDER than the
    // message it stands behind and TALLER than half its own width, or the
    // browser caps the corner radii and a doorway becomes a rounded box. The
    // first version of this was `h-[150%]` anchored to the bottom of an
    // `overflow-hidden` card, which clipped the curve away entirely and drew
    // two bare vertical hairlines straight through the sentence.
    <div className="motion-safe:animate-riseIn relative min-h-[14rem] overflow-hidden rounded-card border border-taupe bg-cream-50 px-8 py-14 text-center shadow-card sm:py-16">
      {/* STANDING ON THE CARD'S FLOOR, not floating inside it. `inset-y-8`
          held it 32px clear of the bottom, so its (now removed) bottom rule
          crossed the message and its two sides stopped in mid-air. `bottom-0`
          runs them off the edge of the card, which is the same composition the
          full-size arch uses on the results-ready moment at a hundredth of the
          weight.

          It is still comfortably taller than half its own width — 192px of
          height against 256px of width in the shortest card this renders in —
          which is the condition for the browser not to cap the corner radii
          and turn a doorway into a rounded box. */}
      {/* WIDER THAN THE MESSAGE IT STANDS BEHIND, at every card width, or its
          two sides are hairlines drawn down through the sentence — which is the
          exact failure the first version of this shape made and the reason the
          note above exists. The description is `mx-auto max-w-sm` (384px)
          inside 32px of padding each side, so the arch has to beat
          min(384, cardWidth - 64). 28rem with an 86% cap does: below a 457px
          card 0.86W is always more than W-64, and above it the arch is 448
          against the copy's 384. */}
      <div
        aria-hidden="true"
        className="arch-outline pointer-events-none absolute bottom-0 left-1/2 top-8 w-[28rem] max-w-[86%] -translate-x-1/2"
      />
      <div className="relative">
        <p className="font-display opsz-section text-xl leading-tight text-espresso">{title}</p>
        {description && (
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-espresso/80">{description}</p>
        )}
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
