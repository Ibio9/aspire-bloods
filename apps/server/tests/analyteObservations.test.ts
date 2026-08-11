import { describe, it, expect } from 'vitest';
import {
  analyteIdentity,
  analyteMappingCoverage,
  resolveAnalyte,
  type LearnedAnalyteMappings,
} from '../src/modules/randox/analyteMap.js';
import { suggestionsFor } from '../src/modules/randox/analyteObservations.js';

/**
 * The mapping-confidence layer, and the one property it must never lose: the
 * zero stays zero.
 *
 * 186 clinical markers resolve from their own catalogue names and NONE has met
 * a real Randox payload. The temptation, every time this code is touched, is to
 * turn that zero into something computed — and every computation available to
 * `analyteMappingCoverage()` is a count of assumptions, because everything it
 * can see came out of our own catalogue. What a delivery has actually confirmed
 * is a different number from a different source (`RandoxAnalyteObservation`),
 * and the two are reported side by side rather than added together.
 */

describe('analyteMappingCoverage', () => {
  const coverage = analyteMappingCoverage();

  it('keeps the confirmed-against-a-real-payload figure at zero', () => {
    expect(coverage.confirmedAgainstRealPayload).toBe(0);
  });

  it('counts QUALITATIVE markers, which still arrive in a payload', () => {
    // The reclassification moved 22 entries out of MEASURED. They render
    // differently and they arrive exactly as they did, so dropping them from
    // the denominator would have made the map look better by 22 for a reason
    // that has nothing to do with the map.
    expect(coverage.measured).toBe(186);
    expect(coverage.byResultType.MEASURED.total).toBe(164);
    expect(coverage.byResultType.QUALITATIVE.total).toBe(22);
  });

  it('still finds 86 markers resolvable on exactly one spelling', () => {
    expect(coverage.singleSpellingOnly.length).toBe(86);
    // Every one of them genuinely has no alias and no override — the list is
    // the risk list, so a marker with a fallback spelling must not be on it.
    for (const m of coverage.singleSpellingOnly.slice(0, 10)) {
      const resolution = resolveAnalyte({ analyte: m.name });
      expect(resolution.status, m.key).toBe('MAPPED');
    }
  });

  it('asks the same question of the whole catalogue, not only the clinical part', () => {
    // The food-sensitivity section is the largest single mapping risk in the
    // product and a coverage figure filtered to MEASURED could not see it.
    expect(coverage.byResultType.SENSITIVITY.total).toBe(207);
    expect(coverage.byResultType.SENSITIVITY.singleSpelling).toBeGreaterThan(200);
  });
});

describe('analyteIdentity', () => {
  it('separates the same name on two sample types', () => {
    // The whole reason this exists: Randox print the urinalysis pads bare, so
    // "Glucose" from urine and "Glucose" from serum are the same string and
    // two different tests. A learned mapping keyed on the name alone would
    // file one as the other, silently, for ever.
    expect(analyteIdentity('Glucose', 'Urine')).not.toBe(analyteIdentity('Glucose', 'Serum'));
  });

  it('treats no sample type and an empty one as the same thing', () => {
    expect(analyteIdentity('Glucose', null)).toBe(analyteIdentity('Glucose', '   '));
    expect(analyteIdentity('Glucose')).toBe(analyteIdentity('Glucose', ''));
  });

  it('ignores case, spacing and punctuation, as the map does', () => {
    expect(analyteIdentity('Vitamin D (25-OH)')).toBe(analyteIdentity('vitamin d 25 oh'));
  });
});

describe('a mapping a human accepted', () => {
  const learned: LearnedAnalyteMappings = new Map([[analyteIdentity('Serum Ferritin Level'), 'ferritin']]);

  it('resolves a spelling the catalogue has never heard of', () => {
    const before = resolveAnalyte({ analyte: 'Serum Ferritin Level' });
    expect(before.status).toBe('UNMAPPED');

    const after = resolveAnalyte({ analyte: 'Serum Ferritin Level' }, learned);
    expect(after).toMatchObject({ status: 'MAPPED', markerKey: 'ferritin', via: 'learned' });
  });

  it('does not leak between calls — it is passed in, never cached', () => {
    resolveAnalyte({ analyte: 'Serum Ferritin Level' }, learned);
    expect(resolveAnalyte({ analyte: 'Serum Ferritin Level' }).status).toBe('UNMAPPED');
  });

  it('loses to the sourced override table where the two disagree', () => {
    // A code override is a documented Randox spelling, reviewable in a diff.
    // An accepted mapping is one person at one moment. The documented one wins.
    const conflicting: LearnedAnalyteMappings = new Map([[analyteIdentity('Pepsingogen 1'), 'ferritin']]);
    expect(resolveAnalyte({ analyte: 'Pepsingogen 1' }, conflicting)).toMatchObject({
      markerKey: 'pepsinogen-1',
      via: 'override',
    });
  });

  it('refuses rather than guesses when the marker it points at has gone', () => {
    const stale: LearnedAnalyteMappings = new Map([[analyteIdentity('Whatever'), 'a-marker-that-does-not-exist']]);
    const r = resolveAnalyte({ analyte: 'Whatever' }, stale);
    expect(r.status).toBe('UNMAPPED');
    expect(r.status === 'UNMAPPED' && r.reason).toContain('no longer in the catalogue');
  });

  it('respects the sample type it was accepted for', () => {
    const urineOnly: LearnedAnalyteMappings = new Map([
      [analyteIdentity('Dipstick Sugar', 'Urine'), 'glucose-urine'],
    ]);
    expect(resolveAnalyte({ analyte: 'Dipstick Sugar', sampleType: 'Urine' }, urineOnly)).toMatchObject({
      markerKey: 'glucose-urine',
    });
    // The same string on a serum row is NOT the mapping that was accepted.
    expect(resolveAnalyte({ analyte: 'Dipstick Sugar', sampleType: 'Serum' }, urineOnly).status).toBe('UNMAPPED');
  });
});

describe('suggestions for an unmapped analyte', () => {
  const markers = [
    { id: '1', key: 'magnesium', name: 'Magnesium' },
    { id: '2', key: 'rbc-magnesium', name: 'RBC Magnesium' },
    { id: '3', key: 'ferritin', name: 'Ferritin' },
    { id: '4', key: 'alt', name: 'ALT (Alanine Aminotransferase)' },
  ];

  it('uses the fuzzy matcher the analyte map itself refuses to use', () => {
    // Deliberate, and the opposite rule to analyteMap.ts. There, a substring
    // match files a real measurement under the wrong analyte with nobody
    // watching. Here an admin has to press a button, so a near-miss costs a
    // glance and a miss costs a result stuck in a queue.
    const s = suggestionsFor('Magnesium (RBC)', markers);
    expect(s.map((x) => x.markerKey)).toContain('rbc-magnesium');
  });

  it('labels the weakest tier as the weakest tier', () => {
    const s = suggestionsFor('Magnesium', markers);
    const rbc = s.find((x) => x.markerKey === 'rbc-magnesium');
    // "Magnesium" is a substring of "RBC Magnesium" and they are two different
    // tests. It may be suggested; it may not be suggested quietly.
    if (rbc) {
      expect(rbc.tier).toBe('substring');
      expect(rbc.why).toMatch(/weakest/i);
    }
  });

  it('puts the strongest match first', () => {
    const s = suggestionsFor('Alanine Aminotransferase (ALT)', markers);
    expect(s[0].markerKey).toBe('alt');
  });

  it('returns nothing rather than something irrelevant', () => {
    expect(suggestionsFor('Zzzzqqq', markers)).toEqual([]);
  });
});
