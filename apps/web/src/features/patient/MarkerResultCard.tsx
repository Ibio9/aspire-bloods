import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  asMarkerStatus,
  NO_STATUS_LABEL,
  splitMarkerName,
  type MarkerStatusInput,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { MiniRangeBar } from '../../components/ui/RangeBar';
import type { MarkerNavState } from './markerNavState';

/**
 * One measured result, and the only way a measured result is drawn anywhere in
 * Results.
 *
 * Both arrangements use this: the markers on one opened report, and the every-
 * marker-ever list. They are the same object at two scopes, and they used to be
 * two components that had quietly diverged — a card in a three-column grid on
 * one screen, a four-column full-width row on the other, with the value at
 * different sizes, the range under different words and the status in a
 * different place. Nothing about "this report's ferritin" and "my ferritin"
 * justifies two visual languages.
 *
 * THE LAYOUT, top to bottom, and the order is the point:
 *
 *   1. The marker's name — the abbreviation on the strong line where it has
 *      one, the expansion beneath it. The only text above the bar.
 *   2. The range bar, with the result's position marked by a pointer above it.
 *   3. Everything else, in the order somebody reads it: the value with its
 *      unit, the status chevron and word, then the package and the date.
 *
 * The bar is second because it is the fastest thing on the card to read. On a
 * page of forty of these, "where does this sit" is answered by a shape before
 * any number is parsed, and the number underneath then says exactly where.
 *
 * ═══ WHAT CAME OFF, AND WHY EACH (Aug 2026) ═══════════════════════════════
 *
 * The brief was "remove these three, then go through what is left and cut
 * further; anything a patient does not need in order to read the result comes
 * off". Five lines went in total:
 *
 *  · "LAB REFERENCE RANGE 3.9–5.1 mmol/L". The bar directly above it draws
 *    that range, marks both bounds with ticks and prints the scale it is drawn
 *    on. The line was the same fact in figures under a picture of it — and it
 *    was the widest thing on the card, so it was setting the 15rem floor the
 *    grid is built to. It is still on the marker's own page, in the tooltip on
 *    every chart point, and in both PDFs.
 *  · "OPTIMAL BELOW 5.0 mmol/L · OUTSIDE OPTIMAL". Two facts, of which the
 *    second is the one that means anything on a card. A patient inside their
 *    optimal band needs no line at all; one outside it needs to know that, and
 *    the figures are on the marker page. So: **"Outside optimal", and nothing
 *    more**, and nothing at all when the answer is "within".
 *  · "3 RESULTS". A count of how many times this marker has been measured is a
 *    fact about the history, and the history is a click away with a chart on
 *    it. On a card about the LATEST result it was a number nobody could act on.
 *  · THE ONE-LINE NOTE (`note`). The catalogue's gloss, clamped to two lines,
 *    under a result — a definition truncated mid-sentence is worse than no
 *    definition, and the marker page carries the whole of it under a heading.
 *    The prop is gone rather than left unused, so nothing can pass one again.
 *  · "AMENDED 3 February 2026" stays, and is the one that was NOT cut. It is
 *    not context about the marker: it says this number changed after it was
 *    released to the patient, which is the one thing on the card that a reader
 *    who remembers a different figure needs.
 *
 * WHAT THE BAR REPLACED. A mini sparkline used to sit at the foot of the card
 * on the marker list. It answered a question about history at a size too small
 * to answer it honestly, and it was absent entirely on a report — so the two
 * screens ended up different shapes for no reason a reader could name. The bar
 * is on both, because every measured result has a position, and the history is
 * one click away on the marker's own page where there is room to plot it.
 */

/**
 * The grid. `auto-fill` with a floor rather than a column count at each
 * breakpoint, because the thing that decides how many cards fit is the width of
 * the CONTENT COLUMN, and that is not a function of the viewport alone — the
 * patient sidebar collapses from 288px to 84px, which is more than a whole
 * column's worth. Breakpoint-counted columns got that wrong in both directions:
 * three tall thin cards on a collapsed 1280 that had room for four, and 178px
 * cards at exactly 1024 where two would have read properly.
 *
 * 15rem is the floor at which the value, its unit and the reference range all
 * still sit on their own lines without hyphenating — a step up from 13.5rem,
 * because the bar needs enough width for its segments to be told apart and the
 * panel/date stack below it is three lines rather than one.
 */
export const MARKER_GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5';

/** What the card needs, and the intersection of what both views already carry. */
export interface MarkerCardResult {
  markerId: string;
  name: string;
  /**
   * Exactly one of value/valueText is set — valueText carries a textual lab
   * result ("< 0.6", "Not detected") verbatim.
   */
  value: number | null;
  valueText?: string | null;
  unit: string;
  referenceLow: number;
  referenceHigh: number;
  /** Where significantly-out begins for this marker — the bar's outer segments start here. */
  severityThreshold?: number | null;
  /**
   * Null when this result has no position on its reference range. The card then
   * shows the value and says so in words, with no tint, no bar, no shape mark
   * and no place in any count. It is never rendered as "In range".
   *
   * `MarkerStatusInput` rather than `MarkerStatus | null`: absent and
   * unrecognised are the same fact as null here, and writing the guard as
   * `!== null` is exactly what let the first of those through to a token
   * lookup. See asMarkerStatus.
   */
  status: MarkerStatusInput;
  /** Null for the majority of markers; nothing about optimal is shown for those. */
  optimal?: OptimalRangeDTO | null;
}

/**
 * THE PACKAGE AND THE DATE. Two facts, two lines, and the package is LABELLED.
 *
 * It was "Signature · 3 February 2026 · 3 results" on one middot-joined line,
 * then three unlabelled lines. Both had the same fault: "Signature" on its own
 * is a word with no job in the sentence, and a reader who has bought one test
 * has no reason to know it is the name of a package. So it says which:
 *
 *     Package: Signature
 *     3 February 2026
 *
 * The date keeps its own line and its mono face — it is data. "Package:" is
 * prose and is not mono. The result count is gone (see the note above).
 */
export interface MarkerCardMeta {
  /** Null on a report with no catalogue panel behind it — panels are optional. */
  panelName?: string | null;
  /** Already formatted for display — the card sets it in mono and nothing else. */
  sampleDate: string;
  /** The formatted date this result was corrected after release, where it was. */
  amendedDate?: string | null;
}

export function MarkerResultCard({
  marker: m,
  navState,
  meta,
  footer,
}: {
  marker: MarkerCardResult;
  /** Prev/next on the marker page walks the list this card came from. */
  navState?: MarkerNavState;
  /** The package and the date, under the status. */
  meta?: MarkerCardMeta;
  /** Anything a view needs to add below the rest. */
  footer?: ReactNode;
}) {
  // Narrowed once, and every "does this result have a status" question on the
  // card asks this rather than comparing against null.
  const status = asMarkerStatus(m.status);
  const hasRange = m.referenceHigh > m.referenceLow;
  // The abbreviation and what it stands for, where the name carries one — see
  // splitMarkerName, which refuses far more often than it splits.
  const name = splitMarkerName(m.name);
  return (
    <Link
      to={`/markers/${m.markerId}`}
      state={navState}
      className="block h-full rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
    >
      {/* The tint is a surface wash and nothing else: the border, the type and
          the shadow are the ordinary card's, and the border is the warm neutral
          hairline rather than anything in the status hue. The pointer, the
          chevron and the word below still carry the status on their own, in
          greyscale and to a colourblind reader. */}
      <Card interactive tint={status} padding="tight" className="flex h-full flex-col">
        {/* ── A MARKER'S NAME NEVER BREAKS MID-WORD (Aug 2026) ─────────────
            This carried `break-words` — `overflow-wrap: break-word` — which is
            a licence to hyphenate inside a word when one will not fit, and it
            was taken: `ALT (ALANINE AMINOTRANSFE / RASE)` on a result card, a
            marker's name split across three lines with a break in the middle of
            the analyte. A patient scanning a grid for "Aminotransferase" does
            not find it there, and a clinical name broken at an arbitrary letter
            reads as a rendering fault whatever the width.

            So it wraps at ORDINARY break opportunities only — spaces, and the
            hyphens and slashes that are already part of a name
            (`Gamma-Glutamyltransferase`, `Microalbumin/Creatinine Ratio`) — and
            where that needs another line the CARD GETS TALLER. A grid row is
            allowed to grow; a name is not allowed to be wrong.

            IT FITS, AND THAT IS MEASURED RATHER THAN HOPED. The longest atomic
            run in the catalogue is `Glutamyltransferase` at 19 characters,
            which at 12px with 0.14em of tracking is ~161px against the ~200px
            a 15rem card gives it. `e2e/marker-name-wrapping.spec.ts` renders
            the longest names in the catalogue at the narrowest card the product
            draws and checks that no word is broken and nothing paints outside
            the card.

            ── AND THE ABBREVIATION LEADS (Aug 2026) ─────────────────────────
            `ALT (ALANINE AMINOTRANSFERASE)` put the four letters a patient
            recognises first and then spent three more lines on the expansion,
            all at the same weight, inside brackets. Two lines instead: the
            abbreviation as the eyebrow, the expansion under it at the same
            12px floor, no uppercase and no tracking, so it reads as a gloss
            rather than as a second label competing with the first.
            Where a name has no abbreviation — which is most of them, and every
            one of the 207 foods — `splitMarkerName` returns the whole name and
            nothing is invented. */}
        <p className="eyebrow text-balance leading-snug">{name.primary}</p>
        {name.expansion && (
          // NOT `.sublabel`: that class is the label half of a pair inside an
          // explanation card, and this is a gloss on a heading. 12px is the
          // floor of the scale and /80 the floor of the opacity ladder, which
          // is as quiet as anything in this product is allowed to be.
          <p className="mt-1 text-xs leading-snug text-espresso/80">{name.expansion}</p>
        )}

        {/* A textual result has no position on a numeric scale, and a result
            with no status was never placed on one — the bar would be a guess
            in both cases, so it is simply not drawn and the card falls back to
            the words below. */}
        {m.value !== null && status !== null && hasRange && (
          <div className="mt-4">
            <MiniRangeBar
              value={m.value}
              low={m.referenceLow}
              high={m.referenceHigh}
              status={status}
              severityThreshold={m.severityThreshold}
            />
          </div>
        )}

        {/* flex-wrap: a textual result ("Not detected") at display size must
            wrap under itself, not push the unit out of the card. */}
        <p className="numeric tabular mt-4 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xl font-semibold leading-none text-espresso">
          <span className="break-words">{m.valueText ?? m.value}</span>
          <span className="text-sm font-normal text-espresso/80">{m.unit}</span>
        </p>

        {/* Absent, not blank, where there is no status: the words are below in
            place of the range, and no tint is applied to the card at all. */}
        {status !== null && <StatusBadge status={status} className="mt-2.5" />}

        {/* "LAB REFERENCE RANGE …" IS GONE (Aug 2026) — the bar two elements
            up draws that range, ticks both its bounds and prints the scale.
            What replaces it is nothing at all, because there was nothing left
            to say.

            The no-status line STAYS and is not the same kind of thing: it says
            the result was never compared to a range, which is the one case
            where the bar is absent and its absence needs a sentence. */}
        {status === null && <p className="mt-2.5 text-xs leading-snug text-espresso/80">{NO_STATUS_LABEL}</p>}

        {/* OPTIMAL: THE VERDICT ONLY, AND ONLY WHEN IT IS "OUTSIDE".
            "Optimal below 5.0 mmol/L · outside optimal" was the band's figures
            and the answer; a card needs the answer. Within optimal is the
            ordinary case and gets no line — the marker page carries the band
            and its source for anybody who wants them. */}
        {m.optimal?.within === false && (
          <p className="mt-1 text-xs leading-snug text-espresso/80">Outside optimal</p>
        )}

        {/* Package and date. Top-aligned, deliberately, and NOT pushed to the
            card's floor with mt-auto. Grid rows are as tall as their tallest
            card, and a marker whose name runs to three lines sets that height
            for everything beside it — so a floored block opened a hole in the
            middle of every shorter card in the row. Slack at the bottom of a
            short card reads as nothing at all. */}
        {meta && (
          <div className="mt-4 flex flex-col gap-0.5 text-xs leading-snug text-espresso/80">
            {/* "Package:" is prose and is not mono; the date is data and is. */}
            {meta.panelName && <span>Package: {meta.panelName}</span>}
            {meta.sampleDate && <span className="numeric">{meta.sampleDate}</span>}
            {meta.amendedDate && (
              <span>
                Amended <span className="numeric">{meta.amendedDate}</span>
              </span>
            )}
          </div>
        )}

        {footer && <div className="mt-3">{footer}</div>}
      </Card>
    </Link>
  );
}
