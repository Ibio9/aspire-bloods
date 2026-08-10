import { describe, expect, it } from 'vitest';
import { countable, hasResultValue, type MarkerStatus } from '@aspire-bloods/shared';
import { statusFilterCounts, matchesStatusFilter, byAttentionThenName, STATUS_FILTERS } from './markerCopy';

const m = (status: MarkerStatus | null) => ({ status });

describe('statusFilterCounts', () => {
  it('counts every filter in one pass, matching the per-filter predicate', () => {
    const markers = [
      m('IN_RANGE'),
      m('IN_RANGE'),
      m('HIGH'),
      m('LOW'),
      m('SIGNIFICANT_HIGH'),
      m('SIGNIFICANT_LOW'),
      m('SIGNIFICANT_LOW'),
    ];
    const counts = statusFilterCounts(markers);

    // The whole point: the fast single-pass count must equal the filter it replaced.
    for (const f of STATUS_FILTERS) {
      const viaFilter = markers.filter((x) => matchesStatusFilter(x.status, f.value)).length;
      expect(counts[f.value], f.value).toBe(viaFilter);
    }

    expect(counts.ALL).toBe(7);
    expect(counts.IN_RANGE).toBe(2);
    // ATTENTION is everything not in range.
    expect(counts.ATTENTION).toBe(5);
    expect(counts.SIGNIFICANT_LOW).toBe(2);
  });

  it('is all-zero (bar ALL) for an empty list', () => {
    const counts = statusFilterCounts([]);
    expect(counts.ALL).toBe(0);
    expect(counts.ATTENTION).toBe(0);
    expect(counts.IN_RANGE).toBe(0);
  });

  /**
   * A result with no status is not in range and is not outside it. Counting it
   * as either is the original defect arriving by a different route — through
   * the summary rather than through the status column — and it lands on "in
   * range" the moment anything computes it by subtraction.
   */
  it('never lets a statusless result land in the in-range tally', () => {
    const markers = [m('IN_RANGE'), m('HIGH'), m(null), m(null)];
    const counts = statusFilterCounts(markers);

    expect(counts.ALL).toBe(4);
    expect(counts.IN_RANGE).toBe(1);
    expect(counts.ATTENTION).toBe(1);
    // The two statusless rows are in neither, so the two do not add to ALL.
    expect(counts.IN_RANGE + counts.ATTENTION).toBe(2);
    // And the subtraction that used to produce the bug now gives the wrong
    // answer loudly rather than the right-looking one quietly.
    expect(counts.ALL - counts.ATTENTION).not.toBe(counts.IN_RANGE);
  });

  it('shows a statusless result under "All markers" and under no other filter', () => {
    for (const f of STATUS_FILTERS) {
      expect(matchesStatusFilter(null, f.value), f.value).toBe(f.value === 'ALL');
    }
  });
});

describe('needs-attention ordering', () => {
  it('sorts statusless results last, behind everything with a finding', () => {
    const rows = [
      { status: null, name: 'Alpha' },
      { status: 'IN_RANGE' as const, name: 'Bravo' },
      { status: 'SIGNIFICANT_HIGH' as const, name: 'Charlie' },
      { status: 'LOW' as const, name: 'Delta' },
    ];
    expect([...rows].sort(byAttentionThenName).map((r) => r.name)).toEqual([
      'Charlie',
      'Delta',
      'Bravo',
      'Alpha',
    ]);
  });
});

describe('what counts as a result at all', () => {
  it('treats a marker with neither a number nor lab text as nothing to render', () => {
    expect(hasResultValue({ value: null, valueText: null })).toBe(false);
    expect(hasResultValue({ value: null, valueText: '   ' })).toBe(false);
    expect(hasResultValue({ value: null })).toBe(false);
    // Both of these are real results and must survive.
    expect(hasResultValue({ value: 0, valueText: null })).toBe(true);
    expect(hasResultValue({ value: null, valueText: 'Not detected' })).toBe(true);
  });

  it('drops statusless and valueless rows from anything that gets counted', () => {
    const rows = [
      { status: 'IN_RANGE' as const, value: 4.2, valueText: null },
      { status: null, value: null, valueText: 'Not detected' },
      { status: null, value: null, valueText: null },
      { status: 'HIGH' as const, value: 9.1, valueText: null },
    ];
    expect(countable(rows).map((r) => r.status)).toEqual(['IN_RANGE', 'HIGH']);
  });
});
