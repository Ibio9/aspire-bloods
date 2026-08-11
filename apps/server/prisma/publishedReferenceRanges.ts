/**
 * ---------------------------------------------------------------------------
 * SEX-SPECIFIC REFERENCE RANGES FROM A PUBLISHED THIRD-PARTY LABORATORY.
 * ---------------------------------------------------------------------------
 *
 * THE PROBLEM THESE ADDRESS, AND IT IS SILENT. Twenty-two analytes in the
 * catalogue are sex-dependent in clinical use and twenty of them store one
 * blanket `ANY` band. That renders an ordinary, unremarkable, correctly
 * formatted suggestion which is wrong for roughly half of patients, and
 * nothing about the screen looks different. `resolveReferenceRange()` already
 * handles the distinction correctly wherever the DATA is right — it scores a
 * sex-specific row above an `ANY` one and refuses to answer at all when the
 * marker splits and the patient has no sex on file. The gap was never in the
 * resolver.
 *
 * ─── WHERE THESE COME FROM, AND WHY THEY ARE A WEAKER TIER ────────────────
 *
 * NHS Lothian Laboratories, "Laboratory tests with gender-specific reference
 * ranges (excluding hormones)", March 2020.
 *
 * IT IS NOT RANDOX. Reference intervals are assay-specific: they belong to the
 * analyser, the method and the population the laboratory validated against,
 * not to the analyte in the abstract. A UK NHS laboratory's own intervals are
 * a real, named, citable source and they are still somebody else's intervals
 * for somebody else's instrument.
 *
 * So they go in at `PUBLISHED`, which is deliberately below `RANDOX`, they
 * carry their citation on every row, the tier is on screen in the verify form,
 * and they are REPLACED — not merged with, not averaged against — the moment
 * the Randox Pathology Services Catalogue or a female HSC5 example report
 * arrives. Both are still outstanding and both are still the real fix.
 *
 * ─── UNIT CONVERSION, WHICH IS THE DANGEROUS PART ─────────────────────────
 *
 * Two of these are printed in units the catalogue does not use. A conversion
 * error here does not produce something that looks wrong: it produces a
 * number in the right format, in the right column, in the right shape, that is
 * out by a factor of a thousand. Nobody reading the verify form would catch a
 * urate range of 0.12–0.36 µmol/L.
 *
 * So each row carries BOTH forms — `printed` exactly as the document has it,
 * and `stored` in our unit — plus the factor between them as data. The test
 * (`tests/publishedReferenceRanges.test.ts`) asserts the arithmetic AND the
 * literal expected numbers, so a wrong factor and a wrong result are two
 * separate failures rather than one self-consistent mistake.
 */

export interface RangeCitation {
  document: string;
  publisher: string;
  /** As printed on the document. A string, because "March 2020" has no day. */
  date: string;
  url: string;
}

export const LOTHIAN: RangeCitation = {
  document: 'Laboratory tests with gender-specific reference ranges (excluding hormones)',
  publisher: 'NHS Lothian Laboratories',
  date: 'March 2020',
  url: 'https://apps.nhslothian.scot/files/sites/2/Gender-specific-reference-ranges-for-blood-tests-1.pdf',
};

export interface UnitConversion {
  /** value_in_stored_unit = value_in_printed_unit * factor */
  factor: number;
  why: string;
}

export interface PublishedRange {
  markerKey: string;
  sex: 'MALE' | 'FEMALE';
  /** Exactly as the source document prints it, before anything is done to it. */
  printed: { low: number; high: number; unit: string };
  /** Null where the printed unit is already ours. */
  conversion: UnitConversion | null;
  /** What is written to the row. */
  stored: { low: number; high: number; unit: string };
  /** Anything about this row that a person reading the range needs to know. */
  note?: string;
}

/**
 * THE TEN THAT ARE LOADED. Nothing else from the document, and the ones left
 * out are in WITHHELD below with the reason on each.
 *
 * `haemoglobin` appears twice over three marker keys, because the seed carries
 * the male and female haemoglobin as two markers (`haemoglobin`,
 * `haemoglobin-f`) while the catalogue import creates a single `haemoglobin`.
 * Both are given both sexes rather than one each: a marker that holds only its
 * own sex's band gives the resolver nothing to be careful with, and the
 * resolver's whole value is that it REFUSES when a marker splits by sex and
 * the patient's sex is unknown.
 */
export const PUBLISHED_RANGES: PublishedRange[] = [
  // ── No conversion. Printed in the unit the catalogue already uses. ────────
  {
    markerKey: 'creatinine',
    sex: 'FEMALE',
    printed: { low: 50, high: 98, unit: 'µmol/L' },
    conversion: null,
    stored: { low: 50, high: 98, unit: 'µmol/L' },
  },
  {
    markerKey: 'creatinine',
    sex: 'MALE',
    printed: { low: 64, high: 111, unit: 'µmol/L' },
    conversion: null,
    stored: { low: 64, high: 111, unit: 'µmol/L' },
  },
  {
    markerKey: 'creatine-kinase',
    sex: 'FEMALE',
    printed: { low: 35, high: 135, unit: 'U/L' },
    conversion: null,
    stored: { low: 35, high: 135, unit: 'U/L' },
  },
  {
    markerKey: 'creatine-kinase',
    sex: 'MALE',
    printed: { low: 55, high: 170, unit: 'U/L' },
    conversion: null,
    stored: { low: 55, high: 170, unit: 'U/L' },
  },
  {
    markerKey: 'haemoglobin',
    sex: 'FEMALE',
    printed: { low: 115, high: 160, unit: 'g/L' },
    conversion: null,
    stored: { low: 115, high: 160, unit: 'g/L' },
  },
  {
    markerKey: 'haemoglobin',
    sex: 'MALE',
    printed: { low: 135, high: 180, unit: 'g/L' },
    conversion: null,
    stored: { low: 135, high: 180, unit: 'g/L' },
  },
  {
    markerKey: 'haemoglobin-f',
    sex: 'FEMALE',
    printed: { low: 115, high: 160, unit: 'g/L' },
    conversion: null,
    stored: { low: 115, high: 160, unit: 'g/L' },
    note: 'The seed carries the female haemoglobin as its own marker. Same source row as `haemoglobin`.',
  },
  {
    markerKey: 'haemoglobin-f',
    sex: 'MALE',
    printed: { low: 135, high: 180, unit: 'g/L' },
    conversion: null,
    stored: { low: 135, high: 180, unit: 'g/L' },
    note: 'The seed carries the female haemoglobin as its own marker. Same source row as `haemoglobin`.',
  },
  {
    markerKey: 'rbc',
    sex: 'FEMALE',
    printed: { low: 3.8, high: 5.8, unit: '10^12/L' },
    conversion: null,
    stored: { low: 3.8, high: 5.8, unit: '10^12/L' },
  },
  {
    markerKey: 'rbc',
    sex: 'MALE',
    printed: { low: 4.6, high: 6.5, unit: '10^12/L' },
    conversion: null,
    stored: { low: 4.6, high: 6.5, unit: '10^12/L' },
  },
  {
    markerKey: 'troponin-i',
    sex: 'FEMALE',
    printed: { low: 1, high: 16, unit: 'ng/L' },
    conversion: null,
    stored: { low: 1, high: 16, unit: 'ng/L' },
  },
  {
    markerKey: 'troponin-i',
    sex: 'MALE',
    printed: { low: 1, high: 34, unit: 'ng/L' },
    conversion: null,
    stored: { low: 1, high: 34, unit: 'ng/L' },
  },
  {
    markerKey: 'microalbumin-creatinine-ratio',
    sex: 'FEMALE',
    printed: { low: 0, high: 3.5, unit: 'mg/mmol' },
    conversion: null,
    stored: { low: 0, high: 3.5, unit: 'mg/mmol' },
  },
  {
    markerKey: 'microalbumin-creatinine-ratio',
    sex: 'MALE',
    printed: { low: 0, high: 2.5, unit: 'mg/mmol' },
    conversion: null,
    stored: { low: 0, high: 2.5, unit: 'mg/mmol' },
    note: 'The male upper limit is LOWER than the female one. That is the direction the source prints and it is the expected direction for this analyte, unlike the two iron rows in WITHHELD.',
  },
  {
    markerKey: 'total-psa',
    sex: 'MALE',
    printed: { low: 0, high: 3.0, unit: 'µg/L' },
    conversion: null,
    stored: { low: 0, high: 3.0, unit: 'µg/L' },
    note: 'Men under 60 only. The source age-bands the upper limit above 60 and the catalogue stores no age brackets at all, so this row is stored WITHOUT an age bound and is therefore wrong for men over 60 in the conservative direction (it suggests a lower ceiling than the source does). The age dependence stays flagged in the audit.',
  },
  {
    markerKey: 'ca-125',
    sex: 'FEMALE',
    printed: { low: 0, high: 35, unit: 'kU/L' },
    conversion: null,
    stored: { low: 0, high: 35, unit: 'kU/L' },
  },

  // ── CONVERTED. Read the note at the top of this file before touching. ─────
  {
    markerKey: 'uric-acid',
    sex: 'FEMALE',
    printed: { low: 0.12, high: 0.36, unit: 'mmol/L' },
    conversion: { factor: 1000, why: '1 mmol/L = 1000 µmol/L. Lothian print urate in mmol/L; the catalogue stores uric acid in µmol/L.' },
    stored: { low: 120, high: 360, unit: 'µmol/L' },
  },
  {
    markerKey: 'uric-acid',
    sex: 'MALE',
    printed: { low: 0.12, high: 0.42, unit: 'mmol/L' },
    conversion: { factor: 1000, why: '1 mmol/L = 1000 µmol/L. Lothian print urate in mmol/L; the catalogue stores uric acid in µmol/L.' },
    stored: { low: 120, high: 420, unit: 'µmol/L' },
  },
  {
    markerKey: 'haematocrit',
    sex: 'FEMALE',
    printed: { low: 0.37, high: 0.47, unit: 'L/L' },
    conversion: { factor: 100, why: 'A haematocrit in L/L is a fraction; the catalogue stores it as a percentage, which is the same quantity ×100.' },
    stored: { low: 37, high: 47, unit: '%' },
  },
  {
    markerKey: 'haematocrit',
    sex: 'MALE',
    printed: { low: 0.4, high: 0.52, unit: 'L/L' },
    conversion: { factor: 100, why: 'A haematocrit in L/L is a fraction; the catalogue stores it as a percentage, which is the same quantity ×100.' },
    stored: { low: 40, high: 52, unit: '%' },
  },
];

/**
 * NOT LOADED, AND WHY. Every one of these is in the source document or on the
 * sex-specific list; each is refused for its own reason, and the reason is
 * recorded because "we did not do it" and "we did not think of it" are
 * indistinguishable a month later.
 *
 * The flag marking each of these as awaiting a sex-specific range STAYS ON.
 * Loading ten of twenty does not clear the problem for the other ten, and a
 * flag cleared by a partial fix is worse than one never raised.
 */
export interface WithheldRange {
  markerKey: string;
  name: string;
  why: string;
}

export const WITHHELD: WithheldRange[] = [
  {
    markerKey: 'ferritin',
    name: 'Ferritin',
    why:
      'THE SOURCE ROW APPEARS TRANSPOSED. It lists the FEMALE range higher than the male one, which is the wrong direction for ferritin — iron stores are lower in premenopausal women, not higher — and every other row in that table has the expected direction. A transposed iron-status range is invisible on screen and inverts iron deficiency for every patient. Left exactly as it is, flagged, and raised with the source rather than corrected by us.',
  },
  {
    markerKey: 'iron',
    name: 'Serum Iron',
    why:
      'Same as ferritin, and the two rows sit together: the source lists the FEMALE range higher than the male one, which is the wrong direction for serum iron. It appears transposed in the source document. Left exactly as it is and flagged.',
  },
  {
    markerKey: 'ggt',
    name: 'Gamma-Glutamyltransferase (GGT)',
    why:
      'Already agrees with a SOURCED RANDOX range of 10–71 U/L (HSC5 Basic Screen p12). A published third-party range does not overwrite a Randox one, ever — reference intervals are assay-specific and the laboratory that ran the test outranks a laboratory that did not.',
  },
  {
    markerKey: 'hdl',
    name: 'HDL Cholesterol',
    why:
      'THE STORED 1.55 IS NOT A REFERENCE INTERVAL. It is a DESIRABLE THRESHOLD printed on the Randox report ("≥1.55 Desirable"), which is a different kind of number from a population interval: one is guidance about risk, the other describes where most people sit. Replacing one with the other would silently change what the range means while leaving it looking the same.',
  },
  {
    markerKey: 'fsh',
    name: 'Follicle Stimulating Hormone (FSH)',
    why: 'A reproductive hormone. The source excludes them by title, because they are immunoassay-platform-specific and cycle-dependent. Waits for Randox.',
  },
  {
    markerKey: 'lh',
    name: 'Luteinising Hormone',
    why: 'A reproductive hormone. The source excludes them by title. Waits for Randox.',
  },
  {
    markerKey: 'prolactin',
    name: 'Prolactin',
    why: 'A reproductive hormone. The source excludes them by title. Waits for Randox.',
  },
  {
    markerKey: 'shbg',
    name: 'Sex Hormone Binding Globulin (SHBG)',
    why: 'A reproductive hormone. The source excludes them by title. Waits for Randox.',
  },
  {
    markerKey: 'dhea-s',
    name: 'DHEAS',
    why: 'A reproductive hormone. The source excludes them by title. Waits for Randox.',
  },
  {
    markerKey: 'oestradiol',
    name: 'Oestradiol',
    why: 'A reproductive hormone. The source excludes them by title. Waits for Randox.',
  },
  {
    markerKey: 'testosterone',
    name: 'Testosterone',
    why: 'A reproductive hormone. The source excludes them by title. Waits for Randox.',
  },
  {
    markerKey: 'free-androgen-index',
    name: 'Free Androgen Index',
    why:
      'Calculated from testosterone and SHBG, both of which the source excludes. Waits for Randox, and inherits whatever those two get.',
  },
  { markerKey: 'apo-a1', name: 'Apolipoprotein A-I', why: 'Sex-dependent in clinical use and NOT in the source document.' },
  { markerKey: 'myoglobin', name: 'Myoglobin', why: 'Sex-dependent in clinical use and NOT in the source document.' },
  {
    markerKey: 'transferrin-saturation',
    name: 'Transferrin Saturation',
    why: 'Sex-dependent in clinical use and NOT in the source document. It is also derived from iron and TIBC, so it would inherit the transposition problem above.',
  },
  { markerKey: 'cystatin-c', name: 'Cystatin C', why: 'Sex-dependent in clinical use and NOT in the source document.' },
  {
    markerKey: 'esr',
    name: 'ESR (Erythrocyte Sedimentation Rate)',
    why: 'Sex-dependent in clinical use and NOT in the source document. Its conventional limit is calculated from age as well, which the catalogue cannot express yet.',
  },
];

/** The sentence written into `ReferenceRange.source` for a loaded row. */
export function publishedRangeSource(range: PublishedRange): string {
  const cited = `${LOTHIAN.publisher}, "${LOTHIAN.document}", ${LOTHIAN.date}`;
  const converted = range.conversion
    ? ` Converted from ${range.printed.low}–${range.printed.high} ${range.printed.unit} (×${range.conversion.factor}): ${range.conversion.why}`
    : '';
  return (
    `${range.sex === 'MALE' ? 'Male' : 'Female'} ${range.stored.low}–${range.stored.high} ${range.stored.unit}. ` +
    `Source: ${cited}. NOT a Randox range — replaced when the Pathology Services Catalogue or a female HSC5 report arrives.${converted}` +
    (range.note ? ` ${range.note}` : '')
  );
}
