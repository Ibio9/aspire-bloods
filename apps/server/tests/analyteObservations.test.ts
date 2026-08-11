import { describe, it, expect } from 'vitest';
import { bareSensitivityName, resolveCatalogueMarkers } from '@aspire-bloods/shared';
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
    // It WAS 207-on-one-spelling, which is the whole of the risk described
    // below. Every one now answers to its bare name as well.
    expect(coverage.byResultType.SENSITIVITY.singleSpelling).toBe(0);
  });
});

/**
 * THE FOOD-SENSITIVITY SUFFIX, WHICH WAS A SINGLE POINT OF FAILURE FOR 207
 * MARKERS.
 *
 * All 207 items are stored as `Cod (IgG)`, and the "(IgG)" is OURS — a
 * disambiguator added in packages/shared so a food can never collide with a
 * blood analyte of the same name. Randox have never been observed printing it.
 * If they send the food name bare, every one of the 207 misses at once, and an
 * admin opens the exception queue on the first Signature delivery to find 207
 * unmapped analytes in it.
 *
 * Both spellings resolve now. This is not a guess at a Randox spelling — the
 * analyte map still refuses those and still has no fuzzy matching, no
 * similarity scoring and no substring fallback. It is our own name accepted
 * with and without a suffix we added ourselves.
 */
describe('every food-sensitivity marker resolves from both its spellings', () => {
  const sensitivity = resolveCatalogueMarkers().filter((m) => m.resultType === 'SENSITIVITY');

  it('covers all 207 of them', () => {
    expect(sensitivity.length).toBe(207);
  });

  it('resolves from the suffixed name, exactly as before', () => {
    const failures = sensitivity
      .map((m) => ({ m, r: resolveAnalyte({ analyte: m.name }) }))
      .filter(({ m, r }) => r.status !== 'MAPPED' || r.markerKey !== m.key)
      .map(({ m, r }) => `${m.name} → ${r.status}`);
    expect(failures).toEqual([]);
  });

  it('resolves from the bare name, which is what Randox may actually print', () => {
    const failures = sensitivity
      .map((m) => ({ m, bare: bareSensitivityName(m.name) }))
      .filter(({ bare }) => bare !== null)
      .map(({ m, bare }) => ({ m, bare: bare!, r: resolveAnalyte({ analyte: bare! }) }))
      .filter(({ m, r }) => r.status !== 'MAPPED' || r.markerKey !== m.key)
      .map(({ bare, r }) => `${bare} → ${r.status}${r.status === 'AMBIGUOUS' ? ` (${r.candidates.join(', ')})` : ''}`);
    expect(failures).toEqual([]);
  });

  it('resolves the bare name through normalisation too, not only exact match', () => {
    // Randox's own casing and spacing are not something we know either, so the
    // bare form has to survive the same treatment every other analyte gets.
    const cod = sensitivity.find((m) => m.key === 'cod-igg');
    expect(cod, 'the catalogue no longer holds Cod (IgG)').toBeTruthy();
    expect(resolveAnalyte({ analyte: '  cod  ' })).toMatchObject({ status: 'MAPPED', markerKey: 'cod-igg' });
    expect(resolveAnalyte({ analyte: 'COD' })).toMatchObject({ status: 'MAPPED', markerKey: 'cod-igg' });
  });

  it('introduces no collision with a blood analyte, which is what the suffix was for', () => {
    // The suffix exists because a food name can be an analyte's name — "Egg
    // White" and "Casein" are one slug away from a protein assay. Stripping it
    // could therefore hand a food and a blood test the same string.
    //
    // It does not, today, and this is the assertion that keeps it that way: no
    // bare food name is claimed by anything that is not that food. If a future
    // catalogue addition breaks it, analyteMap's index records BOTH claims and
    // refuses the row as AMBIGUOUS rather than picking — so the failure mode is
    // a queued exception and not a food filed as a protein assay — but this
    // fails first, in `npm test`, which is where it should be found.
    const collisions = resolveCatalogueMarkers()
      .filter((m) => m.resultType === 'SENSITIVITY')
      .flatMap((m) => {
        const bare = bareSensitivityName(m.name);
        if (!bare) return [];
        const r = resolveAnalyte({ analyte: bare });
        return r.status === 'AMBIGUOUS' ? [`${bare} → ${r.candidates.join(', ')}`] : [];
      });
    expect(collisions).toEqual([]);
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
