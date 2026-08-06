import { describe, it, expect } from 'vitest';
import {
  parseRandoxValue,
  parseReferenceRange,
  normaliseLabIndicator,
  labStatusDisagrees,
} from '../src/modules/randox/clients/parseResult.js';

/**
 * Randox type `result`, `refLow` and `refHigh` as strings, and genuinely
 * send comparators and qualitative text through them. The one rule these
 * tests exist to hold: a non-numeric value NEVER becomes a number.
 */

describe('parseRandoxValue', () => {
  it('reads a plain number', () => {
    const parsed = parseRandoxValue('5.85');
    expect(parsed.kind).toBe('numeric');
    expect(parsed.value).toBe(5.85);
  });

  it('keeps zero, which is a real result', () => {
    expect(parseRandoxValue('0').value).toBe(0);
  });

  // The single most important assertion in this file. "< 5.0" means the
  // true value is below a detection limit; recording 5.0 would put a number
  // on a patient's record that the lab did not measure, and then plot it.
  it('never turns a comparator into its bound', () => {
    const parsed = parseRandoxValue('< 5.0');
    expect(parsed.kind).toBe('comparator');
    expect(parsed.value).toBeNull();
    expect(parsed.operator).toBe('<');
    expect(parsed.bound).toBe(5);
    expect(parsed.text).toBe('< 5.0');
  });

  it('handles every comparator spelling a lab might use', () => {
    for (const raw of ['>40', '> 40', '≥40', '>=40', '=>40']) {
      const parsed = parseRandoxValue(raw);
      expect(parsed.kind).toBe('comparator');
      expect(parsed.value).toBeNull();
      expect(parsed.bound).toBe(40);
    }
    for (const raw of ['<0.3', '≤0.3', '<=0.3', '=<0.3']) {
      expect(parseRandoxValue(raw).bound).toBe(0.3);
    }
  });

  it('treats qualitative text as text, with no value', () => {
    for (const raw of ['Not detected', 'Reactive', 'See comment']) {
      const parsed = parseRandoxValue(raw);
      expect(parsed.kind).toBe('qualitative');
      expect(parsed.value).toBeNull();
      expect(parsed.text).toBe(raw);
    }
  });

  it('treats an empty or missing field as absent, not as zero', () => {
    for (const raw of ['', '   ', null, undefined]) {
      const parsed = parseRandoxValue(raw);
      expect(parsed.kind).toBe('absent');
      expect(parsed.value).toBeNull();
    }
  });

  // A unit smuggled into the value field is a data problem an admin should
  // see, not something to strip and hope the units column agreed.
  it('does not strip a unit off a value', () => {
    expect(parseRandoxValue('5.85 mmol/l').kind).toBe('qualitative');
    expect(parseRandoxValue('5.85 mmol/l').value).toBeNull();
  });

  it('does not accept a comparator with no number after it', () => {
    const parsed = parseRandoxValue('< LOD');
    expect(parsed.kind).toBe('qualitative');
    expect(parsed.value).toBeNull();
  });
});

describe('parseReferenceRange', () => {
  it('reads a plain two-sided range', () => {
    const range = parseReferenceRange('130.0', '180.0');
    expect(range.low).toBe(130);
    expect(range.high).toBe(180);
    expect(range.oneSided).toBe(false);
  });

  // Real, from the example patient report: Total Cholesterol is
  // "<5.0 Desirable / ≥5.0 High" — a high bound with no low.
  it('reports a one-sided range as one-sided rather than inventing the other end', () => {
    const range = parseReferenceRange('', '5.0');
    expect(range.low).toBeNull();
    expect(range.high).toBe(5);
    expect(range.oneSided).toBe(true);
  });

  // eGFR on the same report: "≥60 Satisfactory".
  it('folds a comparator on a BOUND into that bound', () => {
    const range = parseReferenceRange('≥60', '');
    expect(range.low).toBe(60);
    expect(range.high).toBeNull();
    expect(range.oneSided).toBe(true);
  });

  it('keeps the originals for display', () => {
    const range = parseReferenceRange('≥60', null);
    expect(range.lowRaw).toBe('≥60');
    expect(range.highRaw).toBeNull();
  });

  it('reports a wholly absent range as neither one-sided nor usable', () => {
    const range = parseReferenceRange(null, null);
    expect(range.low).toBeNull();
    expect(range.high).toBeNull();
    expect(range.oneSided).toBe(false);
  });
});

describe('normaliseLabIndicator', () => {
  it('reads the shapes labs actually use', () => {
    expect(normaliseLabIndicator('H')).toBe('HIGH');
    expect(normaliseLabIndicator('high')).toBe('HIGH');
    expect(normaliseLabIndicator('L')).toBe('LOW');
    expect(normaliseLabIndicator('N')).toBe('NORMAL');
  });

  // An unrecognised indicator must not become "normal" — that would be
  // reassurance we haven't earned.
  it('returns null for anything it does not recognise', () => {
    expect(normaliseLabIndicator('***')).toBeNull();
    expect(normaliseLabIndicator('PANIC')).toBeNull();
    expect(normaliseLabIndicator(null)).toBeNull();
    expect(normaliseLabIndicator('')).toBeNull();
  });
});

describe('labStatusDisagrees', () => {
  it('agrees when both say high', () => {
    expect(labStatusDisagrees('HIGH', 'HIGH')).toBe(false);
    expect(labStatusDisagrees('HIGH', 'SIGNIFICANT_HIGH')).toBe(false);
  });

  it('agrees when both say in range', () => {
    expect(labStatusDisagrees('NORMAL', 'IN_RANGE')).toBe(false);
  });

  it('flags the lab saying normal where we compute out of range', () => {
    expect(labStatusDisagrees('NORMAL', 'HIGH')).toBe(true);
    expect(labStatusDisagrees('NORMAL', 'LOW')).toBe(true);
  });

  it('flags the lab saying high where we compute in range', () => {
    expect(labStatusDisagrees('HIGH', 'IN_RANGE')).toBe(true);
    expect(labStatusDisagrees('LOW', 'IN_RANGE')).toBe(true);
  });

  it('flags high against low', () => {
    expect(labStatusDisagrees('HIGH', 'LOW')).toBe(true);
  });

  // No opinion is not disagreement.
  it('does not flag when the lab said nothing', () => {
    expect(labStatusDisagrees(null, 'HIGH')).toBe(false);
    expect(labStatusDisagrees(null, 'IN_RANGE')).toBe(false);
  });
});
