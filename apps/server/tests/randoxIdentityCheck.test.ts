import { describe, it, expect } from 'vitest';
import { verifyOrderIdentity, type PersonIdentity } from '../src/modules/randox/identityCheck.js';
import { assessMatch, normaliseDob, normaliseName } from '../src/lib/identityMatch.js';

/**
 * The rule that decides whether a result may be filed without anyone looking
 * at it, as a table of cases.
 *
 * The whole feature reduces to this function, so it is tested as arithmetic
 * rather than only through ingestion: every way two records can fail to be
 * the same person, stated once each.
 */

const AISHA: PersonIdentity = { firstName: 'Aisha', lastName: 'Khan', dob: '1988-04-12' };
const NOTHING: PersonIdentity = { firstName: null, lastName: null, dob: null };

describe('verifyOrderIdentity', () => {
  it('agrees when the laboratory returns the same person the order was placed for', () => {
    const check = verifyOrderIdentity({ lab: AISHA, orderSnapshot: AISHA, account: AISHA });
    expect(check.verdict).toBe('AGREES');
    expect(check.evidence.labPayload).toBe('agrees');
    expect(check.evidence.orderSnapshot).toBe('agrees');
  });

  it('agrees on the order snapshot alone when Randox return no identity', () => {
    // The published response example carries no name or date of birth, so
    // this is the ORDINARY case, not a degraded one: what the order was
    // placed under is a real statement of who the sample belongs to.
    const check = verifyOrderIdentity({ lab: NOTHING, orderSnapshot: AISHA, account: AISHA });
    expect(check.verdict).toBe('AGREES');
    expect(check.evidence.labPayload).toBe('not-supplied');
  });

  it('refuses when the laboratory returns a different date of birth', () => {
    const check = verifyOrderIdentity({
      lab: { ...AISHA, dob: '1970-01-01' },
      orderSnapshot: AISHA,
      account: AISHA,
    });
    expect(check.verdict).toBe('DISAGREES');
    expect(check.disagreements.join(' ')).toMatch(/date of birth/i);
  });

  it('refuses when the laboratory returns a different surname', () => {
    const check = verifyOrderIdentity({
      lab: { ...AISHA, lastName: 'Okafor' },
      orderSnapshot: AISHA,
      account: AISHA,
    });
    expect(check.verdict).toBe('DISAGREES');
  });

  it('refuses when the account has been edited since the order was placed', () => {
    // Nothing wrong with the payload; the ACCOUNT has moved. This is the case
    // the order snapshot exists to catch — comparing the account to itself
    // would agree by construction and file a stranger's results.
    const check = verifyOrderIdentity({
      lab: NOTHING,
      orderSnapshot: AISHA,
      account: { firstName: 'Aisha', lastName: 'Khan', dob: '1991-09-30' },
    });
    expect(check.verdict).toBe('DISAGREES');
    expect(check.evidence.orderSnapshot).toBe('disagrees');
  });

  it('refuses when one source agrees and the other does not', () => {
    // Two statements about the same account contradicting each other is the
    // loudest signal available that something is wrong. Neither is preferred.
    const check = verifyOrderIdentity({
      lab: AISHA,
      orderSnapshot: { ...AISHA, dob: '1970-01-01' },
      account: AISHA,
    });
    expect(check.verdict).toBe('DISAGREES');
  });

  it('will not link on nothing at all', () => {
    const check = verifyOrderIdentity({ lab: NOTHING, orderSnapshot: NOTHING, account: AISHA });
    expect(check.verdict).toBe('UNCORROBORATED');
    expect(check.disagreements).toHaveLength(0);
  });

  it('will not link on a surname alone, however exactly it matches', () => {
    // Two siblings share a surname, and so do the two Patels the practice
    // already has. A name is never sufficient on its own.
    const check = verifyOrderIdentity({
      lab: { firstName: null, lastName: 'Khan', dob: null },
      orderSnapshot: NOTHING,
      account: AISHA,
    });
    expect(check.verdict).toBe('UNCORROBORATED');
  });

  it('will not link on a date of birth alone', () => {
    const check = verifyOrderIdentity({
      lab: { firstName: null, lastName: null, dob: '1988-04-12' },
      orderSnapshot: NOTHING,
      account: AISHA,
    });
    expect(check.verdict).toBe('UNCORROBORATED');
  });

  it('reads the same person through punctuation, accents and casing', () => {
    const check = verifyOrderIdentity({
      lab: { firstName: 'AISHA', lastName: "O'Brien", dob: '1988-04-12' },
      orderSnapshot: NOTHING,
      account: { firstName: 'aisha', lastName: 'Ó Brién', dob: '1988-04-12' },
    });
    expect(check.verdict).toBe('AGREES');
  });

  it('does not read Smith and Smyth as the same person', () => {
    const check = verifyOrderIdentity({
      lab: { firstName: 'John', lastName: 'Smith', dob: '1988-04-12' },
      orderSnapshot: NOTHING,
      account: { firstName: 'John', lastName: 'Smyth', dob: '1988-04-12' },
    });
    expect(check.verdict).toBe('DISAGREES');
  });

  it('treats a date of birth with a time on it as the same day', () => {
    // Same birthday, two spellings — one from a lab, one from a form. A
    // late-evening London timestamp read as UTC would move to the next day.
    const check = verifyOrderIdentity({
      lab: { ...AISHA, dob: '1988-04-12T23:30:00+01:00' },
      orderSnapshot: NOTHING,
      account: AISHA,
    });
    expect(check.verdict).toBe('AGREES');
  });
});

describe('the automatic bar is not lower than the manual one', () => {
  const cases: [string, PersonIdentity][] = [
    ['a full match', AISHA],
    ['a wrong date of birth', { ...AISHA, dob: '1970-01-01' }],
    ['a wrong surname', { ...AISHA, lastName: 'Okafor' }],
    ['no date of birth', { firstName: 'Aisha', lastName: 'Khan', dob: null }],
    ['nothing at all', NOTHING],
  ];

  // An admin linking by hand is refused on anything except an agreeing date
  // of birth plus an agreeing name. Whatever the automatic path does, it must
  // never accept something a person would have been stopped from doing.
  for (const [label, claimed] of cases) {
    it(`refuses ${label} automatically wherever an admin would be refused`, () => {
      const manual = assessMatch({ ...claimed, contactNumber: null }, { ...AISHA, contactNumber: null });
      const automatic = verifyOrderIdentity({ lab: claimed, orderSnapshot: NOTHING, account: AISHA });
      if (!manual.linkable) {
        expect(automatic.verdict, label).not.toBe('AGREES');
      }
    });
  }
});

describe('normalisation', () => {
  it('strips accents, punctuation and spacing from names', () => {
    expect(normaliseName("Ó Brién")).toBe(normaliseName("O'Brien"));
    expect(normaliseName('  Van  Der Berg ')).toBe('vanderberg');
    expect(normaliseName(null)).toBe('');
  });

  it('reduces a date of birth to its day, whatever form it arrives in', () => {
    expect(normaliseDob('1988-04-12')).toBe('1988-04-12');
    expect(normaliseDob('1988-04-12T00:00:00.000Z')).toBe('1988-04-12');
    expect(normaliseDob('12 April 1988')).toBe('1988-04-12');
    expect(normaliseDob('not a date')).toBe('');
    expect(normaliseDob(null)).toBe('');
  });
});
