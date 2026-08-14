import { describe, it, expect } from 'vitest';
import {
  assessParseCleanliness,
  holdFieldsFor,
  HOLD_CONDITIONS,
  type HoldCondition,
  type ParseCleanlinessInput,
} from '../src/lib/cleanParse.js';

/**
 * THIS DEFINITION IS LOAD-BEARING, WHICH IS WHY IT HAS ITS OWN TEST FILE.
 *
 * There is no human gate at all now (Aug 2026), so anything
 * `assessParseCleanliness` calls clean goes STRAIGHT ONTO A PATIENT'S SCREEN,
 * and anything it holds is the only thing that stops it. The pipeline used to
 * have two people between those two facts, then one. This function is what
 * replaced them.
 *
 * So what is asserted here is not "the function works": it is that each of the
 * five conditions HOLDS, that the two deliberate non-conditions DO NOT, and that
 * clean is exactly "no holds" rather than a separate judgement that could drift
 * away from the list.
 */

const NOTHING_WRONG: ParseCleanlinessInput = {
  unmappedAnalytes: [],
  unfiledRows: [],
  unrecognisedCodes: [],
  labDisagreementCount: 0,
  isPartial: false,
};

describe('a clean parse', () => {
  it('is clean when none of the five conditions fired', () => {
    const result = assessParseCleanliness(NOTHING_WRONG);
    expect(result.clean).toBe(true);
    expect(result.holdReasons).toEqual([]);
    expect(result.conditions).toEqual([]);
  });

  it('is clean if and only if nothing is held', () => {
    // Not two independent judgements. If `clean` could ever be true beside a
    // hold reason, the exception queue and the review gate would disagree about
    // the same report.
    const cases: ParseCleanlinessInput[] = [
      NOTHING_WRONG,
      { ...NOTHING_WRONG, unmappedAnalytes: ['Zorbulin'] },
      { ...NOTHING_WRONG, unfiledRows: [{ markerName: 'Ferritin', reason: 'no range' }] },
      { ...NOTHING_WRONG, unrecognisedCodes: ['SOME-UNKNOWN-CODE'] },
      { ...NOTHING_WRONG, labDisagreementCount: 1 },
      { ...NOTHING_WRONG, isPartial: true },
    ];
    for (const input of cases) {
      const result = assessParseCleanliness(input);
      expect(result.clean).toBe(result.holdReasons.length === 0);
      expect(result.clean).toBe(result.conditions.length === 0);
    }
  });
});

describe('each of the five conditions holds the report', () => {
  it('holds on an analyte no marker answered to', () => {
    // The commonest one in practice: the analyte map has never been confirmed
    // against a real Randox payload, so one difference in spelling lands here.
    const result = assessParseCleanliness({ ...NOTHING_WRONG, unmappedAnalytes: ['Zorbulin'] });
    expect(result.clean).toBe(false);
    expect(result.conditions).toContain('UNMAPPED_ANALYTE');
    expect(result.holdReasons[0]).toContain('Zorbulin');
    // The sentence has to say what it MEANS, not just what happened — the person
    // reading it is deciding whether to release a panel.
    expect(result.holdReasons[0]).toMatch(/incomplete/i);
  });

  it('holds on a row that matched a marker but could not be filed', () => {
    const result = assessParseCleanliness({
      ...NOTHING_WRONG,
      unfiledRows: [{ markerName: 'Ferritin', reason: 'one-sided reference range' }],
    });
    expect(result.conditions).toContain('UNFILED_ROW');
    expect(result.holdReasons[0]).toContain('Ferritin');
  });

  it('holds on a code that is not in the map', () => {
    // The condition added with the single-gate change. An unrecognised code is
    // treated as void and the result withheld, which is the safe default — and
    // it means a test the patient paid for is absent for a reason nobody has read.
    const result = assessParseCleanliness({ ...NOTHING_WRONG, unrecognisedCodes: ['SOME-UNKNOWN-CODE'] });
    expect(result.clean).toBe(false);
    expect(result.conditions).toContain('UNRECOGNISED_CODE');
    expect(result.holdReasons[0]).toContain('SOME-UNKNOWN-CODE');
    expect(result.holdReasons[0]).toMatch(/withheld/i);
  });

  it('holds where the laboratory’s own flag disagrees with the range they sent', () => {
    const result = assessParseCleanliness({ ...NOTHING_WRONG, labDisagreementCount: 2 });
    expect(result.conditions).toContain('LAB_DISAGREEMENT');
    expect(result.holdReasons[0]).toMatch(/high\/low flag/i);
  });

  it('holds a delivery the laboratory has not finished', () => {
    const result = assessParseCleanliness({ ...NOTHING_WRONG, isPartial: true });
    expect(result.conditions).toContain('PARTIAL_DELIVERY');
  });

  it('reports every condition that fired, not just the first', () => {
    const result = assessParseCleanliness({
      unmappedAnalytes: ['Zorbulin'],
      unfiledRows: [{ markerName: 'Ferritin', reason: 'no range' }],
      unrecognisedCodes: ['X1'],
      labDisagreementCount: 1,
      isPartial: true,
    });
    expect(result.conditions).toHaveLength(5);
    expect(result.holdReasons).toHaveLength(5);
  });
});

describe('what deliberately does NOT hold a report', () => {
  it('does not hold on a result the laboratory withheld under a recognised code', () => {
    // A recognised void code reaches this function as nothing at all: the
    // exclusion is on the record and the report is complete as far as anyone
    // here can make it. Only an UNRECOGNISED code is passed in.
    const result = assessParseCleanliness(NOTHING_WRONG);
    expect(result.clean).toBe(true);
  });

  it('has no condition for an out-of-range result', () => {
    // A significantly raised marker is a clinical finding, which is exactly what
    // the clinician is being asked to look at. Holding on it would make the
    // exception queue the whole report list and mean nothing.
    const keys = assessParseCleanliness({
      ...NOTHING_WRONG,
      unmappedAnalytes: ['a'],
      unfiledRows: [{ markerName: 'b', reason: 'c' }],
      unrecognisedCodes: ['d'],
      labDisagreementCount: 1,
      isPartial: true,
    }).conditions;
    expect(keys).not.toContain('OUT_OF_RANGE');
    expect(keys.length).toBe(5);
  });
});

describe('the sentences a clinician reads', () => {
  it('names at most five and says there are more', () => {
    const result = assessParseCleanliness({
      ...NOTHING_WRONG,
      unmappedAnalytes: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    });
    expect(result.holdReasons[0]).toContain('…');
    expect(result.holdReasons[0]).toContain('7 results');
    expect(result.holdReasons[0]).not.toContain('G');
  });

  it('counts distinct spellings, not rows', () => {
    // The same unmapped analyte on three rows is one gap in the map, and "3
    // results could not be matched (Zorbulin)" reads as three different problems.
    const result = assessParseCleanliness({
      ...NOTHING_WRONG,
      unmappedAnalytes: ['Zorbulin', 'Zorbulin', 'Zorbulin'],
    });
    expect(result.holdReasons[0]).toContain('1 result ');
  });

  it('agrees in number, so a single hold does not read as plural', () => {
    const one = assessParseCleanliness({ ...NOTHING_WRONG, unmappedAnalytes: ['A'] }).holdReasons[0];
    expect(one).toContain('1 result ');
    expect(one).toContain('It is recorded');
    const many = assessParseCleanliness({ ...NOTHING_WRONG, unmappedAnalytes: ['A', 'B'] }).holdReasons[0];
    expect(many).toContain('2 results');
    expect(many).toContain('They are recorded');
  });

  it('is non-diagnostic and says nothing evaluative', () => {
    const all = assessParseCleanliness({
      unmappedAnalytes: ['A'],
      unfiledRows: [{ markerName: 'B', reason: 'c' }],
      unrecognisedCodes: ['D'],
      labDisagreementCount: 1,
      isPartial: true,
    }).holdReasons.join(' ');
    for (const word of ['healthy', 'concerning', 'danger', 'abnormal', 'bad', 'good', 'risk']) {
      expect(all.toLowerCase(), `"${word}" has no place in a hold reason`).not.toContain(word);
    }
  });
});

describe('the fields a hold writes', () => {
  const at = new Date('2026-08-12T09:00:00Z');

  it('stamps heldAt exactly when something is held', () => {
    // The invariant the exception queue's "oldest first" sort depends on.
    expect(holdFieldsFor(assessParseCleanliness(NOTHING_WRONG), at).heldAt).toBeNull();
    expect(holdFieldsFor(assessParseCleanliness({ ...NOTHING_WRONG, isPartial: true }), at).heldAt).toEqual(at);
  });

  it('retracts any previous acknowledgement', () => {
    // A clinician who acknowledged one problem must not have silently
    // pre-cleared the next delivery's. Cleared on a clean reassessment too: there
    // is nothing left to have acknowledged.
    for (const input of [NOTHING_WRONG, { ...NOTHING_WRONG, unmappedAnalytes: ['A'] }]) {
      const fields = holdFieldsFor(assessParseCleanliness(input), at);
      expect(fields.holdsAcknowledgedAt).toBeNull();
      expect(fields.holdsAcknowledgedById).toBeNull();
    }
  });

  it('clears the reasons when a parse comes back clean', () => {
    expect(holdFieldsFor(assessParseCleanliness(NOTHING_WRONG), at).holdReasons).toEqual([]);
  });
});

/**
 * THE LIST IS CLOSED, AND CLOSED IS SOMETHING YOU CAN COUNT.
 *
 * With automatic release, "how many things can stop a report reaching a patient,
 * and what are they" is a question asked of the code rather than of a comment.
 * The two assertions below are both needed: the length pins the count, and the
 * round-trip through `HoldCondition` means a sixth member added to the type
 * without being named in the array does not compile.
 */
describe('the closed list of hold conditions', () => {
  it('has exactly five members, in the documented order', () => {
    expect(HOLD_CONDITIONS).toEqual([
      'UNMAPPED_ANALYTE',
      'UNFILED_ROW',
      'UNRECOGNISED_CODE',
      'LAB_DISAGREEMENT',
      'PARTIAL_DELIVERY',
    ]);
  });

  it('is the same set the type admits', () => {
    const everyCondition: Record<HoldCondition, true> = {
      UNMAPPED_ANALYTE: true,
      UNFILED_ROW: true,
      UNRECOGNISED_CODE: true,
      LAB_DISAGREEMENT: true,
      PARTIAL_DELIVERY: true,
    };
    expect(Object.keys(everyCondition).sort()).toEqual([...HOLD_CONDITIONS].sort());
  });

  it('can be fired all at once, and every one of them holds', () => {
    // The belt-and-braces case: five conditions, five sentences, and clean is
    // false. A condition that fired but produced no sentence would be a hold
    // with nothing on screen saying what it was.
    const assessment = assessParseCleanliness({
      unmappedAnalytes: ['Zorbulin'],
      unfiledRows: [{ markerName: 'Ferritin', reason: 'no usable range' }],
      unrecognisedCodes: ['XX9'],
      labDisagreementCount: 1,
      isPartial: true,
    });
    expect(assessment.clean).toBe(false);
    expect(assessment.conditions).toEqual([...HOLD_CONDITIONS]);
    expect(assessment.holdReasons).toHaveLength(HOLD_CONDITIONS.length);
  });
});
