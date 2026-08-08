import { describe, expect, it } from 'vitest';
import type { MarkerStatus } from '@aspire-bloods/shared';
import { statusFilterCounts, matchesStatusFilter, STATUS_FILTERS } from './markerCopy';

const m = (status: MarkerStatus) => ({ status });

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
});
