import { describe, it, expect } from 'vitest';
import { resolveCatalogueMarkers } from '@aspire-bloods/shared';
import {
  LOTHIAN,
  PUBLISHED_RANGES,
  WITHHELD,
  publishedRangeSource,
} from '../prisma/publishedReferenceRanges.js';
import { resolveReferenceRange, type CatalogRange } from '../src/lib/resolveReferenceRange.js';

/**
 * A UNIT CONVERSION ERROR PRODUCES A NUMBER THAT LOOKS EXACTLY LIKE A REAL
 * RANGE.
 *
 * That is the whole reason this file exists. Two of the twenty rows loaded are
 * printed in units the catalogue does not use — urate in mmol/L, haematocrit
 * as a fraction — and getting either wrong yields something correctly
 * formatted, in the right column, out by a factor of a thousand or a hundred.
 * Nobody reading a verify form would catch a urate range of 0.12–0.36 µmol/L,
 * because it has the shape of a range.
 *
 * So the arithmetic is asserted TWICE and the two are independent: once
 * against the factor the row itself declares, and once against the literal
 * expected number written out here by hand. A wrong factor with a
 * correspondingly wrong result would pass the first and fail the second, which
 * is the point — a self-consistent mistake is exactly what a single check
 * cannot see.
 */

describe('unit conversions', () => {
  it('every stored value is the printed value times the declared factor', () => {
    for (const r of PUBLISHED_RANGES) {
      const factor = r.conversion?.factor ?? 1;
      const label = `${r.markerKey} ${r.sex}`;
      expect(r.stored.low, `${label} low`).toBeCloseTo(r.printed.low * factor, 9);
      expect(r.stored.high, `${label} high`).toBeCloseTo(r.printed.high * factor, 9);
    }
  });

  it('declares a conversion exactly when the unit changes, and not otherwise', () => {
    for (const r of PUBLISHED_RANGES) {
      const unitChanged = r.printed.unit !== r.stored.unit;
      expect(Boolean(r.conversion), `${r.markerKey} ${r.sex}: unit ${unitChanged ? 'changes' : 'is unchanged'}`).toBe(
        unitChanged,
      );
    }
  });

  it('converts urate from mmol/L to µmol/L, to the literal expected numbers', () => {
    const female = PUBLISHED_RANGES.find((r) => r.markerKey === 'uric-acid' && r.sex === 'FEMALE')!;
    const male = PUBLISHED_RANGES.find((r) => r.markerKey === 'uric-acid' && r.sex === 'MALE')!;

    expect(female.printed).toEqual({ low: 0.12, high: 0.36, unit: 'mmol/L' });
    expect(female.stored).toEqual({ low: 120, high: 360, unit: 'µmol/L' });
    expect(male.printed).toEqual({ low: 0.12, high: 0.42, unit: 'mmol/L' });
    expect(male.stored).toEqual({ low: 120, high: 420, unit: 'µmol/L' });
    expect(female.conversion?.factor).toBe(1000);

    // And the unit string is the MICRO SIGN, not an ASCII "u". The same trap
    // is recorded in lib/unitConversion.ts, where an ASCII u meant a
    // conversion key silently never matched.
    expect(female.stored.unit.charCodeAt(0)).toBe(0xb5);
  });

  it('converts haematocrit from a fraction to a percentage, to the literal expected numbers', () => {
    const female = PUBLISHED_RANGES.find((r) => r.markerKey === 'haematocrit' && r.sex === 'FEMALE')!;
    const male = PUBLISHED_RANGES.find((r) => r.markerKey === 'haematocrit' && r.sex === 'MALE')!;

    expect(female.printed).toEqual({ low: 0.37, high: 0.47, unit: 'L/L' });
    expect(female.stored).toEqual({ low: 37, high: 47, unit: '%' });
    expect(male.printed).toEqual({ low: 0.4, high: 0.52, unit: 'L/L' });
    expect(male.stored).toEqual({ low: 40, high: 52, unit: '%' });
    expect(female.conversion?.factor).toBe(100);
  });

  it('leaves every unconverted row byte-identical to the document', () => {
    // The rows with no conversion are the ones where a stray edit is easiest,
    // because there is no arithmetic to disagree with itself.
    const asPrinted = PUBLISHED_RANGES.filter((r) => !r.conversion).map(
      (r) => `${r.markerKey} ${r.sex} ${r.printed.low}-${r.printed.high} ${r.printed.unit}`,
    );
    expect(asPrinted).toEqual([
      'creatinine FEMALE 50-98 µmol/L',
      'creatinine MALE 64-111 µmol/L',
      'creatine-kinase FEMALE 35-135 U/L',
      'creatine-kinase MALE 55-170 U/L',
      'haemoglobin FEMALE 115-160 g/L',
      'haemoglobin MALE 135-180 g/L',
      'haemoglobin-f FEMALE 115-160 g/L',
      'haemoglobin-f MALE 135-180 g/L',
      'rbc FEMALE 3.8-5.8 10^12/L',
      'rbc MALE 4.6-6.5 10^12/L',
      'troponin-i FEMALE 1-16 ng/L',
      'troponin-i MALE 1-34 ng/L',
      'microalbumin-creatinine-ratio FEMALE 0-3.5 mg/mmol',
      'microalbumin-creatinine-ratio MALE 0-2.5 mg/mmol',
      'total-psa MALE 0-3 µg/L',
      'ca-125 FEMALE 0-35 kU/L',
    ]);
  });
});

describe('what is loaded and what is not', () => {
  it('loads ten analytes and no more', () => {
    // Eleven KEYS for ten ANALYTES: the seed carries the female haemoglobin as
    // its own marker, so `haemoglobin` and `haemoglobin-f` are one analyte
    // written twice. Both are listed rather than collapsed, because a range
    // written against a key nothing answers to is a range nobody sees.
    expect([...new Set(PUBLISHED_RANGES.map((r) => r.markerKey))].sort()).toEqual([
      'ca-125',
      'creatine-kinase',
      'creatinine',
      'haematocrit',
      'haemoglobin',
      'haemoglobin-f',
      'microalbumin-creatinine-ratio',
      'rbc',
      'total-psa',
      'troponin-i',
      'uric-acid',
    ]);
  });

  it('never loads a withheld analyte', () => {
    // The two lists must not overlap. A marker appearing in both would mean a
    // range was loaded for something explicitly refused, which is the failure
    // this pair of lists exists to make impossible.
    const loaded = new Set(PUBLISHED_RANGES.map((r) => r.markerKey));
    expect(WITHHELD.filter((w) => loaded.has(w.markerKey)).map((w) => w.markerKey)).toEqual([]);
  });

  it('refuses the two iron rows because the source appears transposed', () => {
    // A transposed iron-status range is invisible on screen and inverts iron
    // deficiency for every patient. Named individually, so removing the
    // refusal is a deliberate act rather than a list getting shorter.
    for (const key of ['ferritin', 'iron']) {
      const w = WITHHELD.find((x) => x.markerKey === key);
      expect(w, `${key} is no longer withheld`).toBeTruthy();
      expect(w!.why).toContain('transposed');
    }
  });

  it('refuses GGT because a Randox range already exists for it', () => {
    expect(WITHHELD.find((w) => w.markerKey === 'ggt')!.why).toContain('does not overwrite a Randox one');
  });

  it('refuses HDL because 1.55 is a threshold and not an interval', () => {
    expect(WITHHELD.find((w) => w.markerKey === 'hdl')!.why).toContain('NOT A REFERENCE INTERVAL');
  });

  it('refuses every hormone the source itself excludes', () => {
    const withheld = new Set(WITHHELD.map((w) => w.markerKey));
    for (const key of ['fsh', 'lh', 'prolactin', 'shbg', 'dhea-s', 'oestradiol', 'testosterone', 'free-androgen-index']) {
      expect(withheld.has(key), `${key} should be waiting for Randox`).toBe(true);
    }
  });

  it('points every marker key at a marker that exists', () => {
    // A range written against a key nothing answers to is a range nobody sees.
    // `haemoglobin-f` and `esr` come from the seed's own marker list rather
    // than from the Randox catalogue, so both sources are checked. (`esr` is
    // one of the seven markers the audit lists as "seeded, not in the Randox
    // catalogue" — it is withheld here rather than loaded, but the key still
    // has to resolve or the flag is attached to nothing.)
    const catalogue = new Set(resolveCatalogueMarkers().map((m) => m.key));
    const seedOnly = new Set(['haemoglobin-f', 'testosterone-f', 'esr']);
    const unknown = [...PUBLISHED_RANGES.map((r) => r.markerKey), ...WITHHELD.map((w) => w.markerKey)].filter(
      (k) => !catalogue.has(k) && !seedOnly.has(k),
    );
    expect([...new Set(unknown)]).toEqual([]);
  });
});

describe('the citation', () => {
  it('travels with every row', () => {
    for (const r of PUBLISHED_RANGES) {
      const source = publishedRangeSource(r);
      expect(source).toContain(LOTHIAN.publisher);
      expect(source).toContain(LOTHIAN.date);
      // And it says, on the row itself, that it is not Randox — because the
      // row is what somebody reads when they wonder where a number came from.
      expect(source).toContain('NOT a Randox range');
    }
  });

  it('spells out the conversion on a converted row', () => {
    const urate = PUBLISHED_RANGES.find((r) => r.markerKey === 'uric-acid' && r.sex === 'MALE')!;
    const source = publishedRangeSource(urate);
    expect(source).toContain('Converted from 0.12–0.42 mmol/L (×1000)');
  });
});

describe('what the resolver does with a sex split', () => {
  const rows = (markerKey: string): CatalogRange[] =>
    PUBLISHED_RANGES.filter((r) => r.markerKey === markerKey).map((r, i) => ({
      id: `${markerKey}-${i}`,
      sex: r.sex,
      ageMin: null,
      ageMax: null,
      unit: r.stored.unit,
      low: r.stored.low,
      high: r.stored.high,
    }));

  it('gives a woman the female band and a man the male one', () => {
    const female = resolveReferenceRange(rows('creatinine'), 'FEMALE', 40);
    const male = resolveReferenceRange(rows('creatinine'), 'MALE', 40);
    expect(female).toMatchObject({ status: 'resolved', range: { low: 50, high: 98 } });
    expect(male).toMatchObject({ status: 'resolved', range: { low: 64, high: 111 } });
  });

  it('refuses to answer when the patient has no sex on file', () => {
    // THE WHOLE POINT OF LOADING BOTH BANDS. Before this, creatinine held one
    // ANY row, so a patient with no sex recorded got a confident suggestion
    // that was wrong for half of them. Now the resolver has something to be
    // careful with and says so instead.
    expect(resolveReferenceRange(rows('creatinine'), null, 40)).toEqual({
      status: 'unavailable',
      reason: 'SEX_NOT_RECORDED',
    });
  });

  it('has nothing to offer a man for CA 125, which is a female-only row', () => {
    expect(resolveReferenceRange(rows('ca-125'), 'MALE', 40)).toEqual({
      status: 'unavailable',
      reason: 'NO_MATCHING_RANGE',
    });
  });
});
