import { describe, it, expect } from 'vitest';
import { pick, pickString, pickNumber, pickCodeList, pickArray, toUtcIso, fromEuropeLondon } from '../src/modules/randox/clients/parse.js';

/**
 * The response readers are deliberately tolerant because we could not
 * confirm Randox's property casing or envelope shape from anything we have.
 * These tests pin the tolerance itself — particularly around code lists,
 * where reading the shape wrongly would drop a void code, and timestamps,
 * where reading it wrongly silently shifts appointments by an hour.
 */

describe('property readers', () => {
  it('reads a property whatever its casing', () => {
    expect(pickString({ OrderNumber: 'A1' }, 'orderNumber')).toBe('A1');
    expect(pickString({ ordernumber: 'A1' }, 'orderNumber')).toBe('A1');
  });

  it('falls through alternative spellings in order', () => {
    expect(pickString({ orderNo: 'B2' }, 'orderNumber', 'orderNo')).toBe('B2');
  });

  it('treats an empty string as absent rather than as a value', () => {
    expect(pickString({ name: '   ' }, 'name')).toBeNull();
  });

  it('skips null and undefined and keeps looking', () => {
    expect(pickString({ a: null, b: 'x' }, 'a', 'b')).toBe('x');
    expect(pick({ a: undefined }, 'a')).toBeUndefined();
  });

  it('coerces numeric strings but not junk', () => {
    expect(pickNumber({ v: '4.2' }, 'v')).toBe(4.2);
    expect(pickNumber({ v: 'n/a' }, 'v')).toBeNull();
    expect(pickNumber({ v: '' }, 'v')).toBeNull();
  });

  it('keeps zero, which is a real result value', () => {
    expect(pickNumber({ v: 0 }, 'v')).toBe(0);
  });
});

describe('pickCodeList', () => {
  // Getting any of these wrong drops a void code, which puts an
  // unreportable number in front of a patient.
  it('reads an array of strings', () => {
    expect(pickCodeList({ voidCodes: ['A', 'B'] }, 'voidCodes')).toEqual(['A', 'B']);
  });

  it('reads an array of objects', () => {
    expect(pickCodeList({ voidCodes: [{ code: 'A' }, { Code: 'B' }] }, 'voidCodes')).toEqual(['A', 'B']);
  });

  it('reads a delimited string', () => {
    expect(pickCodeList({ voidCodes: 'A, B; C' }, 'voidCodes')).toEqual(['A', 'B', 'C']);
  });

  it('returns an empty list when the field is absent', () => {
    expect(pickCodeList({}, 'voidCodes')).toEqual([]);
  });

  it('drops empty entries rather than emitting blank codes', () => {
    expect(pickCodeList({ voidCodes: ['A', '', '  '] }, 'voidCodes')).toEqual(['A']);
  });
});

describe('pickArray', () => {
  it('accepts a bare array', () => {
    expect(pickArray([1, 2], 'results')).toEqual([1, 2]);
  });

  it('unwraps the named property', () => {
    expect(pickArray({ results: [1] }, 'results')).toEqual([1]);
  });

  it('unwraps a common envelope', () => {
    expect(pickArray({ data: [1] }, 'results')).toEqual([1]);
    expect(pickArray({ data: { results: [2] } }, 'results')).toEqual([2]);
  });

  it('yields an empty list rather than throwing on an unexpected shape', () => {
    expect(pickArray({ nope: 1 }, 'results')).toEqual([]);
  });
});

describe('fromEuropeLondon', () => {
  /**
   * GetOrderResultDetail states it verbatim: "DateOfReceipt & DateOfReport
   * will be returned in Europe/London timezone. All other times will be
   * UTC." Reading a London wall-clock time as UTC shifts it an hour for
   * seven months of the year — and near midnight that changes the calendar
   * date on the report.
   */
  it('treats a summer wall-clock time as BST (UTC+1)', () => {
    expect(fromEuropeLondon('2026-07-01T09:30:00')).toBe('2026-07-01T08:30:00.000Z');
  });

  it('treats a winter wall-clock time as GMT (UTC+0)', () => {
    expect(fromEuropeLondon('2026-01-15T09:30:00')).toBe('2026-01-15T09:30:00.000Z');
  });

  it('moves a just-after-midnight BST timestamp onto the previous UTC day', () => {
    expect(fromEuropeLondon('2026-07-02T00:30:00')).toBe('2026-07-01T23:30:00.000Z');
  });

  it('trusts an explicit offset over the documentation about it', () => {
    expect(fromEuropeLondon('2026-07-01T09:30:00+00:00')).toBe('2026-07-01T09:30:00.000Z');
    expect(fromEuropeLondon('2026-07-01T09:30:00Z')).toBe('2026-07-01T09:30:00.000Z');
  });

  it('returns null for junk rather than an Invalid Date', () => {
    expect(fromEuropeLondon('not a date')).toBeNull();
    expect(fromEuropeLondon(null)).toBeNull();
    expect(fromEuropeLondon('')).toBeNull();
  });
});

describe('toUtcIso', () => {
  it('keeps an explicit Z', () => {
    expect(toUtcIso('2026-09-01T09:30:00Z')).toBe('2026-09-01T09:30:00.000Z');
  });

  // Randox's examples carry an offset, but the spec doesn't guarantee one.
  // Parsed as local time, a summer appointment shifts by an hour.
  it('treats a zone-less timestamp as UTC, not as server-local time', () => {
    expect(toUtcIso('2026-07-01T09:30:00')).toBe('2026-07-01T09:30:00.000Z');
  });

  it('respects an explicit offset', () => {
    expect(toUtcIso('2026-07-01T10:30:00+01:00')).toBe('2026-07-01T09:30:00.000Z');
  });

  it('returns null for junk rather than an Invalid Date', () => {
    expect(toUtcIso('not a date')).toBeNull();
    expect(toUtcIso(null)).toBeNull();
  });
});
