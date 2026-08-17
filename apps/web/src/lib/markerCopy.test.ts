import { describe, expect, it } from 'vitest';
import {
  asMarkerStatus,
  bandGradientStops,
  bandRampStops,
  BAND_CONTRAST,
  CONTRAST_AT_BOUND,
  CONTRAST_AT_THRESHOLD,
  bandLabel,
  statusBands,
  TRANSITION_SHARE,
  countable,
  hasResultValue,
  MARKER_STATUSES,
  NO_STATUS_LABEL,
  statusPaint,
  type MarkerStatus,
  type MarkerStatusInput,
} from '@aspire-bloods/shared';
import {
  attentionRank,
  statusBarClass,
  statusColor,
  statusFilterCounts,
  statusHex,
  statusLabel,
  statusOutlineClass,
  statusToken,
  matchesStatusFilter,
  byAttentionThenName,
  STATUS_FILTERS,
} from './markerCopy';

const m = (status: MarkerStatusInput) => ({ status });

/**
 * One marker's geometry, in its own units, as every caller of `bandRampStops`
 * assembles it: a reference range, the distance out at which significantly-out
 * begins, and HALF a transition zone taken as a share of the drawn extent
 * rather than of the range. The numbers here are a plausible plot: a 3.9–5.1
 * range, a 1.8-wide severity step, and a domain of roughly 2–7.
 */
/**
 * The extent is the marker's OWN plot rather than a round number, because since
 * the transition went to 40% of it (Aug 2026) the two are no longer independent:
 * a fixture that gave a 1.2-wide range a 5-wide domain would ask for a half
 * transition of 1.0 either side of a bound 0.6 from the middle of its band, and
 * every stop below would come back clamped. This is what the chart actually
 * computes for a marker whose results all sit inside its range — the band plus
 * 30% of its own width at each end, so 1.92 — and the transition fits inside it
 * with room to spare.
 */
const RAMP = { low: 3.9, high: 5.1, threshold: 1.8, halfWidth: (1.92 * TRANSITION_SHARE) / 2 };

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
      expect(() => statusOutlineClass(s), where).not.toThrow();
      expect(() => statusBarClass(s), where).not.toThrow();
      expect(() => attentionRank(s), where).not.toThrow();
      expect(() => statusPaint(s), where).not.toThrow();
      expect(() => bandGradientStops(s), where).not.toThrow();
      expect(() => bandRampStops(s, RAMP), where).not.toThrow();
      expect(() => bandLabel(s), where).not.toThrow();
    }
  });

  it('gives the five their own colour, label and tint', () => {
    for (const s of MARKER_STATUSES) {
      expect(statusToken(s), s).not.toBeNull();
      expect(statusLabel(s), s).not.toBe(NO_STATUS_LABEL);
      // The WIDTH and the COLOUR, and neither is useful alone: the width is one
      // number for every surface that takes an outline, so the cards and the
      // at-a-glance strip read as one system. See statusOutlineClass.
      expect(statusOutlineClass(s), s).toMatch(/^status-outline border-outline-/);
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
      // No outline and no bar segment: the card keeps its ordinary hairline.
      expect(statusOutlineClass(s), where).toBe('');
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
      for (const role of ['surface', 'bar', 'band', 'fill', 'edge', 'mark'] as const) {
        expect(paint[role], `statusPaint(${String(s)}).${role}`).toMatch(/^rgb\(var\(--c-[a-z0-9-]+\)\)$/);
      }
      for (const stop of bandGradientStops(s)) {
        expect(stop, `bandGradientStops(${String(s)})`).toMatch(/^rgb\(var\(--c-[a-z0-9-]+\)\)$/);
      }
      // The band ramp both the chart and the range bars draw from, same claim.
      const stops = bandRampStops(s, RAMP);
      expect(stops.length, `bandRampStops(${String(s)})`).toBeGreaterThanOrEqual(2);
      for (const stop of stops) {
        expect(stop.colour, `bandRampStops(${String(s)}).colour`).toMatch(/^rgb\(var\(--c-[a-z0-9-]+\)\)$/);
        expect(Number.isFinite(stop.value), `bandRampStops(${String(s)}).value`).toBe(true);
        // A BAND IS OPAQUE, so a stop carries a colour and nothing else. An
        // `alpha`/`weight`/`opacity` reappearing on this shape is the
        // translucency coming back — the ladder lives in the colours now (see
        // BAND_CONTRAST), and a second place to state it is a second place for
        // it to disagree with itself.
        expect(Object.keys(stop).sort(), `bandRampStops(${String(s)}) stop shape`).toEqual(['colour', 'value']);
      }
      // Values run low to high, in order — the caller reverses them for a
      // chart's y-axis, and an unsorted list would reverse into nonsense.
      expect([...stops].sort((a, b) => a.value - b.value)).toEqual(stops);
      // A band with no words beside it is the "colour alone" failure the key
      // exists to prevent, so the label is never empty either.
      expect(bandLabel(s).length, `bandLabel(${String(s)})`).toBeGreaterThan(0);
    }
  });

  /**
   * THE RAMP IS AT THE BOUNDARY, AND IT IS CONTINUOUS ACROSS IT.
   *
   * Every claim here is about the seam between two bands, which is exactly what
   * neither tokenContrast.test.ts nor a screenshot can settle: the first
   * measures three representative colours and the second shows a picture in
   * which a one-pixel step and a smooth hand-over look identical.
   */
  describe('the chart band ramp', () => {
    /** A stop by the value it sits at, which is how both callers place them. */
    const at = (status: MarkerStatus, value: number) => {
      const stop = bandRampStops(status, RAMP).find((s) => Math.abs(s.value - value) < 1e-9);
      if (!stop) throw new Error(`no stop at ${value} for ${status}`);
      return stop;
    };

    it('puts the boundary at the MIDPOINT of its own blend, never at an edge of it', () => {
      // The whole claim the gradient makes: a result exactly on the limit is
      // drawn exactly half in each colour. That is true only if the flat part
      // of each band starts a half-transition away from the boundary and the
      // boundary itself carries the hinge.
      const half = RAMP.halfWidth;
      expect(at('IN_RANGE', RAMP.high).colour).toBe(at('HIGH', RAMP.high).colour);
      expect(at('IN_RANGE', RAMP.high - half).colour).toBe(at('IN_RANGE', RAMP.low + half).colour);
      expect(at('HIGH', RAMP.high + half).colour).toBe(at('LOW', RAMP.low - half).colour);
      // And the flat gold reaches to within a half-transition of BOTH of its
      // own boundaries, so the middle of "above range" is one colour.
      expect(at('HIGH', RAMP.high + RAMP.threshold - half).colour).toBe(at('HIGH', RAMP.high + half).colour);
    });

    it('hands over between two bands at exactly one colour', () => {
      // A visible step in the middle of a ramp that is meant to be continuous.
      // Both bands either side of a boundary have to name the same stop in the
      // same colour, which is what makes the fill continuous across a boundary
      // drawn as two separate shapes.
      for (const [a, b, value] of [
        ['IN_RANGE', 'HIGH', RAMP.high],
        ['IN_RANGE', 'LOW', RAMP.low],
        ['HIGH', 'SIGNIFICANT_HIGH', RAMP.high + RAMP.threshold],
        ['LOW', 'SIGNIFICANT_LOW', RAMP.low - RAMP.threshold],
      ] as const) {
        expect(at(a, value).colour, `${a}/${b}`).toBe(at(b, value).colour);
      }
    });

    it('hands over in a hinge hue, and neither hinge is ever a band on its own', () => {
      // Olive at the reference bound, orange at the threshold. Both are the
      // midpoint of a blend and neither is a state a result can be in, so
      // neither may be the colour of any flat region.
      const boundHinge = at('IN_RANGE', RAMP.high).colour;
      const thresholdHinge = at('HIGH', RAMP.high + RAMP.threshold).colour;
      expect(boundHinge).not.toBe(thresholdHinge);
      const flats = [
        at('IN_RANGE', RAMP.low + RAMP.halfWidth).colour,
        at('HIGH', RAMP.high + RAMP.halfWidth).colour,
        at('SIGNIFICANT_HIGH', RAMP.high + RAMP.threshold + RAMP.halfWidth).colour,
      ];
      for (const flat of flats) {
        expect(flat).not.toBe(boundHinge);
        expect(flat).not.toBe(thresholdHinge);
      }
      // And in range is one hue across its own flat middle: the resting state
      // reads as one region rather than as a vignette.
      expect(at('IN_RANGE', RAMP.low + RAMP.halfWidth).colour).toBe(at('IN_RANGE', RAMP.high - RAMP.halfWidth).colour);
    });

    it('walks five distinct rungs outward, each a colour of its own', () => {
      // THE LADDER IS IN THE COLOURS NOW (Aug 2026) rather than in a per-stop
      // alpha, so what this can assert here is that the five rungs are five
      // different tokens in the right sequence; that each is FURTHER from the
      // surface than the last is a fact about the token values and is measured
      // in apps/server/tests/tokenContrast.test.ts, which is the only place
      // that can see a hex.
      const rungs = [
        at('IN_RANGE', RAMP.low + RAMP.halfWidth).colour,
        at('IN_RANGE', RAMP.high).colour,
        at('HIGH', RAMP.high + RAMP.halfWidth).colour,
        at('HIGH', RAMP.high + RAMP.threshold).colour,
        at('SIGNIFICANT_HIGH', RAMP.high + RAMP.threshold + RAMP.halfWidth).colour,
      ];
      expect(new Set(rungs).size, `five rungs, ${new Set(rungs).size} colours`).toBe(5);
      expect(rungs).toEqual([
        'rgb(var(--c-hue-green-fill))',
        'rgb(var(--c-hue-olive-fill))',
        'rgb(var(--c-hue-yellow-fill))',
        'rgb(var(--c-hue-orange-fill))',
        'rgb(var(--c-hue-red-fill))',
      ]);
      // And the ladder the fills are solved against is itself rising, including
      // across the two derived hinges. `BAND_CONTRAST` is what tokens.ts solves
      // `BAND_FILL` to hit, so an edit that inverted a rung here would produce a
      // chart on which "further out" was drawn fainter.
      expect(BAND_CONTRAST.IN_RANGE).toBeLessThan(CONTRAST_AT_BOUND);
      expect(CONTRAST_AT_BOUND).toBeLessThan(BAND_CONTRAST.HIGH);
      expect(BAND_CONTRAST.HIGH).toBeLessThan(CONTRAST_AT_THRESHOLD);
      expect(CONTRAST_AT_THRESHOLD).toBeLessThan(BAND_CONTRAST.SIGNIFICANT_HIGH);
      // Direction is not carried by the ladder: above and below are one rung.
      expect(BAND_CONTRAST.LOW).toBe(BAND_CONTRAST.HIGH);
      expect(BAND_CONTRAST.SIGNIFICANT_LOW).toBe(BAND_CONTRAST.SIGNIFICANT_HIGH);
    });

    it('never emits stops out of order, however narrow the band', () => {
      // A range narrower than one transition zone. The flat part collapses to
      // the band's own midpoint rather than crossing itself, which is what
      // stops a gradient being handed a stop list that runs backwards.
      const narrow = { low: 10, high: 10.01, threshold: 0.005, halfWidth: 5 };
      for (const band of statusBands(narrow.low, narrow.high, narrow.threshold)) {
        const stops = bandRampStops(band.status, narrow);
        expect([...stops].sort((a, b) => a.value - b.value), band.status).toEqual(stops);
      }
    });

    /**
     * The two properties the widened transition turns on (Aug 2026). At 11% of
     * the extent neither could be violated by anything real; at 40% both are
     * one narrow marker away, so both are checked over a spread of geometries
     * rather than on the one plausible marker above.
     */
    const GEOMETRIES = [
      { name: 'a plausible plot', low: 3.9, high: 5.1, threshold: 1.8, extent: 5 },
      { name: 'a narrow range', low: 2, high: 10, threshold: 12, extent: 12.4 },
      { name: 'a wide range', low: 0, high: 999, threshold: 1498.5, extent: 1298.7 },
      { name: 'a tight threshold', low: 40, high: 60, threshold: 1, extent: 60 },
      { name: 'a tight range', low: 10, high: 10.4, threshold: 30, extent: 70 },
      { name: 'both tight', low: 10, high: 10.01, threshold: 0.005, extent: 40 },
    ];

    it('centres every blend on its own bound, so the hairline runs through the middle of it', () => {
      // THE CLAIM THE WHOLE GRADIENT MAKES: a result sitting exactly on the
      // limit is drawn exactly half in each colour. That only holds while the
      // two halves are equal — and the clamp used to be per BAND, which let a
      // bound with a wide band on one side and a narrow one on the other get
      // the full half-width downward and a clipped one upward. Invisible at
      // 11%; unmissable at 40%.
      for (const g of GEOMETRIES) {
        const halfWidth = (g.extent * TRANSITION_SHARE) / 2;
        const stops = (s: MarkerStatus) => bandRampStops(s, { ...g, halfWidth });
        const inRange = stops('IN_RANGE');
        const high = stops('HIGH');
        const low = stops('LOW');
        const sigHigh = stops('SIGNIFICANT_HIGH');
        const sigLow = stops('SIGNIFICANT_LOW');
        // The reference bounds: the flat green ends as far below the bound as
        // the flat gold begins above it.
        expect(g.high - inRange[2].value, `${g.name}: the blend at the upper bound`).toBeCloseTo(
          high[1].value - g.high,
          9,
        );
        expect(g.low - low[2].value, `${g.name}: the blend at the lower bound`).toBeCloseTo(
          inRange[1].value - g.low,
          9,
        );
        // The severity thresholds, which are open-ended outward.
        expect(g.high + g.threshold - high[2].value, `${g.name}: the blend at the upper threshold`).toBeCloseTo(
          sigHigh[1].value - (g.high + g.threshold),
          9,
        );
        expect(g.low - g.threshold - sigLow[0].value, `${g.name}: the blend at the lower threshold`).toBeCloseTo(
          low[1].value - (g.low - g.threshold),
          9,
        );
      }
    });

    it('stops each blend at the midpoint between two bounds rather than painting over its neighbour', () => {
      // Two boundaries close together must not have their zones cross. Each
      // takes at most half the gap to its neighbour, so at worst two blends
      // MEET at the midpoint — which is what the flat core collapsing to a
      // single point looks like, and is never a stop list running backwards or
      // one band's colour appearing on the far side of the next bound.
      for (const g of GEOMETRIES) {
        const halfWidth = (g.extent * TRANSITION_SHARE) / 2;
        for (const band of statusBands(g.low, g.high, g.threshold)) {
          const stops = bandRampStops(band.status, { ...g, halfWidth });
          const where = `${g.name} / ${band.status}`;
          // In order, and inside the band's own extent — a stop past either end
          // is a blend that has crossed a boundary.
          for (let i = 1; i < stops.length; i += 1) {
            expect(stops[i - 1].value, `${where}: stops out of order`).toBeLessThanOrEqual(stops[i].value);
          }
          if (band.from !== null) {
            expect(stops[0].value, `${where}: a stop below the band`).toBeGreaterThanOrEqual(band.from - 1e-9);
          }
          if (band.to !== null) {
            expect(stops[stops.length - 1].value, `${where}: a stop above the band`).toBeLessThanOrEqual(
              band.to + 1e-9,
            );
          }
        }
      }
    });

    it('keeps a flat core in the in-range band on an ordinary plot, and never an inverted one', () => {
      // THE WIDENING STOPS ONE STEP BEFORE THE CORES GO — "green still reads as
      // one region through its middle" — and the four geometries here are the
      // ones the share was swept against, at the domain the chart actually
      // computes for each. Measured as a share of the band's own width, so it
      // is a statement about what the reader sees rather than about units.
      const ORDINARY = [
        { name: 'RBC 3.8–5.8 reading 3.4', low: 3.8, high: 5.8, threshold: 3, extent: 3.7 },
        { name: 'GGT 0–60 reading 94', low: 0, high: 60, threshold: 90, extent: 112 },
        { name: 'a narrow 2–10', low: 2, high: 10, threshold: 12, extent: 12.4 },
        { name: 'a wide 0–999', low: 0, high: 999, threshold: 1498.5, extent: 1298.7 },
      ];
      for (const g of ORDINARY) {
        const halfWidth = (g.extent * TRANSITION_SHARE) / 2;
        const [, a, b] = bandRampStops('IN_RANGE', { ...g, halfWidth });
        const core = (b.value - a.value) / (g.high - g.low);
        expect(core, `${g.name}: the in-range core is ${(core * 100).toFixed(0)}% of the band`).toBeGreaterThan(0.15);
      }
      // And on a plot dominated by a huge excursion — where the in-range band is
      // a thin strip and the transition genuinely cannot fit inside it — the
      // core collapses to the band's own midpoint rather than inverting. A
      // gradient handed two stops in the wrong order is the failure; a thin
      // strip drawn entirely as a blend is not.
      for (const g of GEOMETRIES) {
        const halfWidth = (g.extent * TRANSITION_SHARE) / 2;
        const [, a, b] = bandRampStops('IN_RANGE', { ...g, halfWidth });
        expect(b.value - a.value, `${g.name}: the in-range core is inverted`).toBeGreaterThanOrEqual(0);
      }
    });
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
