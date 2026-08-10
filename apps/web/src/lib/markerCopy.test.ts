import { describe, expect, it } from 'vitest';
import {
  asMarkerStatus,
  bandGradientStops,
  bandLabel,
  countable,
  hasResultValue,
  MARKER_STATUSES,
  NO_STATUS_LABEL,
  statusPaint,
  type MarkerStatusInput,
} from '@aspire-bloods/shared';
import {
  attentionRank,
  statusBarClass,
  statusColor,
  statusFilterCounts,
  statusHex,
  statusLabel,
  statusTintClass,
  statusToken,
  matchesStatusFilter,
  byAttentionThenName,
  STATUS_FILTERS,
} from './markerCopy';

const m = (status: MarkerStatusInput) => ({ status });

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
    for (const s of NOT_A_STATUS) {
      for (const f of STATUS_FILTERS) {
        expect(matchesStatusFilter(s, f.value), `${String(s)} / ${f.value}`).toBe(f.value === 'ALL');
      }
    }
  });

  /**
   * An unrecognised status must not be filed under "outside the usual range".
   * `status !== 'IN_RANGE'` is how that filter used to be spelled, and it is
   * true of every value the client cannot read — which would tell a patient to
   * look at a result on the strength of a string nobody could interpret.
   */
  it('never counts an unreadable status toward needs-attention', () => {
    const counts = statusFilterCounts([m('IN_RANGE'), m(undefined), ...UNRECOGNISED.map(m)]);
    expect(counts.ALL).toBe(2 + UNRECOGNISED.length);
    expect(counts.IN_RANGE).toBe(1);
    expect(counts.ATTENTION).toBe(0);
    // And no phantom key: every count is a real number, not the NaN that
    // `counts[unknownKey] += 1` produces and the picker renders as "(NaN)".
    for (const f of STATUS_FILTERS) expect(Number.isFinite(counts[f.value]), f.value).toBe(true);
    expect(Object.keys(counts).sort()).toEqual(STATUS_FILTERS.map((f) => f.value).sort());
  });

  it('drops a row with an unreadable status from anything that gets counted', () => {
    const rows = [
      { status: 'IN_RANGE' as MarkerStatusInput, value: 4.2, valueText: null },
      { status: undefined, value: 5.1, valueText: null },
      { status: 'NO_DATA' as unknown as MarkerStatusInput, value: 6.3, valueText: null },
      { status: 'HIGH' as MarkerStatusInput, value: 9.1, valueText: null },
    ];
    expect(countable(rows).map((r) => r.status)).toEqual(['IN_RANGE', 'HIGH']);
  });
});

/**
 * The crash this file now guards against.
 *
 * Every status-keyed lookup in the product is a `Record<MarkerStatus, …>`, and
 * every one of them used to be indexed with whatever the payload carried. A
 * `Record` does not throw on a bad key — it returns `undefined` — so the
 * failure surfaced one property access later, as
 * "Cannot read properties of undefined (reading 'cssVar')", inside StatusBadge,
 * once per unevaluated marker on the page. Three inputs produce it, and only
 * one of them was ever guarded:
 *
 *   null       — guarded, everywhere, since the no-data fix.
 *   undefined  — a payload with NO status key. `undefined !== null`, so every
 *                one of those guards waved it straight through.
 *   'ANYTHING' — a string outside the five: an older or newer API, a column
 *                that grew a value this build has no entry for.
 *
 * All three mean the same thing — this result was not placed against a range —
 * and all three must now produce the same calm, defined answer.
 */
const ABSENT: MarkerStatusInput[] = [null, undefined];
// Values a payload could genuinely carry that this build has no entry for.
// Cast at the boundary because that is exactly what apiFetch<T> does.
const UNRECOGNISED = ['NO_DATA', 'PENDING', 'in_range', '', 'IN RANGE'] as unknown as MarkerStatusInput[];
const NOT_A_STATUS: MarkerStatusInput[] = [...ABSENT, ...UNRECOGNISED];

describe('narrowing a status that came off the wire', () => {
  it('recognises each of the five and nothing else', () => {
    for (const s of MARKER_STATUSES) expect(asMarkerStatus(s), s).toBe(s);
    for (const s of NOT_A_STATUS) expect(asMarkerStatus(s), String(s)).toBeNull();
    // Not merely "not a string" — a shape nobody expected is still absence.
    for (const s of [0, 1, {}, [], true, NaN]) expect(asMarkerStatus(s), String(s)).toBeNull();
  });

  it('never invents a status: absence stays absence rather than defaulting into the five', () => {
    // The original defect in one line. IN_RANGE is the answer this must never
    // give, because "we could not place this" said as "in range" is a claim
    // about someone's health that nobody made.
    for (const s of NOT_A_STATUS) expect(asMarkerStatus(s)).not.toBe('IN_RANGE');
  });
});

describe('every lookup keyed on status is total', () => {
  /**
   * The whole point: called with anything at all, none of these throws. The
   * five keep their existing answers; everything else gets the absence answer,
   * which is "no traffic light" and never a sixth one.
   */
  it('answers for all five states, for null, for undefined and for a string it has never seen', () => {
    for (const s of [...MARKER_STATUSES, ...NOT_A_STATUS]) {
      const where = `status=${String(s)}`;
      expect(() => statusToken(s), where).not.toThrow();
      expect(() => statusLabel(s), where).not.toThrow();
      expect(() => statusColor(s), where).not.toThrow();
      expect(() => statusHex(s), where).not.toThrow();
      expect(() => statusTintClass(s), where).not.toThrow();
      expect(() => statusBarClass(s), where).not.toThrow();
      expect(() => attentionRank(s), where).not.toThrow();
      expect(() => statusPaint(s), where).not.toThrow();
      expect(() => bandGradientStops(s), where).not.toThrow();
      expect(() => bandLabel(s), where).not.toThrow();
    }
  });

  it('gives the five their own colour, label and tint', () => {
    for (const s of MARKER_STATUSES) {
      expect(statusToken(s), s).not.toBeNull();
      expect(statusLabel(s), s).not.toBe(NO_STATUS_LABEL);
      expect(statusTintClass(s), s).toMatch(/^bg-tint-/);
      expect(statusBarClass(s), s).toMatch(/^bg-tint-.*-bar/);
    }
    // Five states, three hues: direction is carried by the word and the mark,
    // never by the colour, so the pairs resolve to the same tone. (Each keeps
    // its own custom property — a component asks for "the above-range colour",
    // not for "the yellow" — so this is checked on the hex the property holds.)
    expect(statusHex('HIGH')).toBe(statusHex('LOW'));
    expect(statusHex('SIGNIFICANT_HIGH')).toBe(statusHex('SIGNIFICANT_LOW'));
  });

  it('gives absence the words and no traffic light', () => {
    for (const s of NOT_A_STATUS) {
      const where = `status=${String(s)}`;
      expect(statusToken(s), where).toBeNull();
      expect(statusLabel(s), where).toBe(NO_STATUS_LABEL);
      // No wash and no bar segment — the card keeps the ordinary cream surface.
      expect(statusTintClass(s), where).toBe('');
      expect(statusBarClass(s), where).toBe('');
      // A colour it can actually paint with, and not one of the three hues.
      expect(statusColor(s), where).toMatch(/^rgb\(var\(--c-[a-z0-9-]+\)\)$/);
      expect(statusColor(s), where).not.toBe(statusColor('IN_RANGE'));
      // And it sorts last, behind everything with a finding.
      expect(attentionRank(s), where).toBeGreaterThan(attentionRank('IN_RANGE'));
    }
  });

  it('returns real colour values from the chart lookups rather than undefined', () => {
    // `undefined` in an SVG fill or a gradient stop is not an error, which is
    // worse: the browser drops the declaration and the band renders black.
    for (const s of [...MARKER_STATUSES, ...NOT_A_STATUS]) {
      const paint = statusPaint(s);
      for (const role of ['surface', 'bar', 'band', 'edge', 'mark'] as const) {
        expect(paint[role], `statusPaint(${String(s)}).${role}`).toMatch(/^rgb\(var\(--c-[a-z0-9-]+\)\)$/);
      }
      for (const stop of bandGradientStops(s)) {
        expect(stop, `bandGradientStops(${String(s)})`).toMatch(/^rgb\(var\(--c-[a-z0-9-]+\)\)$/);
      }
      // A band with no words beside it is the "colour alone" failure the key
      // exists to prevent, so the label is never empty either.
      expect(bandLabel(s).length, `bandLabel(${String(s)})`).toBeGreaterThan(0);
    }
  });

  it('sorts a list containing an unrecognised status instead of leaving it unsorted', () => {
    // `undefined - 2` is NaN, and a comparator returning NaN leaves the array
    // in whatever order the sort happened to walk it — one bad row silently
    // unsorted the whole marker list.
    const rows = [
      { status: 'NO_DATA' as unknown as MarkerStatusInput, name: 'Echo' },
      { status: 'IN_RANGE' as const, name: 'Bravo' },
      { status: undefined, name: 'Alpha' },
      { status: 'SIGNIFICANT_HIGH' as const, name: 'Charlie' },
    ];
    expect([...rows].sort(byAttentionThenName).map((r) => r.name)).toEqual([
      'Charlie',
      'Bravo',
      'Alpha',
      'Echo',
    ]);
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
