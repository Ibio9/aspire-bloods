/**
 * The real Randox catalogue: what the clinic actually offers, at the three
 * levels it offers it, grouped by the health areas Randox themselves group it
 * by.
 *
 * ─── Why this file exists in `shared` rather than in the seed ──────────────
 *
 * The seed writes it to the database, but the web app needs the same category
 * names and the same result-type rules to render a report, and the two drifting
 * apart would mean a marker filed under "Thyroid Health" server-side and
 * "Thyroid" client-side. One list, two consumers.
 *
 * ─── Result types (§4A) ───────────────────────────────────────────────────
 *
 * Signature alone carries 207 food-sensitivity items and ~40 genetic
 * indicators. Dropped into the same grid as the ~120 real blood markers they
 * would swamp it, and — far worse — they would appear to carry the same
 * clinical weight as a potassium. So every marker declares what KIND of result
 * it is, and only MEASURED ones reach the main results grid, the counts strip,
 * the category bars and Trends. There are five: the fourth and fifth are the
 * gut microbiome and, since Aug 2026, QUALITATIVE — the entries that report a
 * finding rather than an amount. See RESULT_TYPE_RULES below.
 *
 * ─── Provenance ───────────────────────────────────────────────────────────
 *
 * Categories, category ids and marker lists for Insight 360 and Signature are
 * Randox's own, transcribed from their published service definitions. Randox's
 * spelling slips are corrected here and the correction is recorded on the
 * entry (`randoxSpelling`) so nobody "fixes" it back:
 *
 *   Pepsingogen → Pepsinogen          Cancer Atigen 125 → Cancer Antigen 125
 *   Glutamine Dehydrogenase → Glutamate Dehydrogenase (GLDH is the latter)
 *   Neutrophil Gelatinase Associatd → Associated      Archael → Archaeal
 *   Muscle Recover → Muscle Recovery  Melon (Galla) → Melon (Galia)
 *   Bayleaf → Bay Leaf                Patridge → Partridge
 *
 * Two further deviations, both deliberate and both reported:
 *
 *  1. The nine Urinalysis analytes are qualified "(urine)". Randox print them
 *     bare — "Glucose", "Protein", "Bilirubin" — and deduplicating by name
 *     across categories, which §4E requires, would merge a urine dipstick
 *     result into a fasting plasma glucose. Those are not the same test and a
 *     patient's glucose trend must never silently acquire a dipstick reading.
 *  2. Randox's own headline for the food sensitivity panel says 197 items, but
 *     the nine groups they enumerate contain 207. The enumerated lists are
 *     seeded, since a list is more specific than a count.
 */

import type { Sex } from './types.js';

export type ResultType = 'MEASURED' | 'GENETIC' | 'SENSITIVITY' | 'COMPOSITION' | 'QUALITATIVE';

/**
 * What each result type means for rendering. Kept beside the data because
 * every consumer needs the same answer and the rules are the whole point of
 * having the field.
 */
export const RESULT_TYPE_RULES: Record<
  ResultType,
  {
    label: string;
    /** Appears in the main results grid, the counts strip, category bars and Trends. */
    inMainGrid: boolean;
    /** Has units, a lab reference range and therefore a status that can be tinted. */
    hasReferenceRange: boolean;
    /** Meaningful to plot over time. */
    trendable: boolean;
    /** Eligible for an optimal band. */
    canHaveOptimalRange: boolean;
    /** The framing shown above its own section, so it is never mistaken for a blood measurement. */
    framing: string;
  }
> = {
  MEASURED: {
    label: 'Measured',
    inMainGrid: true,
    hasReferenceRange: true,
    trendable: true,
    canHaveOptimalRange: true,
    framing: '',
  },
  GENETIC: {
    label: 'Genetic indicator',
    inMainGrid: false,
    hasReferenceRange: false,
    trendable: false,
    canHaveOptimalRange: false,
    framing:
      'Genetic indicators, not blood measurements. They describe a tendency you were born with, not your health today. They have no reference range and will not change between tests.',
  },
  SENSITIVITY: {
    label: 'Food sensitivity',
    inMainGrid: false,
    hasReferenceRange: false,
    trendable: false,
    canHaveOptimalRange: false,
    framing:
      'These measure IgG reactivity to foods. They are not an allergy test, and there is no reference range or agreed way to interpret them. Please talk to a clinician before changing what you eat.',
  },
  COMPOSITION: {
    label: 'Microbiome composition',
    inMainGrid: false,
    hasReferenceRange: false,
    trendable: false,
    canHaveOptimalRange: false,
    framing:
      'These describe the make-up of your gut microbiome as proportions of the whole, not absolute amounts. They have no reference range and are not comparable with a blood measurement.',
  },
  /**
   * The fifth type, added Aug 2026, and the reason it had to exist.
   *
   * Twenty-two entries in the catalogue were MEASURED and carried no unit —
   * not because their unit was missing but because there is no quantity to put
   * a unit on. A resting ECG is a trace somebody reads. A body composition
   * analyser is a device you stand on. A prostate cancer risk score is a
   * calculation. The nineteen UTI panel entries answer "detected" or "not
   * detected". None of them is an analyte, none has a reference range, and all
   * of them were sitting in the main results grid next to a potassium looking
   * exactly as clinical as one.
   *
   * COMPOSITION was the obvious place to put the bacteria and it is the wrong
   * one: its framing says gut microbiome, as proportions of the whole, and a
   * urine PCR panel is neither. Reusing it would have meant either the wrong
   * words over the UTI results or weaker words over the microbiome ones.
   *
   * What all twenty-two share is exactly this: the result is a FINDING rather
   * than an amount. That is the type.
   *
   * NOT the urinalysis dipstick pads, which stay MEASURED — see the note on
   * UNITS below for why.
   */
  QUALITATIVE: {
    label: 'Qualitative result',
    inMainGrid: false,
    hasReferenceRange: false,
    trendable: false,
    canHaveOptimalRange: false,
    framing:
      'These are reported as a finding rather than as an amount: whether something was detected, or a reading taken and interpreted at your appointment. They have no reference range and no numeric scale, so there is nothing to compare them against and nothing to plot over time.',
  },
};

// ---------------------------------------------------------------------------
// Keys
//
// A marker's key is the slug of its name, EXCEPT where the analyte already
// exists in the catalogue under a different spelling. Those are listed
// explicitly rather than left to the fuzzy matcher: the matcher's job is to
// reconcile what a lab prints on a report against what we hold, which is a
// best-effort suggestion an admin can correct. Deciding the catalogue's own
// identity is not a best-effort problem, and a near-miss here would silently
// file a new analyte's results under an existing marker with nobody watching.
// ---------------------------------------------------------------------------

/** Canonical Randox name → the catalogue key it belongs to. */
const KEY_OVERRIDES: Record<string, string> = {
  // Already in the catalogue under a different printed name.
  'Alanine Aminotransferase (ALT)': 'alt',
  'Aspartate Aminotransferase (AST)': 'ast',
  'Gamma-Glutamyltransferase (GGT)': 'ggt',
  'Alkaline Phosphatase (ALP)': 'alp',
  'Total Bilirubin': 'bilirubin',
  'Total Protein': 'total-protein',
  'Calcium (adjusted)': 'calcium',
  'Vitamin D': 'vitamin-d',
  'Vitamin B12': 'vitamin-b12',
  'Folic Acid': 'folate',
  'Serum Iron': 'iron',
  Iron: 'iron',
  'Total Iron Binding Capacity (TIBC)': 'tibc',
  Ferritin: 'ferritin',
  Zinc: 'zinc',
  Albumin: 'albumin',
  Creatinine: 'creatinine',
  eGFR: 'egfr',
  Urea: 'urea',
  Sodium: 'sodium',
  Potassium: 'potassium',
  Chloride: 'chloride',
  Phosphate: 'phosphate',
  'Uric Acid': 'uric-acid',
  Glucose: 'glucose',
  HbA1c: 'hba1c',
  Insulin: 'fasting-insulin',
  'Total Cholesterol': 'total-cholesterol',
  'HDL Cholesterol': 'hdl',
  'LDL Cholesterol': 'ldl',
  Triglycerides: 'triglycerides',
  'Total Cholesterol/HDL Cholesterol Ratio': 'chol-hdl-ratio',
  'Apolipoprotein B': 'apob',
  Homocysteine: 'homocysteine',
  'High Sensitivity CRP (hsCRP)': 'hs-crp',
  'High Sensitivity C Reactive Protein (hsCRP)': 'hs-crp',
  'C-Reactive Protein (CRP)': 'crp',
  'Tumour Necrosis Factor Alpha (TNF-a)': 'tnf-alpha',
  Calprotectin: 'calprotectin',
  'Thyroid Stimulating Hormone (TSH)': 'tsh',
  TSH: 'tsh',
  'Free Thyroxine (FT4)': 'free-t4',
  'Free Tri-iodothyronine (FT3)': 'free-t3',
  'Follicle Stimulating Hormone (FSH)': 'fsh',
  FSH: 'fsh',
  'Luteinising Hormone': 'lh',
  Oestradiol: 'oestradiol',
  Progesterone: 'progesterone',
  Prolactin: 'prolactin',
  'Sex Hormone Binding Globulin (SHBG)': 'shbg',
  'Sex Hormone Binding Globulin': 'shbg',
  Testosterone: 'testosterone',
  'Free Testosterone': 'free-testosterone',
  Cortisol: 'cortisol',
  DHEAS: 'dhea-s',
  'Anti-Mullerian Hormone (AMH)': 'amh',
  'Omega-3 Index': 'omega-3-index',
  'Red Blood Cell Mean Volume (MCV)': 'mcv',
  'Mean Cell Haemoglobin (MCH)': 'mch',
  'Mean Cell Haemoglobin Concentration (MCHC)': 'mchc',
  'Red Blood Cell Count': 'rbc',
  'White Blood Cell Count': 'wbc',
  'Platelet Count': 'platelets',
  Haemoglobin: 'haemoglobin',
  Haematocrit: 'haematocrit',
  'Neutrophil Count': 'neutrophils',
  'Lymphocyte Count': 'lymphocytes',
  'Monocyte Count': 'monocytes',
  'Eosinophil Count': 'eosinophils',
  'Basophil Count': 'basophils',

  // New analytes named more than one way across Randox's own categories. One
  // record, several names — the alternate spellings become search aliases.
  'Rheumatoid Factor (RF)': 'rheumatoid-factor',
  'Rheumatoid Factor': 'rheumatoid-factor',
  'Anti-Thyroglobulin Antibody (Anti-Tg)': 'anti-tg',
  'Anti-Thyroid Peroxidase Antibody (Anti-TPO)': 'anti-tpo',
  'Parathyroid Hormone (PTH)': 'pth',
  'Interleukin 8 (IL-8)': 'il-8',
  'Interleukin-8 (IL-8)': 'il-8',
  'Interleukin-10 (IL-10)': 'il-10',
  'Monocyte Chemotactic Protein-1': 'mcp-1',
  'Monocyte Chemotactic Protein-1 (MCP-1)': 'mcp-1',
  'Epidermal Growth Factor': 'egf',
  'Epidermal Growth Factor (EGF)': 'egf',
  'Microalbumin/Creatinine Ratio': 'microalbumin-creatinine-ratio',
  'H. Pylori': 'h-pylori',
  'H. Pylori antibodies': 'h-pylori',
  'Creatine Kinase-MB (CK-MB)': 'ck-mb',
  'Neutrophil Gelatinase Associated Lipocalin (NGAL)': 'ngal',
  'Glutamate Dehydrogenase (GLDH)': 'gldh',
  'Lactate Dehydrogenase (LDH)': 'ldh',
  'Insulin Like Growth Factor 1 (IGF-1)': 'igf-1',
  'Cancer Antigen 15-3 (CA 15-3)': 'ca-15-3',
  'Cancer Antigen 19-9 (CA 19-9)': 'ca-19-9',
  'Cancer Antigen 125 (CA 125)': 'ca-125',
  'Intercellular Cell Adhesion Molecule 1': 'icam-1',
  'Vascular Cell Adhesion Molecule 1': 'vcam-1',
  'Macrophage Inflammatory Protein 1 alpha': 'mip-1-alpha',
  'Soluble Tumour Necrosis Factor I': 'stnf-r1',
  'Soluble Tumour Necrosis Factor II': 'stnf-r2',
  'Apolipoprotein B/A-I Ratio': 'apo-b-a1-ratio',
  'Apolipoprotein A-I': 'apo-a1',
  'Apolipoprotein CII': 'apo-cii',
  'Apolipoprotein E': 'apo-e',
  'Non-Esterified Fatty Acids': 'nefa',
  'Cardiovascular Risk Score': 'cv-risk-score',
  'Neuron Specific Enolase': 'nse',
  'Anti-Nuclear Antibodies (ANA)': 'ana',
  'Anti-Tissue Transglutaminase Antibodies': 'anti-ttg',
  'tTg-IgA': 'ttg-iga',

  // The three names Randox give one genetic lactose-intolerance indicator, and
  // the two they give one coeliac indicator. Genetic risk is reported once per
  // genome; listing it three times would suggest three findings.
  'Lactose Intolerance': 'genetic-lactose-intolerance',
  'Genetic Lactose Intolerance': 'genetic-lactose-intolerance',
  'Lactose Intolerance Risk': 'genetic-lactose-intolerance',
  'Genetic Coeliac Disease': 'genetic-coeliac-disease',
  'Coeliac Disease Risk': 'genetic-coeliac-disease',
};

/** Names one analyte is additionally known by, for search and for lab-name matching. */
const EXTRA_ALIASES: Record<string, string[]> = {
  alt: ['ALT', 'Alanine Aminotransferase', 'SGPT'],
  ast: ['AST', 'Aspartate Aminotransferase', 'SGOT'],
  ggt: ['GGT', 'Gamma GT', 'Gamma-Glutamyltransferase'],
  alp: ['ALP', 'Alk Phos', 'Alkaline Phosphatase'],
  bilirubin: ['Bilirubin', 'Total Bilirubin', 'TBIL'],
  albumin: ['ALB'],
  'total-protein': ['TP'],
  calcium: ['Calcium (adjusted)', 'Adjusted Calcium', 'Corrected Calcium', 'Ca'],
  creatinine: ['Creat', 'Cr'],
  egfr: ['eGFR', 'Estimated Glomerular Filtration Rate', 'GFR'],
  urea: ['BUN', 'Blood Urea Nitrogen'],
  hba1c: ['HbA1c', 'Glycated Haemoglobin', 'A1c'],
  glucose: ['Fasting Glucose', 'Blood Sugar', 'FPG'],
  'fasting-insulin': ['Insulin', 'Fasting Insulin'],
  'total-cholesterol': ['Cholesterol', 'TC'],
  hdl: ['HDL', 'HDL Cholesterol', 'Good Cholesterol'],
  ldl: ['LDL', 'LDL Cholesterol'],
  'chol-hdl-ratio': ['TC:HDL', 'Cholesterol HDL Ratio', 'Total Cholesterol/HDL Cholesterol Ratio'],
  apob: ['ApoB', 'Apolipoprotein B'],
  'hs-crp': ['hsCRP', 'High Sensitivity CRP', 'High Sensitivity C Reactive Protein'],
  crp: ['CRP', 'C-Reactive Protein'],
  tsh: ['TSH', 'Thyrotropin', 'Thyroid Stimulating Hormone'],
  'free-t4': ['FT4', 'Free Thyroxine', 'T4'],
  'free-t3': ['FT3', 'Free Tri-iodothyronine', 'T3'],
  ferritin: ['Fe stores'],
  iron: ['Serum Iron', 'Fe'],
  tibc: ['TIBC', 'Total Iron Binding Capacity'],
  'vitamin-d': ['25(OH)D', '25-Hydroxyvitamin D', 'Vit D'],
  'vitamin-b12': ['B12', 'Cobalamin', 'Vit B12'],
  folate: ['Folic Acid', 'Serum Folate'],
  fsh: ['FSH', 'Follicle Stimulating Hormone'],
  lh: ['LH', 'Luteinising Hormone', 'Luteinizing Hormone'],
  shbg: ['SHBG', 'Sex Hormone Binding Globulin'],
  'dhea-s': ['DHEAS', 'DHEA-S', 'DHEA Sulphate'],
  amh: ['AMH', 'Anti-Mullerian Hormone', 'Anti-Müllerian Hormone'],
  wbc: ['WBC', 'White Cell Count', 'Leucocytes'],
  rbc: ['RBC', 'Red Cell Count', 'Erythrocytes'],
  platelets: ['PLT', 'Platelets', 'Thrombocytes'],
  haemoglobin: ['Hb', 'Hgb', 'Hemoglobin'],
  haematocrit: ['HCT', 'PCV', 'Packed Cell Volume', 'Hematocrit'],
  mcv: ['MCV', 'Mean Cell Volume', 'Red Blood Cell Mean Volume'],
  mch: ['MCH'],
  mchc: ['MCHC'],
  neutrophils: ['Neutrophil Count', 'NEUT'],
  lymphocytes: ['Lymphocyte Count', 'LYMPH'],
  monocytes: ['MONO'],
  eosinophils: ['EOS'],
  basophils: ['BASO'],
  'rheumatoid-factor': ['RF', 'Rheumatoid Factor (RF)'],
  'anti-ccp': ['CCP', 'Anti-Cyclic Citrullinated Peptide'],
  'anti-tg': ['Anti-Tg', 'Thyroglobulin Antibody', 'TgAb'],
  'anti-tpo': ['Anti-TPO', 'Thyroid Peroxidase Antibody', 'TPOAb'],
  pth: ['PTH', 'Parathyroid Hormone'],
  'h-pylori': ['H. Pylori antibodies', 'Helicobacter pylori', 'HP'],
  'microalbumin-creatinine-ratio': ['ACR', 'Albumin Creatinine Ratio', 'uACR'],
  'creatine-kinase': ['CK', 'CPK'],
  'ck-mb': ['CK-MB'],
  'lipoprotein-a': ['Lp(a)', 'Lipoprotein a'],
  'apo-a1': ['ApoA1', 'Apolipoprotein A-I', 'Apolipoprotein A1'],
  'apo-cii': ['ApoCII'],
  'apo-e': ['ApoE'],
  'apo-b-a1-ratio': ['ApoB/ApoA1'],
  'total-psa': ['PSA', 'Prostate Specific Antigen'],
  afp: ['AFP', 'Alpha-Fetoprotein'],
  'beta-hcg': ['hCG', 'Beta hCG'],
  cea: ['CEA', 'Carcinoembryonic Antigen'],
  nse: ['NSE', 'Neuron Specific Enolase'],
  'ca-125': ['CA125', 'Cancer Antigen 125'],
  'ca-15-3': ['CA15-3'],
  'ca-19-9': ['CA19-9'],
  'igf-1': ['IGF-1', 'Somatomedin C'],
  'cystatin-c': ['Cystatin C'],
  'd-dimer': ['D dimer', 'D-Dimer'],
  'troponin-i': ['TnI', 'hs-Troponin I'],
  'troponin-t': ['TnT', 'hs-Troponin T'],
  ige: ['IgE', 'Total IgE'],
  ldh: ['LDH', 'Lactate Dehydrogenase'],
  gldh: ['GLDH', 'Glutamate Dehydrogenase'],
  'il-8': ['IL-8', 'Interleukin 8'],
  'il-10': ['IL-10', 'Interleukin 10'],
  'mcp-1': ['MCP-1', 'Monocyte Chemotactic Protein-1'],
  egf: ['EGF', 'Epidermal Growth Factor'],
  'icam-1': ['ICAM-1'],
  'vcam-1': ['VCAM-1'],
  'mip-1-alpha': ['MIP-1α', 'MIP-1 alpha'],
  ngal: ['NGAL', 'Lipocalin-2'],
  'stnf-r1': ['sTNF-RI'],
  'stnf-r2': ['sTNF-RII'],
  'b2-microglobulin': ['B2M', 'Beta-2 Microglobulin'],
  aso: ['ASO', 'Antistreptolysin O'],
  nefa: ['NEFA', 'Free Fatty Acids', 'Non-Esterified Fatty Acids'],
  'c-peptide': ['C Peptide'],
  qfit: ['qFIT', 'FIT', 'Faecal Immunochemical Test'],
  'genetic-lactose-intolerance': ['Lactose Intolerance', 'Lactose Intolerance Risk'],
  'genetic-coeliac-disease': ['Coeliac Disease Risk', 'Celiac Disease Risk'],
  'omega-3-index': ['Omega 3 Index', 'Omega-3 Index Complete'],
  'free-testosterone': ['Free T', 'Free Testosterone'],
  'free-androgen-index': ['FAI'],
  'cv-risk-score': ['Cardiovascular Risk Score', 'CV Risk'],
  ecg: ['ECG', 'Electrocardiogram', 'Resting ECG'],
  'ttg-iga': ['tTg-IgA', 'Tissue Transglutaminase IgA'],
  ana: ['ANA', 'Anti-Nuclear Antibodies'],
  'anti-ttg': ['Anti-tTG', 'Anti-Tissue Transglutaminase Antibodies'],
};

/**
 * Randox spellings corrected here, recorded so a future transcription can tell
 * a deliberate correction from a typo of our own.
 */
export const RANDOX_SPELLING_CORRECTIONS: { randox: string; corrected: string }[] = [
  { randox: 'Pepsingogen 1', corrected: 'Pepsinogen 1' },
  { randox: 'Pepsingogen 2', corrected: 'Pepsinogen 2' },
  { randox: 'Cancer Atigen 125', corrected: 'Cancer Antigen 125 (CA 125)' },
  { randox: 'Glutamine Dehydrogenase (GLDH)', corrected: 'Glutamate Dehydrogenase (GLDH)' },
  { randox: 'Neutrophil Gelatinase Associatd Lipocalin (NGAL)', corrected: 'Neutrophil Gelatinase Associated Lipocalin (NGAL)' },
  { randox: 'Archael Composition', corrected: 'Archaeal Composition' },
  { randox: 'Muscle Recover', corrected: 'Muscle Recovery' },
  { randox: 'Melon (Galla/Honeydew)', corrected: 'Melon (Galia/Honeydew)' },
  { randox: 'Bayleaf', corrected: 'Bay Leaf' },
  { randox: 'Patridge', corrected: 'Partridge' },
];

export function markerKeyForName(name: string): string {
  const override = KEY_OVERRIDES[name];
  if (override) return override;
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Units
//
// One entry per MEASURED analyte, in the units UK pathology reports it in.
// A marker missing from this map keeps an empty defaultUnit, which is the
// honest answer for a qualitative result (detected / not detected, a dipstick
// grade, an ECG interpretation) and is reported as a gap by the seed for
// anything else. An invented unit is worse than no unit: the optimal-range
// resolver refuses to show a band whose units disagree with the value beside
// it, and a wrong unit would defeat exactly that guard.
//
// ─── THE NINE MEASURED MARKERS THAT STILL HAVE NO UNIT (Aug 2026) ──────────
//
// Thirty-one had none. Twenty-two of those were not analytes at all and are
// now QUALITATIVE (see RESULT_TYPE_RULES.QUALITATIVE). Nine remain MEASURED
// with an empty unit ON PURPOSE, and it is worth writing down which and why,
// because "MEASURED with no unit" otherwise reads as an unfinished job:
//
//  · `h-pylori` — a serum antibody assay. It is a laboratory measurement of a
//    substance in blood, which is the definition of MEASURED; UK laboratories
//    report it positive / negative / equivocal rather than as a number, so
//    there is no unit to give it and none is invented.
//  · The EIGHT urinalysis dipstick pads — bilirubin, glucose, ketones,
//    protein, red blood cells, urobilinogen, white blood cells, nitrite. These
//    ARE measurements, read off a strip against a printed colour scale, with a
//    normal reading and abnormal ones. A patient expects them beside their
//    other results and they belong there. (`ph-urine` is the ninth pad and is
//    genuinely numeric, so it has a unit and is not in this list.)
//
// A pad renders correctly without a numeric range because the whole read path
// already handles a result that has a value and no comparison: it arrives as
// `valueText` with `status: null`, so it shows its reading, takes no tint, no
// chevron and no range bar, is labelled "Not compared to a range", and is
// excluded from every tally by `countable()` in resultPresence.ts. Nothing
// about the at-a-glance strip depends on the resultType alone.
// ---------------------------------------------------------------------------

const UNITS: Record<string, string> = {
  // Full blood count
  haemoglobin: 'g/L', 'haemoglobin-f': 'g/L', wbc: '10^9/L', rbc: '10^12/L', platelets: '10^9/L',
  haematocrit: '%', mcv: 'fL', mch: 'pg', mchc: 'g/L', rdw: '%',
  neutrophils: '10^9/L', lymphocytes: '10^9/L', monocytes: '10^9/L', eosinophils: '10^9/L', basophils: '10^9/L',
  // Liver
  alt: 'U/L', ast: 'U/L', ggt: 'U/L', alp: 'U/L', bilirubin: 'µmol/L', 'direct-bilirubin': 'µmol/L',
  albumin: 'g/L', globulin: 'g/L', 'total-protein': 'g/L', aldolase: 'U/L', 'bile-acids': 'µmol/L',
  copper: 'µmol/L', gldh: 'U/L', ldh: 'U/L',
  // Kidney
  creatinine: 'µmol/L', egfr: 'mL/min/1.73m²', urea: 'mmol/L', sodium: 'mmol/L', potassium: 'mmol/L',
  chloride: 'mmol/L', bicarbonate: 'mmol/L', phosphate: 'mmol/L', calcium: 'mmol/L', magnesium: 'mmol/L',
  'rbc-magnesium': 'mmol/L', 'uric-acid': 'µmol/L', 'cystatin-c': 'mg/L', 'b2-microglobulin': 'mg/L',
  'microalbumin-creatinine-ratio': 'mg/mmol', ngal: 'ng/mL', 'mip-1-alpha': 'pg/mL',
  'stnf-r1': 'ng/mL', 'stnf-r2': 'ng/mL', pth: 'pmol/L',
  // Lipids & heart
  'total-cholesterol': 'mmol/L', hdl: 'mmol/L', ldl: 'mmol/L', triglycerides: 'mmol/L',
  'chol-hdl-ratio': 'ratio', apob: 'g/L', 'apo-a1': 'g/L', 'apo-b-a1-ratio': 'ratio',
  'apo-cii': 'mg/dL', 'apo-e': 'mg/dL', 'lipoprotein-a': 'nmol/L', 'lp-pla2': 'ng/mL',
  'creatine-kinase': 'U/L', 'ck-mb': 'µg/L', myoglobin: 'µg/L', homocysteine: 'µmol/L',
  'troponin-i': 'ng/L', 'troponin-t': 'ng/L', 'cv-risk-score': '%', 'omega-3-index': '%',
  // Glycaemic
  glucose: 'mmol/L', hba1c: 'mmol/mol', 'fasting-insulin': 'mIU/L', 'c-peptide': 'nmol/L',
  fructosamine: 'µmol/L', nefa: 'mmol/L', adiponectin: 'µg/mL',
  // Inflammation & immune
  'hs-crp': 'mg/L', crp: 'mg/L', 'il-6': 'pg/mL', 'il-8': 'pg/mL', 'il-10': 'pg/mL',
  'tnf-alpha': 'pg/mL', esr: 'mm/hr', calprotectin: 'µg/g', 'complement-c3': 'g/L',
  aso: 'IU/mL', 'e-selectin': 'ng/mL', 'l-selectin': 'ng/mL', 'p-selectin': 'ng/mL',
  egf: 'pg/mL', 'icam-1': 'ng/mL', 'vcam-1': 'ng/mL', 'mcp-1': 'pg/mL', 'd-dimer': 'µg/L',
  ige: 'kU/L', 'rheumatoid-factor': 'IU/mL', 'anti-ccp': 'U/mL', 'anti-tg': 'IU/mL',
  'anti-tpo': 'IU/mL', ana: 'titre', 'anti-ttg': 'U/mL', 'ttg-iga': 'U/mL',
  't1d-autoantibodies': 'U/mL', 'gastric-parietal-cell-antibodies': 'U/mL',
  'intrinsic-factor-antibodies': 'U/mL',
  // Iron
  ferritin: 'µg/L', iron: 'µmol/L', tibc: 'µmol/L', transferrin: 'g/L', 'transferrin-saturation': '%',
  // Nutrition
  'vitamin-d': 'nmol/L', 'vitamin-b12': 'ng/L', folate: 'µg/L', zinc: 'µmol/L',
  'glutathione-reductase': 'U/g Hb',
  // Thyroid
  tsh: 'mIU/L', 'free-t4': 'pmol/L', 'free-t3': 'pmol/L', calcitonin: 'ng/L',
  'thyroid-binding-globulin-tbg': 'mg/L',
  // Hormones
  testosterone: 'nmol/L', 'testosterone-f': 'nmol/L', 'free-testosterone': 'pmol/L',
  'free-androgen-index': 'ratio', oestradiol: 'pmol/L', progesterone: 'nmol/L',
  prolactin: 'mIU/L', shbg: 'nmol/L', fsh: 'IU/L', lh: 'IU/L', amh: 'pmol/L',
  cortisol: 'nmol/L', 'dhea-s': 'µmol/L', 'igf-1': 'nmol/L',
  // Pancreas & gut
  lipase: 'U/L', 'pancreatic-amylase': 'U/L', gastrin: 'pmol/L',
  'pepsinogen-1': 'µg/L', 'pepsinogen-2': 'µg/L', qfit: 'µg Hb/g',
  // Tumour markers
  afp: 'kU/L', 'beta-hcg': 'IU/L', 'ca-15-3': 'kU/L', 'ca-19-9': 'kU/L', 'ca-125': 'kU/L',
  cea: 'µg/L', nse: 'µg/L', 'total-psa': 'µg/L',
  // Epstein-Barr — reported as an index against the assay's cut-off
  'epstein-barr-antibodies': 'index', 'epstein-barr-nuclear-antigen-igg': 'index',
  'epstein-barr-viral-capsid-antigen-igg': 'index', 'epstein-barr-viral-capsid-antigen-igm': 'index',
  // Personal health measurements
  height: 'cm', weight: 'kg', 'waist-circumference': 'cm', 'hip-circumference': 'cm',
  'waist-hip-ratio': 'ratio', 'systolic-blood-pressure': 'mmHg', 'diastolic-blood-pressure': 'mmHg',
  pulse: 'bpm', 'oxygen-saturation': '%',
  // Urine dipstick — pH is the one urinalysis analyte with a numeric scale.
  'ph-urine': 'pH',
};

/** Markers only offered to one sex, because Randox only run them for one sex. */
const SEX_RESTRICTED: Record<string, Sex> = {
  'prostate-cancer-risk-score': 'MALE',
  'total-psa': 'MALE',
};

// ---------------------------------------------------------------------------
// Categories — Randox's own health areas, with Randox's own numeric ids.
// ---------------------------------------------------------------------------

export interface CatalogueCategory {
  key: string;
  name: string;
  /** Randox's own category id, where they publish one. */
  randoxId: number | null;
  resultType: ResultType;
  /** Marker names exactly as Randox print them (after the corrections above). */
  markerNames: readonly string[];
  /** Set on the sections that are not blood measurements, so the UI can frame them. */
  note?: string;
}

const INSIGHT_CATEGORIES: CatalogueCategory[] = [
  { key: 'allergy-evaluation', name: 'Allergy Evaluation', randoxId: 1, resultType: 'MEASURED', markerNames: ['IgE'] },
  {
    key: 'autoimmune', name: 'Autoimmune', randoxId: 10, resultType: 'MEASURED',
    markerNames: ['Anti-CCP', 'Anti-Thyroglobulin Antibody (Anti-Tg)', 'Anti-Thyroid Peroxidase Antibody (Anti-TPO)', 'Rheumatoid Factor', 'T1D Autoantibodies'],
  },
  {
    key: 'bone-health', name: 'Bone Health', randoxId: 13, resultType: 'MEASURED',
    markerNames: ['Alkaline Phosphatase (ALP)', 'Calcium (adjusted)', 'Parathyroid Hormone (PTH)', 'Phosphate', 'Vitamin D'],
  },
  {
    key: 'diabetes-health', name: 'Diabetes Health', randoxId: 16, resultType: 'MEASURED',
    markerNames: ['C-Peptide', 'Fructosamine', 'Glucose', 'HbA1c', 'Insulin', 'Microalbumin/Creatinine Ratio', 'Non-Esterified Fatty Acids'],
  },
  { key: 'digestive-health', name: 'Digestive Health', randoxId: 17, resultType: 'MEASURED', markerNames: ['H. Pylori'] },
  {
    key: 'female-hormone', name: 'Female Hormone', randoxId: 20, resultType: 'MEASURED',
    markerNames: ['Follicle Stimulating Hormone (FSH)', 'Free Androgen Index', 'Luteinising Hormone', 'Oestradiol', 'Progesterone', 'Prolactin', 'Sex Hormone Binding Globulin (SHBG)', 'Testosterone'],
  },
  {
    key: 'full-blood-count', name: 'Full Blood Count', randoxId: 24, resultType: 'MEASURED',
    markerNames: ['Basophil Count', 'Eosinophil Count', 'Haematocrit', 'Haemoglobin', 'Lymphocyte Count', 'Mean Cell Haemoglobin (MCH)', 'Mean Cell Haemoglobin Concentration (MCHC)', 'Monocyte Count', 'Neutrophil Count', 'Platelet Count', 'Red Blood Cell Count', 'Red Blood Cell Mean Volume (MCV)', 'White Blood Cell Count'],
  },
  {
    key: 'heart-health', name: 'Heart Health', randoxId: 38, resultType: 'MEASURED',
    markerNames: ['Apolipoprotein A-I', 'Apolipoprotein B', 'Apolipoprotein B/A-I Ratio', 'Apolipoprotein CII', 'Apolipoprotein E', 'Cardiovascular Risk Score', 'Creatine Kinase', 'Creatine Kinase-MB (CK-MB)', 'HDL Cholesterol', 'High Sensitivity CRP (hsCRP)', 'Homocysteine', 'LDL Cholesterol', 'Lipoprotein (a)', 'Myoglobin', 'Total Cholesterol', 'Total Cholesterol/HDL Cholesterol Ratio', 'Triglycerides'],
  },
  {
    key: 'infection-inflammation', name: 'Infection & Inflammation', randoxId: 43, resultType: 'MEASURED',
    markerNames: ['Albumin', 'ASO', 'C-Reactive Protein (CRP)', 'Complement C3', 'E-Selectin', 'Epidermal Growth Factor', 'Ferritin', 'Intercellular Cell Adhesion Molecule 1', 'Interleukin 8 (IL-8)', 'Interleukin-10 (IL-10)', 'L-Selectin', 'Monocyte Chemotactic Protein-1', 'P-Selectin', 'Rheumatoid Factor (RF)', 'Vascular Cell Adhesion Molecule 1'],
  },
  {
    key: 'iron-status', name: 'Iron Status', randoxId: 44, resultType: 'MEASURED',
    markerNames: ['Ferritin', 'Iron', 'Total Iron Binding Capacity (TIBC)', 'Transferrin', 'Transferrin Saturation'],
  },
  {
    key: 'kidney-health', name: 'Kidney Health', randoxId: 45, resultType: 'MEASURED',
    markerNames: ['Albumin', 'B2 Microglobulin', 'Bicarbonate', 'Calcium (adjusted)', 'Chloride', 'Creatinine', 'Cystatin C', 'eGFR', 'Macrophage Inflammatory Protein 1 alpha', 'Magnesium', 'Microalbumin/Creatinine Ratio', 'Neutrophil Gelatinase Associated Lipocalin (NGAL)', 'Parathyroid Hormone (PTH)', 'Phosphate', 'Potassium', 'Sodium', 'Soluble Tumour Necrosis Factor I', 'Soluble Tumour Necrosis Factor II', 'Total Protein', 'Urea', 'Uric Acid'],
  },
  {
    key: 'liver-health', name: 'Liver Health', randoxId: 47, resultType: 'MEASURED',
    markerNames: ['Alanine Aminotransferase (ALT)', 'Albumin', 'Aldolase', 'Alkaline Phosphatase (ALP)', 'Aspartate Aminotransferase (AST)', 'Bile Acids', 'Copper', 'Direct Bilirubin', 'Ferritin', 'Gamma-Glutamyltransferase (GGT)', 'Globulin', 'Glutamate Dehydrogenase (GLDH)', 'Lactate Dehydrogenase (LDH)', 'Total Bilirubin'],
  },
  {
    key: 'male-hormone', name: 'Male Hormone', randoxId: 48, resultType: 'MEASURED',
    markerNames: ['Albumin', 'Follicle Stimulating Hormone (FSH)', 'Free Testosterone', 'Luteinising Hormone', 'Oestradiol', 'Prolactin', 'Sex Hormone Binding Globulin', 'Testosterone'],
  },
  {
    key: 'metabolic-syndrome', name: 'Metabolic Syndrome', randoxId: 50, resultType: 'MEASURED',
    markerNames: ['Adiponectin', 'C-Peptide', 'Diastolic Blood Pressure', 'Glucose', 'HbA1c', 'HDL Cholesterol', 'Height', 'High Sensitivity C Reactive Protein (hsCRP)', 'Insulin', 'Systolic Blood Pressure', 'Triglycerides', 'Tumour Necrosis Factor Alpha (TNF-a)', 'Waist Circumference', 'Weight'],
  },
  {
    key: 'muscle-joint-health', name: 'Muscle & Joint Health', randoxId: 51, resultType: 'MEASURED',
    markerNames: ['Aldolase', 'Anti-CCP', 'Creatine Kinase', 'Myoglobin', 'Rheumatoid Factor (RF)', 'Uric Acid'],
  },
  {
    key: 'nutritional-health', name: 'Nutritional Health', randoxId: 56, resultType: 'MEASURED',
    markerNames: ['Albumin', 'Calcium (adjusted)', 'Copper', 'Folic Acid', 'Glutathione Reductase', 'Iron', 'Magnesium', 'Vitamin B12', 'Vitamin D', 'Zinc'],
  },
  {
    key: 'pancreatic-health', name: 'Pancreatic Health', randoxId: 57, resultType: 'MEASURED',
    markerNames: ['Lipase', 'Pancreatic Amylase'],
  },
  {
    key: 'personal-health-measurements', name: 'Personal Health Measurements', randoxId: 58, resultType: 'MEASURED',
    markerNames: ['Body Composition Analyser', 'Diastolic Blood Pressure', 'Height', 'Hip Circumference', 'Oxygen Saturation', 'Pulse', 'Systolic Blood Pressure', 'Waist/Hip Ratio', 'Waist Circumference', 'Weight'],
    note: 'Recorded at your clinic visit, not measured from your blood sample.',
  },
  {
    key: 'pituitary-adrenal', name: 'Pituitary & Adrenal', randoxId: 59, resultType: 'MEASURED',
    markerNames: ['Cortisol', 'DHEAS', 'FSH', 'Insulin Like Growth Factor 1 (IGF-1)', 'Luteinising Hormone', 'Prolactin', 'TSH'],
  },
  {
    key: 'prostate-health', name: 'Prostate Health', randoxId: 61, resultType: 'MEASURED',
    markerNames: ['Prostate Cancer Risk Score', 'Total PSA'],
  },
  {
    key: 'digestive-bowel-health', name: 'Digestive & Bowel Health', randoxId: 63, resultType: 'MEASURED',
    markerNames: ['Calprotectin', 'Gastrin', 'H. Pylori antibodies', 'Pepsinogen 1', 'Pepsinogen 2', 'qFIT'],
    note: 'Collected with an at-home stool kit and returned separately.',
  },
  {
    key: 'stress', name: 'Stress', randoxId: 77, resultType: 'MEASURED',
    markerNames: ['Cortisol', 'Epidermal Growth Factor (EGF)', 'Interleukin-8 (IL-8)', 'Monocyte Chemotactic Protein-1 (MCP-1)', 'Testosterone'],
  },
  {
    key: 'thyroid-health', name: 'Thyroid Health', randoxId: 78, resultType: 'MEASURED',
    markerNames: ['Anti-Thyroglobulin Antibody (Anti-Tg)', 'Anti-Thyroid Peroxidase Antibody (Anti-TPO)', 'Calcitonin', 'Free Thyroxine (FT4)', 'Free Tri-iodothyronine (FT3)', 'Thyroid Binding Globulin (TBG)', 'Thyroid Stimulating Hormone (TSH)'],
  },
  {
    key: 'tumour-markers', name: 'Tumour Markers', randoxId: 79, resultType: 'MEASURED',
    markerNames: ['AFP', 'Beta hCG', 'Cancer Antigen 15-3 (CA 15-3)', 'Cancer Antigen 19-9 (CA 19-9)', 'Cancer Antigen 125 (CA 125)', 'CEA', 'Neuron Specific Enolase'],
  },
  {
    key: 'urinalysis', name: 'Urinalysis', randoxId: 80, resultType: 'MEASURED',
    // Qualified "(urine)" — see the provenance note at the head of this file.
    markerNames: ['Bilirubin (urine)', 'Glucose (urine)', 'Ketones (urine)', 'pH (urine)', 'Protein (urine)', 'Red Blood Cells (urine)', 'Urobilinogen (urine)', 'White Blood Cells (urine)', 'Nitrite (urine)'],
    note: 'Read from a urine sample rather than your blood.',
  },
];

/** The four Insight 360 categories Signature extends, and what it adds to each. */
const SIGNATURE_CATEGORY_ADDITIONS: Record<string, readonly string[]> = {
  autoimmune: ['Anti-Nuclear Antibodies (ANA)', 'Anti-Tissue Transglutaminase Antibodies', 'Gastric Parietal Cell Antibodies', 'Intrinsic Factor Antibodies'],
  'heart-health': ['ECG', 'Troponin I', 'Troponin T'],
  'infection-inflammation': ['D-dimer'],
  'digestive-bowel-health': ['Genetic Coeliac Disease', 'Genetic Lactose Intolerance', 'tTg-IgA'],
};

/**
 * Markers inside an otherwise-MEASURED category that are a different result
 * type.
 *
 * The two genetic ones are Signature filing genetic indicators inside the
 * bowel health area. The three QUALITATIVE ones sit inside health areas full
 * of real analytes and are not analytes themselves — see the note on
 * RESULT_TYPE_RULES.QUALITATIVE. Each carries its own one-line reason, because
 * "this is not a blood test" is a judgement and the next person should be able
 * to disagree with the specific claim rather than the whole list.
 */
const RESULT_TYPE_OVERRIDES: Record<string, ResultType> = {
  'genetic-coeliac-disease': 'GENETIC',
  'genetic-lactose-intolerance': 'GENETIC',
  // A trace read and written up, not a quantity. Its own explanation copy
  // already says so: "reported as a written interpretation rather than as a
  // number".
  ecg: 'QUALITATIVE',
  // A device you stand on at your appointment, reporting several estimates at
  // once. There is no single value and no reference range for the session.
  'body-composition-analyser': 'QUALITATIVE',
  // A calculation over other results. It expresses likelihood across groups of
  // people, which is not a quantity a laboratory range can be drawn around.
  'prostate-cancer-risk-score': 'QUALITATIVE',
};

const SIGNATURE_ONLY_CATEGORIES: CatalogueCategory[] = [
  {
    key: 'epstein-barr-virus', name: 'Epstein-Barr Virus', randoxId: null, resultType: 'MEASURED',
    markerNames: ['Epstein-Barr Antibodies', 'Epstein-Barr Nuclear Antigen IgG', 'Epstein-Barr Viral Capsid Antigen IgG', 'Epstein-Barr Viral Capsid Antigen IgM'],
  },
  {
    key: 'archaeal-composition', name: 'Archaeal Composition', randoxId: null, resultType: 'COMPOSITION',
    markerNames: ['Archaeal Composition'],
  },
  {
    key: 'bacterial-composition', name: 'Bacterial Composition', randoxId: null, resultType: 'COMPOSITION',
    markerNames: ['Bacteria that break down fibre', 'Bacteria with probiotic properties', 'Butyric acid producing bacteria', 'Hydrogen Sulphide producing Bacteria', 'Microbiome weight gain conditions', 'Pathogenic bacteria', 'Presence of Oxalate-degrading Bacteria', 'The Firmicutes/Bacteroidetes (F/B) ratio'],
  },
  {
    key: 'viral-composition', name: 'Viral Composition', randoxId: null, resultType: 'COMPOSITION',
    markerNames: ['Bacteriophages'],
  },
  {
    key: 'athletic-performance', name: 'Athletic Performance', randoxId: null, resultType: 'GENETIC',
    markerNames: ['Creatine Conversion', 'Injury Risk', 'Muscle Composition', 'Muscle Mass', 'Muscle Recovery'],
  },
  {
    key: 'diet-nutrition-dna', name: 'Diet & Nutrition', randoxId: null, resultType: 'GENETIC',
    markerNames: ['Bitter Taste Perception', 'Calcium Deficiency Risk', 'Fasting Response', 'Folate Deficiency Risk', 'Gluten Intolerance', 'Lactose Intolerance', 'Magnesium Deficiency Risk', 'Omega 3 and Omega 6 Benefit', 'Saturated Fats Response', 'Selenium Deficiency Risk', 'Sweet Taste Perception', 'Vitamin A Deficiency Risk', 'Vitamin B12 Deficiency Risk', 'Vitamin C Deficiency Risk', 'Vitamin D Deficiency Risk', 'Zinc Deficiency Risk'],
  },
  {
    key: 'health-wellbeing-dna', name: 'Health & Wellbeing', randoxId: null, resultType: 'GENETIC',
    markerNames: ['Caffeine Metabolism', 'Familial Hypercholesterolaemia Risk', 'Genetic Obesity Risk', 'Genetic Type II Diabetes Risk', 'High Cholesterol and Cardiovascular Disease Risk', 'Hypertension Risk', 'Mental Health', 'Sleep'],
  },
  {
    // QUALITATIVE, not MEASURED: sixteen organisms answered "detected" or "not
    // detected" and three antibiotic-resistance markers, which describe a
    // property of the bacteria in the sample rather than anything about the
    // person. Not COMPOSITION either — that framing says gut microbiome as a
    // proportion of the whole, and this is a urine PCR panel.
    key: 'uti', name: 'UTI', randoxId: null, resultType: 'QUALITATIVE',
    markerNames: ['Acinetobacter baumannii', 'Enterobacter cloacae', 'Enterococcus faecalis', 'Enterococcus faecium', 'Escherichia coli', 'Klebsiella aerogenes', 'Klebsiella oxytoca', 'Klebsiella pneumoniae', 'Methicillin Resistance', 'Morganella morganii', 'Proteus spp.', 'Providencia stuartii', 'Pseudomonas aeruginosa', 'Staphylococcus aureus', 'Staphylococcus epidermidis', 'Staphylococcus saprophyticus', 'Streptococcus agalactiae (GBS)', 'Trimethoprim Resistance', 'Vancomycin Resistance'],
    note: 'Reported as detected or not detected, from a urine sample.',
  },
  {
    key: 'genetic-risk-assessment', name: 'Genetic Risk Assessment', randoxId: null, resultType: 'GENETIC',
    markerNames: ['Coeliac Disease Risk', 'Haemochromatosis Risk', 'Lactose Intolerance Risk', 'Type 1 Diabetes Risk'],
  },
];

// ---------------------------------------------------------------------------
// Food sensitivity — 207 items across the nine groups Randox publish.
// All SENSITIVITY: no reference range, no status, no trend, its own section,
// collapsed by default because it is the single largest thing on the report
// and the least clinically actionable.
// ---------------------------------------------------------------------------

export const FOOD_SENSITIVITY_GROUPS: { key: string; name: string; items: readonly string[] }[] = [
  {
    key: 'dairy-eggs', name: 'Dairy & Eggs',
    items: ['Alpha-Lactalbumin', 'Beta-Lactoglobulin', 'Casein', 'Egg White', 'Egg Yolk', 'Milk (Buffalo)', 'Milk (Cow)', 'Milk (Goat)', 'Milk (Sheep)'],
  },
  {
    key: 'fish-seafood', name: 'Fish & Seafood',
    items: ['Anchovy', 'Bass', 'Carp', 'Caviar', 'Clam', 'Cockle', 'Cod', 'Crab', 'Cuttlefish', 'Eel', 'Haddock', 'Hake', 'Herring', 'Lobster', 'Mackerel', 'Monkfish', 'Mussel', 'Octopus', 'Oyster', 'Perch', 'Pike', 'Plaice', 'Salmon', 'Sardine', 'Scallop', 'Sea Bream (Gilthead)', 'Shrimp/Prawn', 'Sole', 'Squid', 'Swordfish', 'Trout', 'Tuna', 'Turbot'],
  },
  {
    key: 'fruit', name: 'Fruit',
    items: ['Apple', 'Apricot', 'Avocado', 'Banana', 'Blackberry', 'Blackcurrant', 'Blueberry', 'Cherry', 'Cranberry', 'Date', 'Fig', 'Grape (Black/Red/White)', 'Grapefruit', 'Guava', 'Kiwi', 'Lemon', 'Lime', 'Lychee', 'Mango', 'Melon (Galia/Honeydew)', 'Mulberry', 'Nectarine', 'Olive', 'Orange', 'Papaya', 'Peach', 'Pear', 'Pineapple', 'Plum', 'Pomegranate', 'Raisin', 'Raspberry', 'Redcurrant', 'Rhubarb', 'Strawberry', 'Tangerine', 'Watermelon'],
  },
  {
    key: 'grains', name: 'Grains',
    items: ['Amaranth', 'Barley', 'Buckwheat', 'Corn (Maize)', 'Couscous', 'Durum Wheat', 'Gliadin', 'Malt', 'Millet', 'Oat', 'Quinoa', 'Rice', 'Rye', 'Spelt', 'Tapioca', 'Wheat', 'Wheat Bran'],
  },
  {
    key: 'herbs-spices', name: 'Herbs & Spices',
    items: ['Aniseed', 'Basil', 'Bay Leaf', 'Camomile', 'Cayenne', 'Chilli (Red)', 'Cinnamon', 'Clove', 'Coriander (Leaf)', 'Cumin', 'Curry (Mixed Spices)', 'Dill', 'Garlic', 'Ginger', 'Ginseng', 'Hops', 'Liquorice', 'Marjoram', 'Mint', 'Mustard Seed', 'Nettle', 'Nutmeg', 'Parsley', 'Peppercorn (White/Black)', 'Peppermint', 'Rosemary', 'Saffron', 'Sage', 'Tarragon', 'Thyme', 'Vanilla'],
  },
  {
    key: 'meat', name: 'Meat',
    items: ['Beef', 'Chicken', 'Duck', 'Horse', 'Lamb', 'Ostrich', 'Partridge', 'Pork', 'Quail', 'Rabbit', 'Turkey', 'Veal', 'Venison', 'Wild Boar'],
  },
  {
    key: 'misc', name: 'Misc',
    items: ['Agar Agar', 'Aloe Vera', 'Carob', 'Chestnut', 'Cocoa Bean', 'Coffee', 'Mushroom', "Tea (Black)", 'Tea (Green)', "Yeast (Baker's)", "Yeast (Brewer's)"],
  },
  {
    key: 'nuts-seeds', name: 'Nuts & Seeds',
    items: ['Almond', 'Brazil Nut', 'Cashew Nut', 'Coconut', 'Flax Seed', 'Hazelnut', 'Macadamia Nut', 'Peanut', 'Pine Nut', 'Pistachio', 'Rapeseed', 'Sesame Seed', 'Sunflower Seed', 'Tiger Nut', 'Walnut'],
  },
  {
    key: 'vegetables', name: 'Vegetables',
    items: ['Artichoke', 'Asparagus', 'Aubergine', 'Bean (Broad)', 'Bean (Green)', 'Bean (Red Kidney)', 'Bean (White Haricot)', 'Beetroot', 'Broccoli', 'Brussels Sprouts', 'Cabbage (Red)', 'Cabbage (Savoy/White)', 'Capers', 'Carrot', 'Cauliflower', 'Celery', 'Chard', 'Chickpea', 'Chicory', 'Cucumber', 'Fennel (Leaf)', 'Leek', 'Lentil', 'Lettuce', 'Marrow', 'Onion', 'Peas', 'Pepper (Green/Red/Yellow)', 'Potato', 'Radish', 'Rocket', 'Shallot', 'Soya Bean', 'Spinach', 'Squash (Butternut/Carnival)', 'Sweet Potato', 'Tomato', 'Turnip', 'Watercress', 'Yuca (Cassava)'],
  },
];

const FOOD_SENSITIVITY_CATEGORIES: CatalogueCategory[] = FOOD_SENSITIVITY_GROUPS.map((g) => ({
  key: `food-sensitivity-${g.key}`,
  name: `Food Sensitivity: ${g.name}`,
  randoxId: null,
  resultType: 'SENSITIVITY' as const,
  // Prefixed so a food never collides with a blood analyte of the same name:
  // "Coriander (Leaf)" is fine, but "Egg White" and "Casein" would otherwise
  // sit one slug away from a protein assay, and Celery/Mustard Seed are exactly
  // the kind of name a future allergen panel would reuse.
  markerNames: g.items.map((i) => `${i} (IgG)`),
}));

// ---------------------------------------------------------------------------
// The three levels the clinic offers.
// ---------------------------------------------------------------------------

export interface CataloguePanel {
  key: string;
  name: string;
  description: string;
  /**
   * Panels this one contains in full. Recorded rather than flattened away —
   * GP3 including GP2 including Standard Screen Plus including Standard Screen
   * including Basic Screen is a fact about the product, and a flattened list
   * loses it the first time someone asks what the difference is.
   */
  includes: readonly string[];
  categoryKeys: readonly string[];
  /**
   * WHICH DEFINITION OF ITS CATEGORIES THIS PANEL GETS, and it is not
   * decoration — it was a real defect.
   *
   * A category is not one list. Signature's Heart Health is Insight's plus an
   * ECG and two troponins; its Autoimmune is Insight's plus four antibodies;
   * its Digestive & Bowel Health is Insight's plus two genetic indicators and
   * a tTg-IgA. `categoriesFor(level)` is what expresses that.
   *
   * `markerKeysForPanel` used to resolve every panel's category keys against
   * ALL_CATEGORIES, which IS `categoriesFor('signature')` — so Insight 360 was
   * seeded with ten markers it does not include, an ECG among them. A panel
   * that lists a test the patient did not buy is a panel that will eventually
   * have a result filed against it.
   *
   * Absent means the panel reaches no categories at all (Core, which is a
   * flattened GP3 marker list), so nothing to resolve.
   */
  categoryLevel?: 'insight-360' | 'signature';
  /** Extra markers not reached through a category (Core's named add-ons). */
  extraMarkerNames?: readonly string[];
  turnaroundWorkingDays: number;
  turnaroundNote?: string;
  repeatIntervalMonths?: number;
  /** True where the marker list came from a Randox document rather than being inferred. */
  compositionConfirmed: boolean;
}

/**
 * The Advanced GP3 nesting, recorded as its own structure so the containment
 * survives even though the panel itself holds the flattened list.
 *
 * PROVENANCE WARNING. Randox's Pathology Services Catalogue PDF is not present
 * in apps/server/src/modules/randox/specs/ and could not be retrieved, so only
 * the innermost tier is sourced: Basic Screen is transcribed from the real
 * HSC5 Basic Screen example report that IS in specs/ (33 analytes, pinned by
 * tests/sampleReportParse.test.ts). The three tiers above it are Randox's
 * published screen progression and are marked unconfirmed — `Panel
 * .compositionConfirmed` stays false for Core, and the admin panel editor
 * flips it once someone has checked it against the catalogue.
 */
export const GP3_NESTING: { key: string; name: string; code: string | null; sourced: boolean; addsMarkerNames: readonly string[] }[] = [
  {
    key: 'basic-screen', name: 'Basic Screen', code: 'HSC5', sourced: true,
    addsMarkerNames: [
      'Haemoglobin', 'Haematocrit', 'Mean Cell Haemoglobin (MCH)', 'Mean Cell Haemoglobin Concentration (MCHC)',
      'Red Blood Cell Mean Volume (MCV)', 'Red Blood Cell Count', 'Basophil Count', 'Eosinophil Count',
      'Lymphocyte Count', 'Monocyte Count', 'Neutrophil Count', 'White Blood Cell Count', 'Platelet Count',
      'Total Cholesterol', 'LDL Cholesterol', 'HDL Cholesterol', 'Triglycerides', 'Total Cholesterol/HDL Cholesterol Ratio',
      'High Sensitivity CRP (hsCRP)', 'C-Reactive Protein (CRP)', 'Glucose', 'Creatinine', 'eGFR',
      'Chloride', 'Phosphate', 'Potassium', 'Sodium', 'Urea',
      'Alanine Aminotransferase (ALT)', 'Alkaline Phosphatase (ALP)', 'Aspartate Aminotransferase (AST)',
      'Gamma-Glutamyltransferase (GGT)', 'Total Bilirubin', 'Albumin',
    ],
  },
  {
    key: 'standard-screen', name: 'Standard Screen', code: null, sourced: false,
    addsMarkerNames: ['Total Protein', 'Globulin', 'Calcium (adjusted)', 'Uric Acid', 'HbA1c', 'Ferritin', 'Iron', 'Total Iron Binding Capacity (TIBC)', 'Transferrin Saturation'],
  },
  {
    key: 'standard-screen-plus', name: 'Standard Screen Plus', code: null, sourced: false,
    addsMarkerNames: ['Thyroid Stimulating Hormone (TSH)', 'Free Thyroxine (FT4)', 'Vitamin D', 'Vitamin B12', 'Folic Acid', 'Magnesium'],
  },
  {
    key: 'advanced-gp2', name: 'Advanced GP2', code: null, sourced: false,
    addsMarkerNames: ['Free Tri-iodothyronine (FT3)', 'Insulin', 'Homocysteine', 'Apolipoprotein A-I', 'Apolipoprotein B', 'Lipoprotein (a)', 'Creatine Kinase', 'Lactate Dehydrogenase (LDH)', 'Zinc'],
  },
  {
    key: 'advanced-gp3', name: 'Advanced GP3', code: 'HSC9M/F', sourced: false,
    addsMarkerNames: ['Testosterone', 'Sex Hormone Binding Globulin (SHBG)', 'Free Androgen Index', 'Oestradiol', 'Follicle Stimulating Hormone (FSH)', 'Luteinising Hormone', 'Prolactin', 'DHEAS', 'Cortisol'],
  },
];

/** Advanced GP3's full flattened marker list, resolved down the nesting. */
export const GP3_FLATTENED_MARKER_NAMES: readonly string[] = GP3_NESTING.flatMap((t) => t.addsMarkerNames);

/**
 * THE TWO PANEL-SIZE DISCREPANCIES ARE TWO PROBLEMS, NOT ONE (Aug 2026), AND
 * NEITHER IS A MEMBERSHIP ERROR. Measured, so nobody re-derives it.
 *
 * Insight 360 enumerates 152 markers against a published "around 250 data
 * points" — 98 short. Signature enumerates 433 against a published "around
 * 350" — 83 over. Those nearly cancel, which is exactly why it looked like one
 * misfiling, and the `categoryLevel` defect above (every panel resolved
 * against Signature's fullest category definitions) looked like the cause.
 *
 * It is not, and the reason is structural rather than empirical: SIGNATURE
 * CONTAINS INSIGHT BY CONSTRUCTION. Its categoryKeys are Insight's plus its
 * own, so a marker moved out of "Signature only" and into Insight is a marker
 * Signature still has. Reassignment cannot subtract from Signature. Whatever
 * explains the 83 over, it is not where markers are filed.
 *
 * And it cannot explain the 98 short either. Of the 281 markers Signature
 * holds and Insight does not, only ELEVEN sit in a health area Insight itself
 * lists — SIGNATURE_CATEGORY_ADDITIONS, which is a resting ECG, two troponins,
 * D-dimer, four antibodies, two genetic indicators and a tTg-IgA. Every one of
 * them is named in Signature's own marketing as what Signature adds ("plus a
 * resting ECG…"), so moving them would be wrong on the product's own copy, and
 * it would close 11 of 98 even if it were right. The other 270 are in
 * categories Insight does not list at all: 207 food sensitivity items, 19 UTI
 * organisms, 33 genetic indicators, 10 microbiome proportions, 4 EBV
 * serologies.
 *
 * What is left is a COUNTING UNIT, and it is a question for Randox rather than
 * a defect here. "Data points" is their word, not ours, and 207 IgG foods
 * plainly are not 207 of the 350 — Signature without them is 226, which is
 * under the published figure rather than over it. The catalogue seeds the
 * ENUMERATION and never the headline, because a list is more specific than a
 * count. Nothing has been moved. See catalogueCoverage.test.ts, which pins the
 * arithmetic so a future edit cannot quietly make one of these numbers agree.
 */
export const CATALOGUE_PANELS: CataloguePanel[] = [
  {
    key: 'core',
    name: 'Core',
    description:
      'Randox Advanced GP3 in full, covering organ function, cardiovascular and metabolic health and sex hormones, plus Free Testosterone, the Omega-3 Index and AMH.',
    includes: ['advanced-gp3', 'advanced-gp2', 'standard-screen-plus', 'standard-screen', 'basic-screen'],
    categoryKeys: [],
    extraMarkerNames: [...GP3_FLATTENED_MARKER_NAMES, 'Free Testosterone', 'Omega-3 Index', 'Anti-Mullerian Hormone (AMH)'],
    turnaroundWorkingDays: 5,
    compositionConfirmed: false,
  },
  {
    key: 'insight-360',
    name: 'Insight 360',
    description:
      'RanChip Insight 360: around 250 data points across roughly 150 conditions, spanning blood, urine and measurements taken at the clinic, with an at-home bowel health kit returned separately.',
    includes: [],
    categoryKeys: INSIGHT_CATEGORIES.map((c) => c.key),
    categoryLevel: 'insight-360',
    turnaroundWorkingDays: 10,
    // §4E: Randox's own pages disagree with themselves about this. Their
    // structured service data says 10 working days from receipt at the lab;
    // their marketing copy says 2–3. The longer figure is stored, because
    // under-promising a turnaround costs a patient nothing and over-promising
    // one costs them a fortnight of wondering where their results are.
    turnaroundNote:
      'Randox publish two different turnarounds for this panel (10 working days in their service data, 2–3 in their marketing copy). The longer figure is the one used here.',
    repeatIntervalMonths: 6,
    compositionConfirmed: true,
  },
  {
    key: 'signature',
    name: 'Signature',
    description:
      'Around 350 data points: everything in Insight 360 plus a resting ECG, full body composition analysis, a remote GP consultation, gut microbiome, food sensitivity and nutritional & lifestyle DNA.',
    includes: ['insight-360'],
    categoryKeys: [
      ...INSIGHT_CATEGORIES.map((c) => c.key),
      ...SIGNATURE_ONLY_CATEGORIES.map((c) => c.key),
      ...FOOD_SENSITIVITY_CATEGORIES.map((c) => c.key),
    ],
    categoryLevel: 'signature',
    turnaroundWorkingDays: 4,
    repeatIntervalMonths: 6,
    compositionConfirmed: true,
  },
];

// ---------------------------------------------------------------------------
// Resolution — categories to markers, deduplicated.
// ---------------------------------------------------------------------------

export interface CatalogueMarker {
  key: string;
  /** The first name this analyte was seen under. */
  name: string;
  resultType: ResultType;
  /** Empty for a qualitative result. Never guessed. */
  unit: string;
  aliases: string[];
  /** Every category this one record belongs to. */
  categoryKeys: string[];
  /** Set only where Randox restrict the test to one sex. */
  sex?: Sex;
}

/**
 * Signature's version of a category is Insight's plus its additions, so the
 * category list is built per level rather than duplicated.
 */
export function categoriesFor(level: 'insight-360' | 'signature'): CatalogueCategory[] {
  const insight = INSIGHT_CATEGORIES.map((c) => {
    const additions = level === 'signature' ? SIGNATURE_CATEGORY_ADDITIONS[c.key] : undefined;
    return additions ? { ...c, markerNames: [...c.markerNames, ...additions].sort((a, b) => a.localeCompare(b)) } : c;
  });
  if (level === 'insight-360') return insight;
  return [...insight, ...SIGNATURE_ONLY_CATEGORIES, ...FOOD_SENSITIVITY_CATEGORIES];
}

/** Every category the catalogue knows about, at its fullest (Signature) definition. */
export const ALL_CATEGORIES: CatalogueCategory[] = categoriesFor('signature');

/**
 * Every distinct analyte, with the categories it belongs to.
 *
 * Deduplication happens here and only here. Albumin is listed by Randox in
 * four categories, Ferritin in three, Rheumatoid Factor in three, Calcium in
 * three, Testosterone in three, PTH and Cortisol in two — and each is one
 * record with several memberships, never several records. A patient with a
 * raised ferritin has one raised ferritin, not three.
 */
/**
 * A food-sensitivity name with our own "(IgG)" suffix taken off, or null where
 * there is nothing to take off.
 *
 * Exported because it is the definition of the alias, and the test that asserts
 * every sensitivity marker resolves from both spellings has to be able to
 * derive the bare form the same way rather than re-implementing the regex.
 */
export function bareSensitivityName(name: string): string | null {
  const bare = name.replace(/\s*\(IgG\)\s*$/i, '').trim();
  return bare && bare !== name.trim() ? bare : null;
}

export function resolveCatalogueMarkers(): CatalogueMarker[] {
  const byKey = new Map<string, CatalogueMarker>();

  const add = (name: string, categoryKey: string, resultType: ResultType) => {
    const key = markerKeyForName(name);
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.categoryKeys.includes(categoryKey)) existing.categoryKeys.push(categoryKey);
      // A second name for the same analyte becomes a search alias rather than
      // a second marker.
      if (name !== existing.name && !existing.aliases.includes(name)) existing.aliases.push(name);
      return;
    }
    // A marker's own type wins over the category's: Signature files two
    // genetic indicators inside the otherwise-measured bowel health area.
    const effectiveType = RESULT_TYPE_OVERRIDES[key] ?? resultType;
    byKey.set(key, {
      key,
      name,
      resultType: effectiveType,
      // Only a MEASURED marker has a unit. Anything else is a risk category, a
      // reactivity level or a relative abundance, and giving one a unit would
      // be the first step toward it acquiring a reference range.
      unit: effectiveType === 'MEASURED' ? UNITS[key] ?? '' : '',
      aliases: [...(EXTRA_ALIASES[key] ?? [])],
      categoryKeys: [categoryKey],
      ...(SEX_RESTRICTED[key] ? { sex: SEX_RESTRICTED[key] } : {}),
    });
  };

  for (const c of ALL_CATEGORIES) for (const n of c.markerNames) add(n, c.key, c.resultType);

  /**
   * THE "(IgG)" SUFFIX IS OURS, SO BOTH SPELLINGS RESOLVE (Aug 2026).
   *
   * All 207 food-sensitivity items are stored as `Cod (IgG)`, and the suffix is
   * a decision made HERE — it exists so a food can never collide with a blood
   * analyte of the same name (see FOOD_SENSITIVITY_CATEGORIES: "Egg White" and
   * "Casein" are one slug away from a protein assay). It is not something
   * Randox print, and nobody has seen what they do print.
   *
   * That made 207 markers depend on a guess about a laboratory's formatting. If
   * Randox send the food name bare, every single one misses, and an admin opens
   * the exception queue on the first Signature delivery to find 207 unmapped
   * analytes at once — which is not a queue, it is an outage with a list.
   *
   * So the bare form goes on as an alias. This is NOT guessing at a Randox
   * spelling, which the analyte map refuses to do and should go on refusing:
   * it is accepting our own name with and without a suffix we added ourselves.
   * Exact and normalised matching are untouched. Where a bare name collides
   * with a real analyte the index records BOTH claims and refuses the row as
   * ambiguous rather than picking — that is analyteMap.ts's existing behaviour
   * and it is the right one, because a food filed as a protein assay is exactly
   * the failure the suffix was invented to prevent.
   */
  for (const marker of byKey.values()) {
    if (marker.resultType !== 'SENSITIVITY') continue;
    for (const term of [marker.name, ...marker.aliases]) {
      const bare = bareSensitivityName(term);
      if (bare && bare !== marker.name && !marker.aliases.includes(bare)) marker.aliases.push(bare);
    }
  }

  // Core's markers reach the catalogue through the panel rather than a
  // category — the GP3 nesting is a product structure, not a health area.
  for (const panel of CATALOGUE_PANELS) {
    for (const n of panel.extraMarkerNames ?? []) {
      const key = markerKeyForName(n);
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          name: n,
          resultType: 'MEASURED',
          unit: UNITS[key] ?? '',
          aliases: [...(EXTRA_ALIASES[key] ?? [])],
          categoryKeys: [],
          ...(SEX_RESTRICTED[key] ? { sex: SEX_RESTRICTED[key] } : {}),
        });
      }
    }
  }

  return [...byKey.values()];
}

/**
 * Marker keys on a given panel, flattened through categories and extras alike.
 *
 * Resolved at THIS PANEL'S OWN LEVEL — see `CataloguePanel.categoryLevel`. A
 * category resolved at the wrong level puts markers on a panel that does not
 * sell them.
 */
export function markerKeysForPanel(panel: CataloguePanel): string[] {
  const keys = new Set<string>();
  const categoryByKey = new Map(
    (panel.categoryLevel ? categoriesFor(panel.categoryLevel) : ALL_CATEGORIES).map((c) => [c.key, c]),
  );
  for (const ck of panel.categoryKeys) {
    for (const n of categoryByKey.get(ck)?.markerNames ?? []) keys.add(markerKeyForName(n));
  }
  for (const n of panel.extraMarkerNames ?? []) keys.add(markerKeyForName(n));
  return [...keys];
}

/** Counts for the seed's report and for the catalogue admin screen. */
export function catalogueSummary() {
  const markers = resolveCatalogueMarkers();
  const byType = markers.reduce<Record<ResultType, number>>(
    (acc, m) => ({ ...acc, [m.resultType]: acc[m.resultType] + 1 }),
    { MEASURED: 0, GENETIC: 0, SENSITIVITY: 0, COMPOSITION: 0, QUALITATIVE: 0 },
  );
  return {
    markerCount: markers.length,
    byResultType: byType,
    categoryCount: ALL_CATEGORIES.length,
    foodSensitivityItemCount: FOOD_SENSITIVITY_GROUPS.reduce((n, g) => n + g.items.length, 0),
    /** Analytes listed by Randox in more than one category and merged into one record. */
    deduplicated: markers
      .filter((m) => m.categoryKeys.length > 1)
      .map((m) => ({ key: m.key, name: m.name, categories: m.categoryKeys })),
    /** MEASURED analytes with no unit — qualitative, or a genuine gap. */
    measuredWithoutUnit: markers.filter((m) => m.resultType === 'MEASURED' && !m.unit).map((m) => m.key),
  };
}
