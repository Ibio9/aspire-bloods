import { describe, expect, it } from 'vitest';
import { formatTypedDate, initialViewDate, parseISODate, parseTypedDate, resolveBounds } from './dateInput';

const TODAY = new Date(2026, 7, 6); // 6 August 2026

describe('parseTypedDate', () => {
  it('parses the form people actually type', () => {
    expect(parseTypedDate('14/03/1985', TODAY)).toBe('1985-03-14');
    expect(parseTypedDate('14-03-1985', TODAY)).toBe('1985-03-14');
    expect(parseTypedDate('14.03.1985', TODAY)).toBe('1985-03-14');
    expect(parseTypedDate('4/3/1985', TODAY)).toBe('1985-03-04');
    expect(parseTypedDate('14031985', TODAY)).toBe('1985-03-14');
    expect(parseTypedDate('1985-03-14', TODAY)).toBe('1985-03-14');
    expect(parseTypedDate('  14/03/1985  ', TODAY)).toBe('1985-03-14');
  });

  it('reads a two-digit year as the recent past, not the far future', () => {
    expect(parseTypedDate('14/03/85', TODAY)).toBe('1985-03-14');
    expect(parseTypedDate('14/03/26', TODAY)).toBe('2026-03-14');
  });

  it('rejects dates that do not exist rather than rolling them forward', () => {
    expect(parseTypedDate('31/02/1985', TODAY)).toBeNull();
    expect(parseTypedDate('29/02/2025', TODAY)).toBeNull();
    expect(parseTypedDate('29/02/2024', TODAY)).toBe('2024-02-29');
    expect(parseTypedDate('00/03/1985', TODAY)).toBeNull();
    expect(parseTypedDate('14/13/1985', TODAY)).toBeNull();
  });

  it('rejects anything that is not a date', () => {
    expect(parseTypedDate('', TODAY)).toBeNull();
    expect(parseTypedDate('yesterday', TODAY)).toBeNull();
    expect(parseTypedDate('14/03', TODAY)).toBeNull();
  });
});

describe('parseISODate', () => {
  it('will not accept an overflowing date', () => {
    expect(parseISODate('2026-02-31')).toBeNull();
    expect(parseISODate('2026-02-28')).not.toBeNull();
  });
});

describe('formatTypedDate', () => {
  it('round-trips with the parser', () => {
    expect(formatTypedDate('1985-03-14')).toBe('14/03/1985');
    expect(parseTypedDate(formatTypedDate('1985-03-14'), TODAY)).toBe('1985-03-14');
  });
});

describe('resolveBounds', () => {
  it('keeps a date of birth in the past and inside a human lifespan', () => {
    expect(resolveBounds('birthdate', undefined, undefined, TODAY)).toEqual({
      min: '1906-08-06',
      max: '2026-08-06',
    });
  });

  it('keeps a sample date recent', () => {
    expect(resolveBounds('recent-past', undefined, undefined, TODAY)).toEqual({
      min: '2016-08-06',
      max: '2026-08-06',
    });
  });

  it('lets an explicit bound win over the preset', () => {
    expect(resolveBounds('birthdate', '1990-01-01', undefined, TODAY).min).toBe('1990-01-01');
  });

  it('has no opinion when asked for none', () => {
    expect(resolveBounds('any', undefined, undefined, TODAY)).toEqual({ min: undefined, max: undefined });
  });
});

describe('initialViewDate', () => {
  it('opens a date of birth on a plausible birth year, not this month', () => {
    const bounds = resolveBounds('birthdate', undefined, undefined, TODAY);
    expect(initialViewDate('birthdate', bounds, TODAY).getFullYear()).toBe(1996);
  });

  it('opens a recent date on today', () => {
    const bounds = resolveBounds('recent-past', undefined, undefined, TODAY);
    expect(initialViewDate('recent-past', bounds, TODAY).getFullYear()).toBe(2026);
  });

  it('never opens outside the allowed range', () => {
    const bounds = resolveBounds('birthdate', '2020-01-01', undefined, TODAY);
    expect(initialViewDate('birthdate', bounds, TODAY).getFullYear()).toBe(2020);
  });
});
