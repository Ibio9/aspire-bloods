import { describe, it, expect } from 'vitest';
import { formatDate, formatDateShort, formatReportHeading, formatReportTitle, maskEmail } from '@aspire-bloods/shared';

describe('formatDate', () => {
  it('renders the house format, never ISO', () => {
    expect(formatDate('2026-08-05')).toBe('5 August 2026');
    expect(formatDate('2026-12-25')).toBe('25 December 2026');
  });

  it('does not shift the day across timezones', () => {
    // new Date('2026-08-05') parses as UTC midnight; in any negative-offset
    // timezone a naive local-date render shows the 4th. A sample date is a
    // calendar date, not an instant — it must render identically everywhere.
    expect(formatDate('2026-08-05')).toBe('5 August 2026');
    expect(formatDate('2026-01-01')).toBe('1 January 2026');
  });

  it('handles full ISO timestamps as well as bare dates', () => {
    expect(formatDate('2026-08-05T14:32:11.000Z')).toBe('5 August 2026');
  });

  it('renders an em dash for absent dates rather than "Invalid Date"', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('not a date')).toBe('—');
  });

  it('has a short form for space-constrained axes', () => {
    expect(formatDateShort('2026-08-05')).toBe('5 Aug 2026');
  });
});

describe('formatReportTitle', () => {
  it('uses the panel name when there is one', () => {
    expect(formatReportTitle('Advanced GP3 (Female)', 23, '2026-08-04')).toBe('Advanced GP3 (Female)');
  });

  it('falls back to markers and date when the report has no panel', () => {
    expect(formatReportTitle(null, 12, '2026-08-04')).toBe('12 markers · 4 August 2026');
  });

  it('never renders a bare fragment', () => {
    // No panel and no marker count still has to be a complete phrase.
    expect(formatReportTitle(null, 0, '2026-08-04')).toBe('Results · 4 August 2026');
    expect(formatReportTitle('', null, '2026-08-04')).toBe('Results · 4 August 2026');
    expect(formatReportTitle('   ', null, '2026-08-04')).toBe('Results · 4 August 2026');
  });

  it('singularises a one-marker report', () => {
    expect(formatReportTitle(null, 1, '2026-08-04')).toBe('1 marker · 4 August 2026');
  });
});

describe('formatReportHeading', () => {
  it('uses the panel name when there is one', () => {
    expect(formatReportHeading('Signature', 436)).toBe('Signature');
  });

  it('drops the date, because the caller is already printing it', () => {
    // The whole reason this exists: on a card whose eyebrow reads
    // "6 AUGUST 2026", formatReportTitle's fallback prints the date a second
    // time, which reads as a rendering fault rather than as a title.
    expect(formatReportHeading(null, 12)).toBe('12 markers');
    expect(formatReportHeading(null, 1)).toBe('1 marker');
  });

  it('is never blank, whatever it is given', () => {
    // Panels are optional and marker counts can legitimately be absent on a
    // pending report — an empty display heading is the failure mode here.
    expect(formatReportHeading(null, 0)).toBe('Results');
    expect(formatReportHeading('', undefined)).toBe('Results');
    expect(formatReportHeading('   ', null)).toBe('Results');
  });
});

describe('maskEmail', () => {
  it('leaves one identifying character and the domain', () => {
    expect(maskEmail('ibrahim@gmail.com')).toBe('i•••••@gmail.com');
  });

  it('caps the mask so it does not leak the local part length', () => {
    // Both of these have very different local-part lengths; the mask must
    // not be a character count of the address.
    expect(maskEmail('ab@x.com')).toBe(maskEmail('abcdefghijklmnop@x.com'));
  });

  it('never returns the full local part', () => {
    const masked = maskEmail('averylongaddress@example.com');
    expect(masked.startsWith('a')).toBe(true);
    expect(masked).not.toContain('verylongaddress');
    expect(masked.endsWith('@example.com')).toBe(true);
  });

  it('degrades safely on absent or malformed input', () => {
    expect(maskEmail(null)).toBe('your email address');
    expect(maskEmail('no-at-sign')).toBe('your email address');
  });
});
