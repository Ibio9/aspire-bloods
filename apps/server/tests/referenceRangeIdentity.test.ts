import { describe, it, expect } from 'vitest';
import {
  formatReferenceBound,
  formatReferenceRange,
  referenceBoundDecimals,
  roundReferenceBound,
  sameReferenceRange,
} from '@aspire-bloods/shared';

/**
 * WHETHER A REFERENCE RANGE CHANGED IS ONE QUESTION WITH ONE ANSWER.
 *
 * The trend chart draws a step, a dashed rule, a second pair of axis labels and a
 * sentence naming both ranges wherever a marker's range changes between two
 * results. All four have to fire together or none of them: a step drawn over two
 * ranges that print identically is a fault report rather than a fact, and a
 * change stated in words with no step under it is worse.
 *
 * So `sameReferenceRange` and the formatters are one mechanism, and what this
 * file pins is the relationship between them — a step exists if and only if the
 * two printed ranges differ.
 *
 * THE CASE IT WAS WRITTEN FOR, measured on a real row in the dev database: a
 * fasting glucose reported as 3.9–5.5 mmol/L on one report and 70–99 mg/dL on
 * the next. One interval, written twice. getMarkerTrendForPatient converts the
 * second into the marker's display unit with no rounding — deliberately, so a
 * band edge lands on the same axis as the point it is drawn against — which
 * yields 3.884960761896305–5.494444506110488. A float compare says those are two
 * ranges, so the chart stepped and printed:
 *
 *   "The lab's reference range changed during this period: 3.9–5.5 mmol/L up to
 *    1 January 2026, then 3.884960761896305–5.494444506110488 mmol/L from
 *    1 March 2026"
 *
 * with 5.494444506110488 also set as an inline axis label beside the plot.
 * Nothing had changed.
 */

/** The conversion factor the server actually uses (lib/unitConversion.ts). */
const MG_DL_PER_MMOL_L = 18.0182;

describe('reference bound precision', () => {
  it('takes its precision from each bound, not from the range', () => {
    // TSH is the case: a decimal floor and a whole-number-ish ceiling. Taking
    // the precision from the high bound alone rounds 0.27 and 0.34 to the same
    // 0.3 and hides a change that is real.
    expect(referenceBoundDecimals(0.27)).toBe(2);
    expect(referenceBoundDecimals(4.2)).toBe(1);
    expect(sameReferenceRange({ low: 0.27, high: 4.2 }, { low: 0.34, high: 4.2 })).toBe(false);
  });

  it('is coarse enough that a rounding is not a range change', () => {
    // Three significant figures would keep 5.494 apart from 5.500 and
    // reintroduce the whole problem. The ladder is deliberately coarser.
    expect(roundReferenceBound(5.494444506110488)).toBe(5.5);
    expect(roundReferenceBound(3.884960761896305)).toBe(3.9);
  });

  it('drops trailing zeros, so 0–3 is not printed as 0.00–3.00', () => {
    expect(formatReferenceBound(0)).toBe('0');
    expect(formatReferenceRange(0, 3)).toBe('0–3');
    expect(formatReferenceRange(20, 42, 'mmol/mol')).toBe('20–42 mmol/mol');
  });

  it('keeps the en dash a numeric range keeps everywhere else in the product', () => {
    expect(formatReferenceRange(3.9, 5.1)).toBe('3.9–5.1');
    expect(formatReferenceRange(3.9, 5.1)).toContain('–');
    expect(formatReferenceRange(3.9, 5.1)).not.toContain('-');
  });

  it('survives a bound with no useful magnitude rather than throwing', () => {
    // A range this code cannot place still has to render as something, because
    // every call site is inside a chart or a card that is already committed to
    // drawing. Total by construction, like statusPaint and bandLabel.
    expect(formatReferenceBound(Number.NaN)).toBe('');
    expect(formatReferenceBound(Number.POSITIVE_INFINITY)).toBe('');
    expect(referenceBoundDecimals(0)).toBe(0);
  });
});

describe('the same range written in two units is one range', () => {
  const asMmol = (mgDl: number) => mgDl / MG_DL_PER_MMOL_L;

  it('does not step between 3.9–5.5 mmol/L and 70–99 mg/dL', () => {
    const stored = { low: 3.9, high: 5.5 };
    const converted = { low: asMmol(70), high: asMmol(99) };
    // The exact numbers really are different — this is not a test that the
    // conversion is lossless, it is a test that the chart does not care.
    expect(converted.low).not.toBe(stored.low);
    expect(sameReferenceRange(stored, converted)).toBe(true);
  });

  it('prints the converted range as the range a reader would recognise', () => {
    expect(formatReferenceRange(asMmol(70), asMmol(99), 'mmol/L')).toBe('3.9–5.5 mmol/L');
  });

  it('still steps where the range genuinely moved', () => {
    // The three the demo history actually contains or used to.
    expect(sameReferenceRange({ low: 2, high: 25 }, { low: 2, high: 10 })).toBe(false);
    expect(sameReferenceRange({ low: 50, high: 250 }, { low: 75, high: 200 })).toBe(false);
    expect(sameReferenceRange({ low: 30, high: 400 }, { low: 20, high: 200 })).toBe(false);
  });

  it('agrees with what gets printed, in both directions', () => {
    const pairs: [{ low: number; high: number }, { low: number; high: number }][] = [
      [{ low: 3.9, high: 5.5 }, { low: asMmol(70), high: asMmol(99) }],
      [{ low: 2, high: 25 }, { low: 2, high: 10 }],
      [{ low: 0.27, high: 4.2 }, { low: 0.34, high: 4.2 }],
      [{ low: 20, high: 42 }, { low: 20, high: 42 }],
      [{ low: 0, high: 3 }, { low: 0, high: 3.001 }],
      [{ low: 135, high: 145 }, { low: 136, high: 145 }],
    ];
    // THE INVARIANT: identical printed ranges and no step are the same
    // condition. If these ever come apart, a chart says one thing with a rule
    // and the opposite with a sentence.
    for (const [a, b] of pairs) {
      const printsTheSame = formatReferenceRange(a.low, a.high) === formatReferenceRange(b.low, b.high);
      expect(sameReferenceRange(a, b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`).toBe(printsTheSame);
    }
  });
});
