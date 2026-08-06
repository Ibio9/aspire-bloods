import { describe, it, expect, beforeEach, vi } from 'vitest';

// codes.ts touches prisma only to record an unknown-code sighting. That's a
// side effect, not the behaviour under test — stub it so the classification
// rules can be tested without a database.
vi.mock('../src/db/client.js', () => ({
  prisma: { randoxUnknownCode: { upsert: vi.fn().mockResolvedValue({}) } },
}));

const { assessCodes, classifyCode } = await import('../src/modules/randox/codes.js');
const { __setConfigCachesForTest } = await import('../src/modules/randox/config.js');

const CODE_MAP = {
  'V-HAEM': { kind: 'VOID' as const, description: 'Sample haemolysed.' },
  'C-FASTING': { kind: 'CAVEAT' as const, description: 'Not fasted.', patientSafeNote: '' },
  'C-EXPLAINED': { kind: 'CAVEAT' as const, description: 'Known meaning.', patientSafeNote: 'Taken shortly after a meal.' },
};

beforeEach(() => {
  __setConfigCachesForTest(CODE_MAP, null);
});

describe('classifyCode', () => {
  it('treats a mapped VOID code as void', () => {
    const verdict = classifyCode('V-HAEM');
    expect(verdict.kind).toBe('VOID');
    expect(verdict.recognised).toBe(true);
  });

  it('treats a mapped CAVEAT code as a caveat', () => {
    const verdict = classifyCode('C-FASTING');
    expect(verdict.kind).toBe('CAVEAT');
  });

  // The rule the whole integration hangs on: we will never have a complete
  // code list, so anything unknown must fail closed.
  it('treats an unrecognised code as VOID, not as a caveat and not as clean', () => {
    const verdict = classifyCode('NEVER-SEEN-BEFORE');
    expect(verdict.kind).toBe('VOID');
    expect(verdict.recognised).toBe(false);
  });

  it('matches codes case- and whitespace-insensitively', () => {
    expect(classifyCode('  v-haem ').kind).toBe('VOID');
    expect(classifyCode('c-fasting').kind).toBe('CAVEAT');
  });

  it('withholds a caveat from patients until its wording is agreed', () => {
    const blank = classifyCode('C-FASTING');
    const known = classifyCode('C-EXPLAINED');
    expect(blank.kind === 'CAVEAT' && blank.patientSafeNote).toBeNull();
    expect(known.kind === 'CAVEAT' && known.patientSafeNote).toBe('Taken shortly after a meal.');
  });
});

describe('assessCodes', () => {
  it('reports a clean result as neither void nor caveated', () => {
    const assessment = assessCodes({ voidCodes: [], caveatCodes: [] });
    expect(assessment.isVoid).toBe(false);
    expect(assessment.caveatCodes).toHaveLength(0);
  });

  it('voids the result when any void code is present', () => {
    const assessment = assessCodes({ voidCodes: ['V-HAEM'], caveatCodes: ['C-FASTING'] });
    expect(assessment.isVoid).toBe(true);
    expect(assessment.voidReason).toContain('V-HAEM');
  });

  // A void code arriving in the caveat field must still void. Trusting the
  // field name would let a mislabelled void through as an annotation.
  it('voids on a void code even when Randox send it in the caveat list', () => {
    const assessment = assessCodes({ voidCodes: [], caveatCodes: ['V-HAEM'] });
    expect(assessment.isVoid).toBe(true);
  });

  it('voids on an unknown code and reports it as unrecognised', () => {
    const assessment = assessCodes({ voidCodes: [], caveatCodes: ['MYSTERY-01'] });
    expect(assessment.isVoid).toBe(true);
    expect(assessment.unrecognisedCodes).toEqual(['MYSTERY-01']);
  });

  it('does not let a caveat rescue a voided result', () => {
    const assessment = assessCodes({ voidCodes: ['V-HAEM'], caveatCodes: ['C-EXPLAINED'] });
    expect(assessment.isVoid).toBe(true);
  });

  it('ignores blank entries rather than treating them as unknown codes', () => {
    const assessment = assessCodes({ voidCodes: ['', '   '], caveatCodes: [] });
    expect(assessment.isVoid).toBe(false);
    expect(assessment.unrecognisedCodes).toHaveLength(0);
  });
});
