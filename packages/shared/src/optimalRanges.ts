import type { Sex } from './types.js';

/**
 * Personalised optimal ranges — a second, advisory band shown ALONGSIDE the
 * lab's reference range, never instead of it.
 *
 * Three rules hold everywhere this table is read:
 *
 *  1. The lab reference range on the result stays the sole authority for a
 *     marker's status. Nothing here ever changes IN_RANGE / HIGH / LOW /
 *     SIGNIFICANT_*. A result can sit inside the lab range and outside the
 *     optimal band, and that is stated calmly — "in range, outside optimal" —
 *     never as a problem.
 *  2. Where published clinical guidance defines an optimal or desirable band,
 *     it is recorded here with the guideline it comes from and marked
 *     `established`. Where it does not, the marker still gets an entry, with
 *     `low`/`high` null and confidence `no established optimal`. That gap is
 *     deliberate and is required: extrapolating from a related marker, or
 *     narrowing a reference interval by eye, would manufacture a clinical
 *     claim nobody has made.
 *  3. Nothing here is derived from a patient's own history. A value that has
 *     drifted upward over ten years must not have that drift normalised into
 *     "optimal for you" — personalisation is by biological sex and age band
 *     only, from static configuration, resolved without any model call.
 *
 * Units are the units the marker is reported in by this clinic (Marker
 * .defaultUnit, seeded in apps/server/prisma/seed.ts). Where the source
 * guideline states a range in different units, the conversion is applied here
 * and named in `note` — a band whose units silently disagree with the value
 * beside it is worse than no band.
 */

export type OptimalConfidence = 'established' | 'no established optimal';

export interface OptimalRangeEntry {
  /** Marker.key. */
  markerKey: string;
  /** Which cohort this entry applies to. ANY = the distinction isn't sex-dependent. */
  sex: Sex;
  /** Inclusive age bounds in whole years; null means unbounded on that side. */
  ageMin: number | null;
  ageMax: number | null;
  /** Null on a side the guidance doesn't bound (e.g. "below 5.0" has no floor). Both null when there is no established optimal. */
  low: number | null;
  high: number | null;
  /** Must match the unit this clinic reports the marker in. */
  unit: string;
  /** The guideline or body this comes from, named. Empty only for `no established optimal` entries. */
  source: string;
  confidence: OptimalConfidence;
  /** Unit conversions applied, or why no optimal exists. */
  note?: string;
}

/**
 * Bumped whenever a band, a source or a cohort boundary changes. Stored
 * alongside nothing yet — it exists so a future audit can say which revision
 * of this table a given rendering came from.
 */
export const OPTIMAL_RANGE_TABLE_VERSION = 1;

const NO_OPTIMAL = 'no established optimal' as const;

/** Shorthand for the common case: a marker with no established optimal band. */
function gap(markerKey: string, unit: string, note: string): OptimalRangeEntry {
  return {
    markerKey,
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: null,
    high: null,
    unit,
    source: '',
    confidence: NO_OPTIMAL,
    note,
  };
}

export const OPTIMAL_RANGES: readonly OptimalRangeEntry[] = [
  // -------------------------------------------------------------------------
  // Full blood count
  //
  // No published guidance defines an optimal sub-band inside the reference
  // interval for any cell count or index. The reference interval IS the
  // clinical statement for these, and narrowing it would invent one.
  // -------------------------------------------------------------------------
  gap('haemoglobin', 'g/L', 'WHO defines anaemia thresholds (below 130 g/L in men, 120 g/L in women), which are the floor of the reference interval rather than an optimal band. No guideline defines an optimal sub-band.'),
  gap('haemoglobin-f', 'g/L', 'WHO defines anaemia thresholds (below 120 g/L in women), which are the floor of the reference interval rather than an optimal band. No guideline defines an optimal sub-band.'),
  gap('wbc', '10^9/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('platelets', '10^9/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('rbc', '10^12/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('haematocrit', '%', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('mcv', 'fL', 'No published optimal sub-band; MCV is interpreted directionally against the reference interval, not against a target.'),
  gap('mch', 'pg', 'No published optimal sub-band; MCH is interpreted directionally against the reference interval, not against a target.'),
  gap('mchc', 'g/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('rdw', '%', 'No published optimal sub-band. Raised RDW is used as a directional clue alongside other indices, not against a target.'),
  gap('neutrophils', '10^9/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('lymphocytes', '10^9/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('monocytes', '10^9/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('eosinophils', '10^9/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('basophils', '10^9/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),

  // -------------------------------------------------------------------------
  // Liver
  // -------------------------------------------------------------------------
  {
    markerKey: 'alt',
    sex: 'MALE',
    ageMin: null,
    ageMax: null,
    low: null,
    high: 33,
    unit: 'U/L',
    source:
      'American College of Gastroenterology Clinical Guideline: Evaluation of Abnormal Liver Chemistries (Am J Gastroenterol 2017) — true upper limit of normal ALT is 33 U/L in men, below the upper limit most laboratories report.',
    confidence: 'established',
    note: 'Sex-specific. Derived from healthy-donor cohorts (Prati et al., Ann Intern Med 2002) and adopted as the ACG reference standard.',
  },
  {
    markerKey: 'alt',
    sex: 'FEMALE',
    ageMin: null,
    ageMax: null,
    low: null,
    high: 25,
    unit: 'U/L',
    source:
      'American College of Gastroenterology Clinical Guideline: Evaluation of Abnormal Liver Chemistries (Am J Gastroenterol 2017) — true upper limit of normal ALT is 25 U/L in women, below the upper limit most laboratories report.',
    confidence: 'established',
    note: 'Sex-specific. Derived from healthy-donor cohorts (Prati et al., Ann Intern Med 2002) and adopted as the ACG reference standard.',
  },
  gap('ast', 'U/L', 'The ACG 2017 guideline defines a healthy upper limit for ALT specifically and does not do so for AST. Extrapolating ALT’s figure to AST would be an estimate, not a source.'),
  gap('ggt', 'U/L', 'No published optimal band. GGT is interpreted as a directional marker (notably of alcohol intake and bile flow) rather than against a target.'),
  gap('bilirubin', 'µmol/L', 'No published optimal band. Mildly raised bilirubin in isolation is commonly a benign inherited variant, so a narrower target would misrepresent it.'),
  gap('albumin', 'g/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('alp', 'U/L', 'No published optimal sub-band. ALP varies with bone turnover and age, and no guideline defines a target within the interval.'),
  gap('total-protein', 'g/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),

  // -------------------------------------------------------------------------
  // Kidney
  // -------------------------------------------------------------------------
  gap('creatinine', 'µmol/L', 'No published optimal band. Creatinine is interpreted through eGFR and varies with muscle mass, so a target concentration would be misleading.'),
  {
    markerKey: 'egfr',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: 90,
    high: null,
    unit: 'mL/min/1.73m²',
    source:
      'KDIGO 2012 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease — GFR category G1 (90 mL/min/1.73m² or above) is normal kidney function.',
    confidence: 'established',
    note: 'One-sided: KDIGO bounds this below only. There is no upper bound, so none is invented.',
  },
  gap('urea', 'mmol/L', 'No published optimal sub-band; urea reflects hydration and protein intake as much as kidney function.'),
  gap('sodium', 'mmol/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('potassium', 'mmol/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('chloride', 'mmol/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('phosphate', 'mmol/L', 'No published optimal sub-band for adults with normal kidney function.'),

  // -------------------------------------------------------------------------
  // Heart health — the area with the most genuinely published desirable bands.
  // -------------------------------------------------------------------------
  {
    markerKey: 'total-cholesterol',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: null,
    high: 5.0,
    unit: 'mmol/L',
    source:
      'Joint British Societies’ consensus recommendations (JBS3, Heart 2014) and NICE CG181 — total cholesterol below 5.0 mmol/L is the desirable level in the general population.',
    confidence: 'established',
    note: 'One-sided: the guidance bounds this above only.',
  },
  {
    markerKey: 'hdl',
    sex: 'MALE',
    ageMin: null,
    ageMax: null,
    low: 1.0,
    high: null,
    unit: 'mmol/L',
    source:
      'ESC/EAS 2019 Guidelines for the Management of Dyslipidaemias and JBS3 (Heart 2014) — HDL cholesterol below 1.0 mmol/L in men marks increased cardiovascular risk, so 1.0 mmol/L is the desirable floor.',
    confidence: 'established',
    note: 'Sex-specific and one-sided: the guidance bounds this below only.',
  },
  {
    markerKey: 'hdl',
    sex: 'FEMALE',
    ageMin: null,
    ageMax: null,
    low: 1.2,
    high: null,
    unit: 'mmol/L',
    source:
      'ESC/EAS 2019 Guidelines for the Management of Dyslipidaemias and JBS3 (Heart 2014) — HDL cholesterol below 1.2 mmol/L in women marks increased cardiovascular risk, so 1.2 mmol/L is the desirable floor.',
    confidence: 'established',
    note: 'Sex-specific and one-sided: the guidance bounds this below only.',
  },
  {
    markerKey: 'ldl',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: null,
    high: 3.0,
    unit: 'mmol/L',
    source:
      'NICE CG181 and JBS3 (Heart 2014) — LDL cholesterol below 3.0 mmol/L in primary prevention.',
    confidence: 'established',
    note: 'One-sided. People already treated for established cardiovascular disease have lower, individually-set targets that this general band does not represent.',
  },
  {
    markerKey: 'triglycerides',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: null,
    high: 1.7,
    unit: 'mmol/L',
    source:
      'ESC/EAS 2019 Guidelines for the Management of Dyslipidaemias — fasting triglycerides below 1.7 mmol/L (150 mg/dL) is the desirable level.',
    confidence: 'established',
    note: 'Converted from 150 mg/dL by dividing by 88.57. One-sided.',
  },
  {
    markerKey: 'chol-hdl-ratio',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: null,
    high: 4.0,
    unit: 'ratio',
    source:
      'Joint British Societies’ consensus recommendations (JBS3, Heart 2014) — a total cholesterol to HDL cholesterol ratio below 4.0 is desirable.',
    confidence: 'established',
    note: 'Dimensionless. Randox print this analyte with a "%" unit on their report, which is a labelling artefact — the figure is a ratio and is stored and compared as one.',
  },
  {
    markerKey: 'apob',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: null,
    high: 1.0,
    unit: 'g/L',
    source:
      'ESC/EAS 2019 Guidelines for the Management of Dyslipidaemias — ApoB below 100 mg/dL for people at low to moderate cardiovascular risk.',
    confidence: 'established',
    note: 'Converted from 100 mg/dL to 1.0 g/L by dividing by 100. One-sided.',
  },
  gap('lp-pla2', 'ng/mL', 'Lp-PLA2 is an emerging risk marker with no guideline-defined optimal band. Assay-specific cut-points exist in the research literature but no clinical body has adopted one.'),
  {
    markerKey: 'omega-3-index',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: 8,
    high: 12,
    unit: '%',
    source:
      'Harris WS, von Schacky C. The Omega-3 Index: a new risk factor for death from coronary heart disease? (Preventive Medicine 2004) — proposed target zone of 8–12% of red cell membrane fatty acids.',
    confidence: 'established',
    note: 'The one marker in this table whose reference interval and target zone are the same published proposal; both sides are bounded by the source.',
  },

  // -------------------------------------------------------------------------
  // Diabetes health
  // -------------------------------------------------------------------------
  {
    markerKey: 'glucose',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: 3.9,
    high: 5.5,
    unit: 'mmol/L',
    source:
      'American Diabetes Association Standards of Care in Diabetes — normal fasting plasma glucose is 3.9–5.5 mmol/L (70–99 mg/dL); 5.6–6.9 mmol/L is impaired fasting glucose.',
    confidence: 'established',
    note: 'Converted from 70–99 mg/dL by dividing by 18.0182. Applies to a fasting sample only; a non-fasting glucose has no optimal band and should be read against the lab range alone.',
  },
  {
    markerKey: 'hba1c',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: null,
    high: 42,
    unit: 'mmol/mol',
    source:
      'WHO 2011 use of HbA1c in the diagnosis of diabetes mellitus, and NICE NG238 — below 42 mmol/mol (6.0%) is normoglycaemic; 42–47 mmol/mol is non-diabetic hyperglycaemia.',
    confidence: 'established',
    note: 'IFCC units. Equivalent to below 6.0% in NGSP/DCCT units. One-sided.',
  },
  gap('fasting-insulin', 'mIU/L', 'No clinical body defines an optimal fasting insulin. Assay standardisation between laboratories is poor enough that a cross-assay target would not be comparable.'),

  // -------------------------------------------------------------------------
  // Inflammation & general
  // -------------------------------------------------------------------------
  {
    markerKey: 'hs-crp',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: null,
    high: 1.0,
    unit: 'mg/L',
    source:
      'Pearson TA et al., Markers of Inflammation and Cardiovascular Disease — AHA/CDC Scientific Statement (Circulation 2003) — hs-CRP below 1.0 mg/L is the low cardiovascular-risk stratum.',
    confidence: 'established',
    note: 'One-sided. The same statement notes a single raised value should be repeated, as acute illness raises hs-CRP transiently.',
  },
  gap('crp', 'mg/L', 'Standard-sensitivity CRP is an acute-phase marker read against its reference interval. The AHA/CDC risk strata apply to the high-sensitivity assay only and are not transferable to this one.'),
  gap('il-6', 'pg/mL', 'No guideline-defined optimal band; IL-6 is used in research and in specific disease monitoring, not against a general target.'),
  gap('tnf-alpha', 'pg/mL', 'No guideline-defined optimal band; assay values are not comparable between platforms.'),
  gap('homocysteine', 'µmol/L', 'No guideline sets a target. Trials lowering homocysteine have not reduced cardiovascular events, so ESC guidance deliberately declines to define one.'),
  {
    markerKey: 'calprotectin',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: null,
    high: 50,
    unit: 'µg/g',
    source:
      'NICE DG11: Faecal calprotectin diagnostic tests for inflammatory diseases of the bowel — below 50 µg/g makes inflammatory bowel disease unlikely.',
    confidence: 'established',
    note: 'One-sided. This is the threshold NICE adopt for the general adult population; it is not a treatment target for anyone with a known bowel condition.',
  },
  gap('esr', 'mm/hr', 'ESR’s expected value rises with age and differs by sex, and no body defines an optimal within that. It is a non-specific marker read alongside symptoms.'),
  gap('uric-acid', 'µmol/L', 'EULAR define a serum urate treatment target (below 360 µmol/L) for people who already have gout. That is a treatment target in an existing condition, not an optimal for the general population, so it is not recorded here as one.'),

  // -------------------------------------------------------------------------
  // Thyroid
  // -------------------------------------------------------------------------
  gap('tsh', 'mIU/L', 'No guideline defines an optimal sub-band. Narrower "optimal TSH" figures circulate but none is adopted by the British Thyroid Association, NICE or the ETA.'),
  gap('free-t4', 'pmol/L', 'No guideline defines an optimal sub-band; Free T4 is interpreted alongside TSH against the assay’s own reference interval.'),
  gap('free-t3', 'pmol/L', 'No guideline defines an optimal sub-band; Free T3 falls in non-thyroidal illness, so a target would misread that.'),

  // -------------------------------------------------------------------------
  // Nutritional & vitamin health
  // -------------------------------------------------------------------------
  {
    markerKey: 'vitamin-d',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: 50,
    high: 125,
    unit: 'nmol/L',
    source:
      'SACN Vitamin D and Health report 2016 — serum 25(OH)D at or above 50 nmol/L year-round for musculoskeletal health; Institute of Medicine 2011 place 125 nmol/L as the concentration above which adverse effects have been reported.',
    confidence: 'established',
    note: 'Two sources, one for each side: SACN bound it below, the IOM above. Both are stated so neither is mistaken for the other’s work.',
  },
  gap('vitamin-b12', 'ng/L', 'BCSH guidance defines a deficiency threshold, which is the floor of the reference interval rather than an optimal band. No body defines a target above it.'),
  gap('folate', 'µg/L', 'WHO define a red-cell folate threshold for neural tube defect risk in women planning pregnancy. That is a different analyte from serum folate and is not transferable to it.'),
  gap('ferritin', 'µg/L', 'WHO (2020) and BSG (2021) define iron-deficiency thresholds, which set the floor of the reference interval. No body defines an optimal band above that floor, and ferritin rises with inflammation independently of iron stores.'),
  gap('iron', 'µmol/L', 'Serum iron swings with recent diet and time of day, so no optimal band is defined; iron status is read through ferritin and transferrin saturation.'),
  gap('tibc', 'µmol/L', 'No published optimal band; TIBC is interpreted alongside serum iron and ferritin rather than against a target.'),
  gap('calcium', 'mmol/L', 'No published optimal sub-band; the reference interval is the clinical statement.'),
  gap('rbc-magnesium', 'mmol/L', 'Red cell magnesium has no standardised reference method between laboratories, and no body defines an optimal band.'),
  gap('zinc', 'µmol/L', 'No published optimal sub-band; plasma zinc falls during inflammation independently of zinc status.'),

  // -------------------------------------------------------------------------
  // Hormone health
  //
  // Uniformly no established optimal: sex hormone concentrations vary with
  // the menstrual cycle, time of day and life stage, and the society
  // thresholds that exist are diagnostic or treatment thresholds in a named
  // condition rather than optimal bands for a well population.
  // -------------------------------------------------------------------------
  gap('testosterone', 'nmol/L', 'BSSM and Endocrine Society thresholds for testosterone are diagnostic thresholds used alongside symptoms in suspected hypogonadism, not an optimal band for a well population.'),
  gap('testosterone-f', 'nmol/L', 'No guideline defines an optimal female testosterone; the reference interval is the clinical statement.'),
  gap('free-testosterone', 'pmol/L', 'Calculated free testosterone varies with the formula and the SHBG assay used, so no cross-laboratory optimal band exists.'),
  gap('oestradiol', 'pmol/L', 'Oestradiol varies several-fold across the menstrual cycle and falls at menopause; a single optimal band cannot represent that.'),
  gap('amh', 'pmol/L', 'AMH declines naturally with age and is interpreted against age-specific reference data for fertility planning, not against an optimal.'),
  gap('fsh', 'IU/L', 'FSH varies across the menstrual cycle; no guideline defines an optimal band.'),
  gap('lh', 'IU/L', 'LH varies across the menstrual cycle and surges at ovulation; no guideline defines an optimal band.'),
  gap('progesterone', 'nmol/L', 'Progesterone is interpreted against the day of the cycle it was drawn on, not against an optimal band.'),
  gap('prolactin', 'mIU/L', 'No guideline defines an optimal band; prolactin rises transiently with stress and after eating.'),
  gap('shbg', 'nmol/L', 'No guideline defines an optimal band; SHBG is interpreted alongside total and free testosterone.'),
  gap('dhea-s', 'µmol/L', 'DHEA-S declines steadily with age and is interpreted against age-specific reference data, not against an optimal.'),
  gap('cortisol', 'nmol/L', 'Cortisol follows a strong diurnal rhythm; a single optimal band would misrepresent any sample not drawn at the same time of day.'),
];

/**
 * Two spellings of one unit.
 *
 * Randox print "mmol/l" and "10⁹/L"; our catalogue holds "mmol/L" and
 * "10^9/L". Those are the same unit and refusing to show an optimal band over
 * a lower-case "l" would be pedantry rather than safety.
 *
 * Deliberately an explicit alias list rather than a case-insensitive compare:
 * case genuinely carries meaning in some unit strings — mIU/L (milli-
 * international units) and MIU/L (mega-international units) differ by a
 * factor of a billion — so anything not named here passes through unchanged
 * and simply doesn't match. Same rule as lib/unitConversion.ts: named
 * equivalences only, never a silent coercion.
 */
const UNIT_ALIASES: Record<string, string> = {
  'mmol/l': 'mmol/L',
  'µmol/l': 'µmol/L',
  'umol/l': 'µmol/L',
  'umol/L': 'µmol/L',
  'μmol/l': 'µmol/L', // Greek mu (U+03BC) rather than the micro sign (U+00B5)
  'μmol/L': 'µmol/L',
  'nmol/l': 'nmol/L',
  'pmol/l': 'pmol/L',
  'g/l': 'g/L',
  'mg/l': 'mg/L',
  'ng/l': 'ng/L',
  'µg/l': 'µg/L',
  'ug/l': 'µg/L',
  'ug/L': 'µg/L',
  'μg/l': 'µg/L',
  'μg/L': 'µg/L',
  'µg/g': 'µg/g',
  'μg/g': 'µg/g',
  'u/l': 'U/L',
  'U/l': 'U/L',
  'iu/l': 'IU/L',
  'IU/l': 'IU/L',
  fl: 'fL',
  Fl: 'fL',
  FL: 'fL',
  'ml/min/1.73m²': 'mL/min/1.73m²',
  'mL/min/1.73m2': 'mL/min/1.73m²',
  '10⁹/L': '10^9/L',
  '10⁹/l': '10^9/L',
  '10^9/l': '10^9/L',
  '10¹²/L': '10^12/L',
  '10¹²/l': '10^12/L',
  '10^12/l': '10^12/L',
  'pg/ml': 'pg/mL',
  'ng/ml': 'ng/mL',
  'miu/l': 'mIU/L', // lower-case throughout is unambiguous; MIU/L is not aliased
  'mm/h': 'mm/hr',
};

export function canonicalUnit(unit: string): string {
  const trimmed = unit.trim();
  return UNIT_ALIASES[trimmed] ?? trimmed;
}

/** The resolved band, or the stated absence of one. Never a guess. */
export type OptimalRangeResolution =
  | {
      status: 'established';
      /** At least one of low/high is non-null. */
      low: number | null;
      high: number | null;
      unit: string;
      source: string;
      sex: Sex;
    }
  | { status: 'none' };

/** More specific entries (sex-specific, age-bracketed) win over ANY/unbounded ones. */
function specificity(e: OptimalRangeEntry): number {
  let score = 0;
  if (e.sex !== 'ANY') score += 2;
  if (e.ageMin != null || e.ageMax != null) score += 1;
  return score;
}

function ageMatches(e: OptimalRangeEntry, age: number | null): boolean {
  if (e.ageMin != null && (age == null || age < e.ageMin)) return false;
  if (e.ageMax != null && (age == null || age > e.ageMax)) return false;
  return true;
}

/**
 * The optimal band for this marker, this patient, in the unit the value is
 * being displayed in.
 *
 * Returns `none` rather than a partial answer in every case where an honest
 * answer isn't available: no entry, a deliberate `no established optimal`
 * gap, a sex-specific band with no sex on file, or a unit mismatch. A band
 * whose units disagree with the number printed next to it is a wrong band,
 * not an approximate one — hence the last check.
 */
export function resolveOptimalRange(
  markerKey: string,
  displayUnit: string,
  sex: Sex | null,
  age: number | null,
): OptimalRangeResolution {
  const forMarker = OPTIMAL_RANGES.filter((e) => e.markerKey === markerKey && ageMatches(e, age));
  if (forMarker.length === 0) return { status: 'none' };

  // Sex unknown and this marker's optimal band depends on it: falling through
  // to an ANY entry would hand back a band belonging to the wrong cohort,
  // which is the one failure mode worth refusing outright.
  if (sex == null || sex === 'ANY') {
    if (forMarker.some((e) => e.sex !== 'ANY' && e.confidence === 'established')) return { status: 'none' };
  }

  const candidates = forMarker.filter((e) => e.sex === 'ANY' || e.sex === sex);
  if (candidates.length === 0) return { status: 'none' };

  const best = candidates.slice().sort((a, b) => specificity(b) - specificity(a))[0];
  if (best.confidence !== 'established') return { status: 'none' };
  if (best.low == null && best.high == null) return { status: 'none' };
  if (canonicalUnit(best.unit) !== canonicalUnit(displayUnit)) return { status: 'none' };

  // The band is reported back in the unit the VALUE is printed in, so the two
  // numbers on screen never carry differently-spelled units.
  return { status: 'established', low: best.low, high: best.high, unit: displayUnit, source: best.source, sex: best.sex };
}

/** Whether a numeric value sits inside the resolved band. Null when it can't be said. */
export function isWithinOptimal(value: number | null, low: number | null, high: number | null): boolean | null {
  if (value == null) return null;
  if (low == null && high == null) return null;
  if (low != null && value < low) return false;
  if (high != null && value > high) return false;
  return true;
}

/**
 * "50–125 nmol/L", "below 5.0 mmol/L", "1.0 mmol/L or above" — one phrasing,
 * so the marker card, the detail page and the chart legend can't drift apart.
 */
export function formatOptimalRange(low: number | null, high: number | null, unit: string): string {
  if (low != null && high != null) return `${low}–${high} ${unit}`;
  if (high != null) return `below ${high} ${unit}`;
  if (low != null) return `${low} ${unit} or above`;
  return '';
}

/** Counts for the table's own summary — how much of it is real, and how much is an honest gap. */
export function optimalRangeCoverage() {
  const markers = new Set(OPTIMAL_RANGES.map((e) => e.markerKey));
  const established = new Set(
    OPTIMAL_RANGES.filter((e) => e.confidence === 'established').map((e) => e.markerKey),
  );
  return {
    version: OPTIMAL_RANGE_TABLE_VERSION,
    markerCount: markers.size,
    entryCount: OPTIMAL_RANGES.length,
    establishedMarkerCount: established.size,
    noEstablishedOptimalMarkerCount: markers.size - established.size,
  };
}
