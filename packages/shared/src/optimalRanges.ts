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
export const OPTIMAL_RANGE_TABLE_VERSION = 2;

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
      'American College of Gastroenterology Clinical Guideline: Evaluation of Abnormal Liver Chemistries (Am J Gastroenterol 2017). True upper limit of normal ALT is 33 U/L in men, below the upper limit most laboratories report.',
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
      'American College of Gastroenterology Clinical Guideline: Evaluation of Abnormal Liver Chemistries (Am J Gastroenterol 2017). True upper limit of normal ALT is 25 U/L in women, below the upper limit most laboratories report.',
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
      'KDIGO 2012 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease. GFR category G1 (90 mL/min/1.73m² or above) is normal kidney function.',
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
      'Joint British Societies’ consensus recommendations (JBS3, Heart 2014) and NICE CG181. Total cholesterol below 5.0 mmol/L is the desirable level in the general population.',
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
      'ESC/EAS 2019 Guidelines for the Management of Dyslipidaemias and JBS3 (Heart 2014). HDL cholesterol below 1.0 mmol/L in men marks increased cardiovascular risk, so 1.0 mmol/L is the desirable floor.',
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
      'ESC/EAS 2019 Guidelines for the Management of Dyslipidaemias and JBS3 (Heart 2014). HDL cholesterol below 1.2 mmol/L in women marks increased cardiovascular risk, so 1.2 mmol/L is the desirable floor.',
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
      'NICE CG181 and JBS3 (Heart 2014). LDL cholesterol below 3.0 mmol/L in primary prevention.',
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
      'ESC/EAS 2019 Guidelines for the Management of Dyslipidaemias. Fasting triglycerides below 1.7 mmol/L (150 mg/dL) is the desirable level.',
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
      'Joint British Societies’ consensus recommendations (JBS3, Heart 2014). A total cholesterol to HDL cholesterol ratio below 4.0 is desirable.',
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
      'ESC/EAS 2019 Guidelines for the Management of Dyslipidaemias. ApoB below 100 mg/dL for people at low to moderate cardiovascular risk.',
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
      'Harris WS, von Schacky C. The Omega-3 Index: a new risk factor for death from coronary heart disease? (Preventive Medicine 2004). Proposed target zone of 8–12% of red cell membrane fatty acids.',
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
      'American Diabetes Association Standards of Care in Diabetes. Normal fasting plasma glucose is 3.9–5.5 mmol/L (70–99 mg/dL); 5.6–6.9 mmol/L is impaired fasting glucose.',
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
      'WHO 2011 use of HbA1c in the diagnosis of diabetes mellitus, and NICE NG238. Below 42 mmol/mol (6.0%) is normoglycaemic; 42–47 mmol/mol is non-diabetic hyperglycaemia.',
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
      'Pearson TA et al., Markers of Inflammation and Cardiovascular Disease, AHA/CDC Scientific Statement (Circulation 2003). An hs-CRP below 1.0 mg/L is the low cardiovascular-risk stratum.',
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
      'NICE DG11: Faecal calprotectin diagnostic tests for inflammatory diseases of the bowel. Below 50 µg/g makes inflammatory bowel disease unlikely.',
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
      'SACN Vitamin D and Health report 2016. Serum 25(OH)D at or above 50 nmol/L year-round for musculoskeletal health; Institute of Medicine 2011 place 125 nmol/L as the concentration above which adverse effects have been reported.',
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

  // ===========================================================================
  // The full Randox catalogue (Core, Insight 360, Signature).
  //
  // 121 further MEASURED analytes. Exactly one of them has a published,
  // guideline-adopted optimal band, and it is recorded below with its source.
  // The other 120 are recorded as explicit gaps, each with the reason.
  //
  // That ratio is not an oversight, and writing it down matters more than the
  // one entry does. Almost every analyte here falls into one of four kinds,
  // and none of the four has an optimal band in the sense this table means:
  //
  //  · Autoantibodies and infection serology are answered as positive or
  //    negative against an assay's own cut-off. There is no "better" value
  //    below the cut-off, so a target inside the negative range is meaningless.
  //  · Tumour markers, cardiac markers and enzymes of tissue damage are read
  //    against a diagnostic threshold, and a *lower* result is not a healthier
  //    one. Printing "optimal" beside a CA 125 would be the single most
  //    frightening piece of interface in this product.
  //  · Research and vascular-inflammation analytes (the selectins, the
  //    adhesion molecules, the interleukins, the soluble TNF receptors) are not
  //    standardised between platforms. A number from one assay does not mean
  //    the same thing as the same number from another, so no cross-laboratory
  //    band can exist.
  //  · Personal measurements (height, weight, blood pressure, the two
  //    circumferences) DO have published targets — and they are deliberately
  //    not recorded here. This table drives a band drawn beside a number on a
  //    patient's own results page. Telling someone their waist is "outside
  //    optimal" next to their blood chemistry is a judgement about their body,
  //    delivered by a web page, with no clinician in the room. Blood pressure
  //    in particular has a real NICE threshold, and it belongs in a
  //    consultation, not in a tooltip.
  // ===========================================================================

  {
    markerKey: 'lipoprotein-a',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    low: null,
    high: 75,
    unit: 'nmol/L',
    source:
      'European Atherosclerosis Society 2022 consensus statement on lipoprotein(a) (Kronenberg F et al., Eur Heart J 2022). Below 75 nmol/L (30 mg/dL) carries no appreciable excess cardiovascular risk.',
    confidence: 'established',
    note: 'One-sided. Lp(a) is roughly 90% genetically determined and changes very little with lifestyle, so this band describes inherited risk rather than anything that responds to what the patient does.',
  },

  // --- Autoimmune and allergy: cut-off tests, not graded ones ---------------
  gap('ige', 'kU/L', 'Total IgE is interpreted against an age-specific cut-off and alongside symptoms. Concentrations vary widely in healthy people and no body defines an optimal.'),
  gap('anti-ccp', 'U/mL', 'Reported positive or negative against the assay’s own cut-off. There is no graded optimal below it.'),
  gap('ana', 'titre', 'Reported as a titre and a staining pattern, not a concentration. Low titres are common in healthy people, so no optimal exists.'),
  gap('anti-tg', 'IU/mL', 'An antibody reported against an assay cut-off. Below the cut-off there is nothing to optimise toward.'),
  gap('anti-tpo', 'IU/mL', 'An antibody reported against an assay cut-off. Below the cut-off there is nothing to optimise toward.'),
  gap('anti-ttg', 'U/mL', 'Coeliac serology is read against the assay’s cut-off alongside IgA status and, where indicated, biopsy. No optimal band is defined.'),
  gap('ttg-iga', 'U/mL', 'Coeliac serology is read against the assay’s cut-off alongside total IgA. No optimal band is defined.'),
  gap('gastric-parietal-cell-antibodies', 'U/mL', 'Reported positive or negative against an assay cut-off; no graded optimal exists.'),
  gap('intrinsic-factor-antibodies', 'U/mL', 'Reported positive or negative against an assay cut-off; no graded optimal exists.'),
  gap('rheumatoid-factor', 'IU/mL', 'Reported against an assay cut-off and interpreted alongside anti-CCP and symptoms. Low titres occur in healthy older adults.'),
  gap('t1d-autoantibodies', 'U/mL', 'A panel of islet autoantibodies reported against assay cut-offs. Presence or absence is the result; there is no optimal concentration.'),

  // --- Endocrine and metabolic ---------------------------------------------
  gap('pth', 'pmol/L', 'PTH is interpreted alongside calcium and vitamin D rather than against a target of its own; the same PTH means different things at different calcium levels.'),
  gap('c-peptide', 'nmol/L', 'C-peptide is used to characterise insulin secretion in a known diabetes context, not measured against an optimal in a well population.'),
  gap('fructosamine', 'µmol/L', 'Fructosamine is a shorter-window alternative to HbA1c used where HbA1c is unreliable. No body defines an optimal, and the diabetes thresholds that exist are stated in HbA1c.'),
  gap('nefa', 'mmol/L', 'Non-esterified fatty acids swing several-fold with fasting duration and recent exercise. No optimal band is defined.'),
  gap('adiponectin', 'µg/mL', 'Assay values are not comparable between platforms and no clinical body defines a target.'),
  gap('igf-1', 'nmol/L', 'IGF-1 is interpreted against age- and sex-specific reference data in suspected growth hormone disorders, not against an optimal for a well population.'),
  gap('free-androgen-index', 'ratio', 'A calculated index whose value depends on both the testosterone and the SHBG assay used, so no cross-laboratory optimal exists.'),
  gap('calcitonin', 'ng/L', 'Calcitonin is a tumour marker for medullary thyroid carcinoma, read against a diagnostic threshold. A lower value is not a better one.'),
  gap('thyroid-binding-globulin-tbg', 'mg/L', 'TBG is measured to explain a discordant thyroid result. It has no optimal of its own.'),
  gap('microalbumin-creatinine-ratio', 'mg/mmol', 'KDIGO define albuminuria categories (A1 below 3 mg/mmol), which are the boundary of the reference interval rather than an optimal band inside it.'),

  // --- Cardiac and lipoprotein ---------------------------------------------
  gap('apo-a1', 'g/L', 'ESC/EAS define targets for ApoB and for LDL, and explicitly decline to set one for ApoA-I. Extrapolating from HDL guidance would be an estimate, not a source.'),
  gap('apo-b-a1-ratio', 'ratio', 'Widely studied as a risk marker but no guideline body has adopted a cut-point, and the ratio inherits both assays’ standardisation problems.'),
  gap('apo-cii', 'mg/dL', 'A specialist analyte used in investigating rare dyslipidaemias. No optimal band is defined.'),
  gap('apo-e', 'mg/dL', 'ApoE concentration is interpreted alongside genotype in specialist lipid clinics. No optimal band exists for the concentration alone.'),
  gap('cv-risk-score', '%', 'A calculated 10-year risk estimate, not a measured analyte. NICE act on it at 10% but that is a treatment-discussion threshold, and rendering it as "outside optimal" would misstate what a risk percentage is.'),
  gap('creatine-kinase', 'U/L', 'CK rises for days after ordinary exercise and varies severalfold with muscle mass and ethnicity. No optimal band is defined.'),
  gap('ck-mb', 'µg/L', 'A cardiac injury marker read against a diagnostic threshold, now largely superseded by troponin. A lower value is not a better one.'),
  gap('myoglobin', 'µg/L', 'Released by any skeletal muscle injury including exercise, and read against a diagnostic threshold rather than a target.'),
  gap('troponin-i', 'ng/L', 'A cardiac injury marker with a sex-specific 99th-centile diagnostic threshold. There is no optimal below it, and presenting one would imply a normal troponin could be improved on.'),
  gap('troponin-t', 'ng/L', 'A cardiac injury marker with a 99th-centile diagnostic threshold. There is no optimal below it.'),
  gap('d-dimer', 'µg/L', 'Used with a clinical probability score to rule OUT thrombosis, against an age-adjusted threshold. It has no meaning as a standalone target.'),
  gap('ecg', '', 'A recording interpreted by a clinician, not a measured quantity. There is nothing to bound.'),

  // --- Infection, inflammation and the vascular research panel -------------
  gap('aso', 'IU/mL', 'Antistreptolysin O is read against an age-specific upper limit reflecting recent streptococcal exposure, not against an optimal.'),
  gap('complement-c3', 'g/L', 'C3 is interpreted alongside C4 and clinical context in suspected complement-mediated disease. No optimal sub-band is defined.'),
  gap('e-selectin', 'ng/mL', 'A vascular adhesion marker used in research. Values are not standardised between assay platforms, so no cross-laboratory band can exist.'),
  gap('l-selectin', 'ng/mL', 'A vascular adhesion marker used in research. Values are not standardised between assay platforms.'),
  gap('p-selectin', 'ng/mL', 'A vascular adhesion marker used in research. Values are not standardised between assay platforms.'),
  gap('icam-1', 'ng/mL', 'An endothelial activation marker used in research; no clinical body defines a target and assays are not cross-comparable.'),
  gap('vcam-1', 'ng/mL', 'An endothelial activation marker used in research; no clinical body defines a target and assays are not cross-comparable.'),
  gap('egf', 'pg/mL', 'A growth factor measured in research contexts. No guideline-defined optimal, and results depend heavily on sample handling.'),
  gap('il-8', 'pg/mL', 'A cytokine with no guideline-defined optimal; concentrations are not comparable between assay platforms.'),
  gap('il-10', 'pg/mL', 'A cytokine with no guideline-defined optimal; concentrations are not comparable between assay platforms.'),
  gap('mcp-1', 'pg/mL', 'A chemokine measured in research contexts, with no guideline-defined optimal and no cross-platform standardisation.'),
  gap('mip-1-alpha', 'pg/mL', 'A chemokine measured in research contexts, with no guideline-defined optimal and no cross-platform standardisation.'),
  gap('stnf-r1', 'ng/mL', 'A soluble TNF receptor studied as a kidney-risk marker. No clinical body has adopted a cut-point.'),
  gap('stnf-r2', 'ng/mL', 'A soluble TNF receptor studied as a kidney-risk marker. No clinical body has adopted a cut-point.'),
  gap('h-pylori', '', 'Reported as detected or not detected. A qualitative result has no band.'),

  // --- Iron transport -------------------------------------------------------
  gap('transferrin', 'g/L', 'Transferrin rises in iron deficiency and falls in inflammation, so it is read directionally alongside ferritin rather than against a target.'),
  gap('transferrin-saturation', '%', 'BSG (2021) treat below 20% as supporting iron deficiency and above 45% as prompting investigation for iron overload. Both are the edges of the reference interval, not an optimal band inside it.'),

  // --- Kidney ---------------------------------------------------------------
  gap('b2-microglobulin', 'mg/L', 'Used in specific disease monitoring rather than as a general kidney measure; no optimal band is defined.'),
  gap('bicarbonate', 'mmol/L', 'Part of the acid-base picture and interpreted with it. No published optimal sub-band.'),
  gap('cystatin-c', 'mg/L', 'Cystatin C is interpreted through the eGFR equation it feeds, not against a concentration target.'),
  gap('ngal', 'ng/mL', 'An acute kidney injury marker studied against event thresholds in hospital settings. No optimal is defined for a well population.'),
  gap('magnesium', 'mmol/L', 'Serum magnesium reflects only about 1% of total body magnesium and is held tightly constant, so no optimal sub-band is defined. Distinct from RBC Magnesium, which is a different analyte with its own entry.'),

  // --- Liver ---------------------------------------------------------------
  gap('aldolase', 'U/L', 'A muscle enzyme read alongside CK in suspected myopathy, against the reference interval rather than a target.'),
  gap('bile-acids', 'µmol/L', 'Fasting bile acids are read against a diagnostic threshold, chiefly in obstetric cholestasis. No optimal band is defined.'),
  gap('copper', 'µmol/L', 'Serum copper rises with inflammation and oestrogen independently of copper status, and is interpreted alongside caeruloplasmin. No optimal band exists.'),
  gap('direct-bilirubin', 'µmol/L', 'Interpreted as a fraction of total bilirubin to separate conjugated from unconjugated hyperbilirubinaemia, not against a target.'),
  gap('globulin', 'g/L', 'A calculated difference between total protein and albumin, interpreted alongside both. No optimal sub-band is defined.'),
  gap('gldh', 'U/L', 'A liver-specific enzyme read against its reference interval; no guideline defines a target within it.'),
  gap('ldh', 'U/L', 'Raised by haemolysis, tissue turnover and even a difficult venepuncture. Non-specific by nature, so no optimal band is defined.'),

  // --- Pancreas and gut ----------------------------------------------------
  gap('lipase', 'U/L', 'Read against a diagnostic threshold (three times the upper reference limit) in suspected pancreatitis, not against an optimal.'),
  gap('pancreatic-amylase', 'U/L', 'Read against a diagnostic threshold in suspected pancreatitis, not against an optimal.'),
  gap('gastrin', 'pmol/L', 'Fasting gastrin is interpreted alongside acid-suppressing medication, which raises it substantially. No optimal band is defined.'),
  gap('pepsinogen-1', 'µg/L', 'Interpreted as the Pepsinogen 1/2 ratio in assessing gastric atrophy, not as a standalone target.'),
  gap('pepsinogen-2', 'µg/L', 'Interpreted as the Pepsinogen 1/2 ratio in assessing gastric atrophy, not as a standalone target.'),
  gap('qfit', 'µg Hb/g', 'NICE DG56 act on faecal haemoglobin at or above 10 µg Hb/g. That is a referral threshold, and the result below it is simply negative — there is no optimal to approach.'),

  // --- Nutritional ---------------------------------------------------------
  gap('glutathione-reductase', 'U/g Hb', 'Used as an activation coefficient to assess riboflavin status rather than as an absolute activity with a target.'),

  // --- Tumour markers ------------------------------------------------------
  // Every one of these deliberately has no band. They are read against a
  // diagnostic threshold and, in screening, against a trend over time. A
  // "within optimal" printed beside one would imply the opposite reading is
  // available, and there is no version of that sentence a patient should meet
  // on a web page without a clinician.
  gap('afp', 'kU/L', 'A tumour marker read against a diagnostic threshold and, in surveillance, against its own trend. There is no optimal below the threshold.'),
  gap('beta-hcg', 'IU/L', 'Read against a diagnostic threshold and, in pregnancy, against gestation. There is no optimal band.'),
  gap('ca-15-3', 'kU/L', 'A tumour marker used for monitoring rather than screening, read against its own previous values. No optimal band exists.'),
  gap('ca-19-9', 'kU/L', 'A tumour marker read against a diagnostic threshold. Around 5–10% of people cannot express it at all, so a low value is not informative on its own.'),
  gap('ca-125', 'kU/L', 'Read against a diagnostic threshold and affected by menstruation, endometriosis and pregnancy. There is no optimal below it.'),
  gap('cea', 'µg/L', 'A tumour marker read against a diagnostic threshold and raised by smoking independently of any disease.'),
  gap('nse', 'µg/L', 'A tumour marker read against a diagnostic threshold; haemolysis in the sample raises it artefactually.'),
  gap('total-psa', 'µg/L', 'PSA thresholds are age-specific referral thresholds used alongside examination and MRI, not an optimal band. It also rises with a benign prostate, cycling and recent ejaculation.'),
  gap('prostate-cancer-risk-score', '', 'A calculated risk score rather than a measured analyte, and one that only means anything in a conversation about what to do next.'),

  // --- Epstein-Barr serology -----------------------------------------------
  gap('epstein-barr-antibodies', 'index', 'Reported as reactive or non-reactive against the assay’s index cut-off. Past infection is extremely common and is not a finding to optimise.'),
  gap('epstein-barr-nuclear-antigen-igg', 'index', 'An index against the assay cut-off, used with the other EBV antibodies to date an infection rather than grade it.'),
  gap('epstein-barr-viral-capsid-antigen-igg', 'index', 'An index against the assay cut-off, used with the other EBV antibodies to date an infection rather than grade it.'),
  gap('epstein-barr-viral-capsid-antigen-igm', 'index', 'An index against the assay cut-off, indicating recent infection. There is no optimal value.'),

  // --- Urinalysis ----------------------------------------------------------
  // A dipstick is read as negative, trace, or a + grade. Qualified "(urine)" in
  // the catalogue so none of these can ever be confused with the blood analyte
  // of the same name — a dipstick glucose is not a fasting plasma glucose.
  gap('bilirubin-urine', '', 'A dipstick grade, not a concentration. Nothing to bound.'),
  gap('glucose-urine', '', 'A dipstick grade, not a concentration, and not interchangeable with a plasma glucose.'),
  gap('ketones-urine', '', 'A dipstick grade. Present in ordinary fasting and low-carbohydrate eating as well as in illness.'),
  gap('ph-urine', 'pH', 'Urine pH swings with diet and time of day by design — that is the kidney working. No optimal band is defined.'),
  gap('protein-urine', '', 'A dipstick grade. Quantified properly by the albumin/creatinine ratio, which has its own entry.'),
  gap('red-blood-cells-urine', '', 'A dipstick grade, confirmed by microscopy where it matters. Nothing to bound.'),
  gap('urobilinogen-urine', '', 'A dipstick grade. Nothing to bound.'),
  gap('white-blood-cells-urine', '', 'A dipstick grade, confirmed by culture where it matters. Nothing to bound.'),
  gap('nitrite-urine', '', 'Positive or negative. A qualitative result has no band.'),

  // --- UTI panel -----------------------------------------------------------
  // Detected / not detected, every one of them. Listed individually rather
  // than handled by a blanket rule so the table can state, per analyte, that
  // the absence of a band is deliberate.
  ...[
    'acinetobacter-baumannii',
    'enterobacter-cloacae',
    'enterococcus-faecalis',
    'enterococcus-faecium',
    'escherichia-coli',
    'klebsiella-aerogenes',
    'klebsiella-oxytoca',
    'klebsiella-pneumoniae',
    'morganella-morganii',
    'proteus-spp',
    'providencia-stuartii',
    'pseudomonas-aeruginosa',
    'staphylococcus-aureus',
    'staphylococcus-epidermidis',
    'staphylococcus-saprophyticus',
    'streptococcus-agalactiae-gbs',
  ].map((k) => gap(k, '', 'A urinary organism reported as detected or not detected. A qualitative result has no band, and detection without symptoms is frequently not treated.')),
  ...['methicillin-resistance', 'trimethoprim-resistance', 'vancomycin-resistance'].map((k) =>
    gap(k, '', 'An antimicrobial resistance marker reported as detected or not detected. It describes an organism, not the person, and has no band.'),
  ),

  // --- Personal health measurements ----------------------------------------
  // Published targets exist for several of these and are deliberately not
  // recorded. See the note at the head of this section: an optimal band here
  // would be a judgement about someone's body rendered beside their blood
  // chemistry, with nobody present to have the conversation.
  gap('height', 'cm', 'A measurement, not a result. There is nothing to optimise.'),
  gap('weight', 'kg', 'Deliberately no band. Weight targets are set with a clinician against a person’s whole situation, never printed alongside a blood result.'),
  gap('waist-circumference', 'cm', 'Deliberately no band. Published thresholds exist and belong in a consultation, not beside a blood result on a portal.'),
  gap('hip-circumference', 'cm', 'Recorded to calculate the waist/hip ratio. It has no target of its own.'),
  gap('waist-hip-ratio', 'ratio', 'Deliberately no band, for the same reason as waist circumference.'),
  gap('systolic-blood-pressure', 'mmHg', 'NICE define hypertension thresholds, which are diagnostic thresholds acted on in a consultation with a repeat measurement — not an optimal band to print beside a single clinic reading.'),
  gap('diastolic-blood-pressure', 'mmHg', 'NICE define hypertension thresholds, which are diagnostic thresholds acted on in a consultation with a repeat measurement — not an optimal band to print beside a single clinic reading.'),
  gap('pulse', 'bpm', 'Resting pulse varies enormously with fitness, medication and how the last ten minutes went. No optimal band is defined.'),
  gap('oxygen-saturation', '%', 'A single clinic reading is read against a clinical threshold in context, not against an optimal.'),
  gap('body-composition-analyser', '', 'A composite of several measurements rather than one value. Nothing here to bound.'),
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
