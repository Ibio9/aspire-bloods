import { describe, it, expect } from 'vitest';
import {
  classifyValue,
  resolveResultRange,
  deriveStatus,
  statusForStorage,
  disagreesWithLabIndicator,
} from '../src/lib/deriveResultStatus.js';
import { decodeResultValue } from '../src/lib/resultValue.js';
import { hasResultValue } from '@aspire-bloods/shared';

const SEVERITY = { severityMultiplier: 1.5, severityAbsoluteDelta: null };

describe('classifyValue', () => {
  it('reads a plain number as numeric', () => {
    expect(classifyValue(4.2, null)).toEqual({ kind: 'numeric', value: 4.2 });
  });

  it('reads a numeric string as numeric', () => {
    expect(classifyValue(null, '4.2')).toEqual({ kind: 'numeric', value: 4.2 });
  });

  it.each([
    ['< 5.0', '<', 5],
    ['<5.0', '<', 5],
    ['≤5.0', '<=', 5],
    ['> 40', '>', 40],
    ['≥60', '>=', 60],
  ])('reads %s as a comparator', (text, operator, bound) => {
    const result = classifyValue(null, text);
    expect(result).toMatchObject({ kind: 'comparator', operator, bound });
  });

  it('reads a qualitative outcome as qualitative', () => {
    expect(classifyValue(null, 'Not detected')).toEqual({ kind: 'qualitative', text: 'Not detected' });
  });

  it('reports nothing usable as absent rather than guessing zero', () => {
    expect(classifyValue(null, null)).toEqual({ kind: 'absent' });
    expect(classifyValue(null, '   ')).toEqual({ kind: 'absent' });
  });
});

describe('resolveResultRange precedence', () => {
  const fallback = { low: 1, high: 9, unit: 'mmol/L' };

  it('prefers the range printed on the result over the marker fallback', () => {
    expect(resolveResultRange({ low: 2, high: 8, unit: 'mmol/L' }, fallback, null)).toEqual({
      status: 'resolved',
      source: 'result',
      low: 2,
      high: 8,
      unit: 'mmol/L',
    });
  });

  it('falls back to the marker range only when the result carries none', () => {
    expect(resolveResultRange({ low: null, high: null, unit: null }, fallback, null)).toMatchObject({
      status: 'resolved',
      source: 'marker_fallback',
      low: 1,
      high: 9,
    });
  });

  it('treats a one-sided range on the result as no range, so the fallback applies', () => {
    expect(resolveResultRange({ low: null, high: 5, unit: 'mmol/L' }, fallback, null)).toMatchObject({
      source: 'marker_fallback',
    });
  });

  it('invents nothing when neither source has a range', () => {
    const resolved = resolveResultRange({ low: null, high: null, unit: null }, null, null);
    expect(resolved.status).toBe('missing');
  });

  it('carries the fallback lookup’s own reason when it declined to answer', () => {
    const resolved = resolveResultRange({ low: null, high: null, unit: null }, null, 'No sex on file.');
    expect(resolved).toEqual({ status: 'missing', reason: 'No sex on file.' });
  });
});

describe('deriveStatus', () => {
  it('places a plain number against the range', () => {
    expect(deriveStatus({ kind: 'numeric', value: 5 }, 2, 8, SEVERITY)).toEqual({ status: 'derived', value: 'IN_RANGE' });
    expect(deriveStatus({ kind: 'numeric', value: 9 }, 2, 8, SEVERITY)).toEqual({ status: 'derived', value: 'HIGH' });
  });

  it('places "< 5.0" in range against a 0–5.0 range', () => {
    const result = deriveStatus({ kind: 'comparator', operator: '<', bound: 5, text: '< 5.0' }, 0, 5, SEVERITY);
    expect(result).toEqual({ status: 'derived', value: 'IN_RANGE' });
  });

  it('places "< 2.0" below a 2.0–8.0 range', () => {
    const result = deriveStatus({ kind: 'comparator', operator: '<', bound: 2, text: '< 2.0' }, 2, 8, SEVERITY);
    expect(result).toMatchObject({ status: 'derived' });
    expect(result).not.toEqual({ status: 'derived', value: 'IN_RANGE' });
  });

  it('places "> 40" above a 0–40 range', () => {
    const result = deriveStatus({ kind: 'comparator', operator: '>', bound: 40, text: '> 40' }, 0, 40, SEVERITY);
    expect(result).toMatchObject({ status: 'derived' });
    if (result.status === 'derived') expect(['HIGH', 'SIGNIFICANT_HIGH']).toContain(result.value);
  });

  it('refuses to place a limit that straddles the range', () => {
    // "< 5.0" against 2.0–8.0 could be in range or below it. Neither is knowable.
    const result = deriveStatus({ kind: 'comparator', operator: '<', bound: 5, text: '< 5.0' }, 2, 8, SEVERITY);
    expect(result.status).toBe('unevaluable');
  });

  it('never coerces a limit into its bound', () => {
    // If "< 5.0" were read as 5.0 this would come back IN_RANGE against 4.9–5.1.
    const result = deriveStatus({ kind: 'comparator', operator: '<', bound: 5, text: '< 5.0' }, 4.9, 5.1, SEVERITY);
    expect(result.status).toBe('unevaluable');
  });

  it('marks a qualitative result unevaluable rather than in range', () => {
    const result = deriveStatus({ kind: 'qualitative', text: 'Not detected' }, 0, 5, SEVERITY);
    expect(result.status).toBe('unevaluable');
  });
});

/**
 * The regression this file exists to make permanent.
 *
 * A marker with no result was being shown to patients as "In range", complete
 * with the green wash — because the verify path finished with
 * `derived.status === 'derived' ? derived.value : 'IN_RANGE'`, which spells
 * "we could not work out where this sits, so say it is fine". Telling somebody
 * a test they never had came back normal is the one output a results portal
 * must not be able to produce, so it is pinned from three directions: the
 * classifier, the storage conversion, and the exhaustive sweep at the end.
 */
describe('absence of data can never become IN_RANGE', () => {
  const ABSENT_INPUTS: [string, string | null][] = [
    ['a null value', null],
    ['an empty string', ''],
    ['whitespace only', '   '],
  ];

  it.each(ABSENT_INPUTS)('classifies %s as absent, not as a number', (_label, text) => {
    expect(classifyValue(null, text)).toEqual({ kind: 'absent' });
  });

  it.each(ABSENT_INPUTS)('derives no status at all from %s', (_label, text) => {
    const classified = classifyValue(null, text);
    const derived = deriveStatus(classified, 2, 8, SEVERITY);
    expect(derived.status).toBe('unevaluable');
    expect(statusForStorage(derived)).toBeNull();
  });

  it('stores null, never IN_RANGE, for every unevaluable derivation', () => {
    const unevaluable = [
      classifyValue(null, null),
      classifyValue(null, ''),
      classifyValue(null, 'Not detected'),
      classifyValue(null, 'Insufficient sample'),
      // A limit that straddles the range: could be in range or below it.
      classifyValue(null, '< 5.0'),
    ];
    for (const value of unevaluable) {
      const stored = statusForStorage(deriveStatus(value, 2, 8, SEVERITY));
      expect(stored).not.toBe('IN_RANGE');
      expect(stored).toBeNull();
    }
  });

  it('reads a stored placeholder back as no value rather than as lab text', () => {
    // What the old write path actually persisted for a valueless row:
    // `encryptField(String(undefined))`. Read back as text it became a result
    // called "undefined" carrying a status of IN_RANGE.
    for (const stored of ['null', 'undefined', '', '  ', 'N/A', '—', 'Not performed']) {
      const decoded = decodeResultValue(stored);
      expect(decoded).toEqual({ value: null, valueText: null });
      expect(hasResultValue(decoded), `"${stored}" must not count as a result`).toBe(false);
    }
  });

  it('still keeps a genuinely qualitative result, which is data', () => {
    const decoded = decodeResultValue('Not detected');
    expect(decoded).toEqual({ value: null, valueText: 'Not detected' });
    expect(hasResultValue(decoded)).toBe(true);
    // It has a value and still has no status. Those are two different things.
    expect(statusForStorage(deriveStatus(classifyValue(null, 'Not detected'), 0, 5, SEVERITY))).toBeNull();
  });

  it('only ever produces IN_RANGE from a value actually inside the range', () => {
    // The whole surface, swept: every input shape the classifier can produce,
    // and the only ones that come back IN_RANGE are the two that genuinely sit
    // inside 2–8.
    const cases: [string | null, boolean][] = [
      ['5', true],
      ['2', true],
      ['9', false],
      ['1', false],
      ['Not detected', false],
      ['< 5.0', false],
      ['> 40', false],
      ['', false],
      ['   ', false],
      [null, false],
    ];
    for (const [text, expectedInRange] of cases) {
      const stored = statusForStorage(deriveStatus(classifyValue(null, text), 2, 8, SEVERITY));
      expect(stored === 'IN_RANGE', `"${text}" produced ${stored}`).toBe(expectedInRange);
    }
  });
});

describe('disagreesWithLabIndicator', () => {
  it('flags a lab "H" against our IN_RANGE', () => {
    expect(disagreesWithLabIndicator('H', 'IN_RANGE')).toBe(true);
  });

  it('accepts a lab "H" against our HIGH and SIGNIFICANT_HIGH', () => {
    expect(disagreesWithLabIndicator('H', 'HIGH')).toBe(false);
    expect(disagreesWithLabIndicator('High', 'SIGNIFICANT_HIGH')).toBe(false);
  });

  it('flags a lab normal against any out-of-range status', () => {
    expect(disagreesWithLabIndicator('N', 'LOW')).toBe(true);
    expect(disagreesWithLabIndicator('Normal', 'IN_RANGE')).toBe(false);
  });

  it('treats an absent or unrecognised indicator as neither agreement nor disagreement', () => {
    expect(disagreesWithLabIndicator(null, 'HIGH')).toBe(false);
    expect(disagreesWithLabIndicator('¿', 'HIGH')).toBe(false);
  });
});
