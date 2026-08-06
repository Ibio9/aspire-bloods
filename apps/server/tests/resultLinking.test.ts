import { describe, it, expect } from 'vitest';
import { assessMatch } from '../src/modules/admin/linkingService.js';

/**
 * Wrong-patient results is the worst failure this system has, and assessMatch
 * is the single function standing in front of it — it decides both what the
 * admin is offered and what the server will accept. These tests exist mainly
 * to pin down the refusals: it's the "yes" cases that are easy to get right.
 */

const account = {
  firstName: 'Amelia',
  lastName: "O'Brien",
  dob: '1985-04-03',
  contactNumber: '+44 7700 900123',
};

describe('assessMatch', () => {
  it('links when name and date of birth both agree', () => {
    const result = assessMatch(
      { firstName: 'Amelia', lastName: "O'Brien", dob: '1985-04-03', contactNumber: null },
      account,
    );
    expect(result.linkable).toBe(true);
    expect(result.blockedReason).toBeNull();
    expect(result.dob).toBe(true);
  });

  it('refuses a perfect name match when the date of birth differs', () => {
    const result = assessMatch(
      { firstName: 'Amelia', lastName: "O'Brien", dob: '1985-04-30', contactNumber: '+44 7700 900123' },
      account,
    );
    expect(result.linkable).toBe(false);
    expect(result.firstName).toBe(true);
    expect(result.lastName).toBe(true);
    expect(result.blockedReason).toMatch(/date of birth/i);
  });

  it('refuses when the lab supplied no date of birth at all, however well the name matches', () => {
    const result = assessMatch(
      { firstName: 'Amelia', lastName: "O'Brien", dob: null, contactNumber: '+44 7700 900123' },
      account,
    );
    expect(result.linkable).toBe(false);
    expect(result.dob).toBe(false);
    expect(result.blockedReason).toMatch(/did not supply a date of birth/i);
  });

  it('refuses a matching date of birth when neither name agrees — two people share a birthday', () => {
    const result = assessMatch(
      { firstName: 'Joseph', lastName: 'Hartley', dob: '1985-04-03', contactNumber: null },
      account,
    );
    expect(result.dob).toBe(true);
    expect(result.linkable).toBe(false);
    expect(result.blockedReason).toMatch(/name/i);
  });

  it('links on date of birth plus surname alone — a first name may be a shortening', () => {
    const result = assessMatch(
      { firstName: 'Millie', lastName: "O'Brien", dob: '1985-04-03', contactNumber: null },
      account,
    );
    expect(result.linkable).toBe(true);
    expect(result.firstName).toBe(false);
    expect(result.lastName).toBe(true);
  });

  it('links on date of birth plus first name alone — a surname may have changed', () => {
    const result = assessMatch(
      { firstName: 'Amelia', lastName: 'Whitfield', dob: '1985-04-03', contactNumber: null },
      account,
    );
    expect(result.linkable).toBe(true);
    expect(result.lastName).toBe(false);
  });

  it('sees through punctuation, case, spacing and accents in a name', () => {
    const result = assessMatch(
      { firstName: 'amélia', lastName: 'o brien', dob: '1985-04-03', contactNumber: null },
      account,
    );
    expect(result.firstName).toBe(true);
    expect(result.lastName).toBe(true);
    expect(result.linkable).toBe(true);
  });

  it('compares dates of birth by day, not by string, so formatting differences do not block a real match', () => {
    const result = assessMatch(
      { firstName: 'Amelia', lastName: "O'Brien", dob: '1985-04-03T00:00:00.000Z', contactNumber: null },
      account,
    );
    expect(result.dob).toBe(true);
    expect(result.linkable).toBe(true);
  });

  it('treats an unparseable date of birth as absent rather than as agreement', () => {
    const result = assessMatch(
      { firstName: 'Amelia', lastName: "O'Brien", dob: 'not a date', contactNumber: null },
      account,
    );
    expect(result.dob).toBe(false);
    expect(result.linkable).toBe(false);
  });

  it('matches contact numbers across national and international formatting', () => {
    const result = assessMatch(
      { firstName: 'Amelia', lastName: "O'Brien", dob: '1985-04-03', contactNumber: '07700 900123' },
      { ...account, contactNumber: '+44 7700 900123' },
    );
    expect(result.contactNumber).toBe(true);
  });

  it('does not treat two empty fields as agreement', () => {
    const result = assessMatch(
      { firstName: null, lastName: null, dob: null, contactNumber: null },
      { firstName: null, lastName: null, dob: null, contactNumber: null },
    );
    expect(result.dob).toBe(false);
    expect(result.firstName).toBe(false);
    expect(result.lastName).toBe(false);
    expect(result.contactNumber).toBe(false);
    expect(result.linkable).toBe(false);
  });
});
