/**
 * Seed data for panels, markers, reference ranges, and draft explanation
 * copy. Reference ranges are standard adult general-population ranges used
 * as a seed starting point — the brief requires ranges to be sourced from
 * the actual Randox report per patient, so these seed rows exist only so
 * the app has something to render before the first real report is
 * uploaded; ReportResult always stores the range from the report it came
 * from via ReferenceRange rows created (or matched) at verify time.
 *
 * Panel -> marker composition is a best-effort mapping built from the
 * brief's panel names and public Randox panel positioning (comprehensive
 * vs. targeted panels), NOT copied from an internal Randox spec sheet —
 * none was provided. Flagged here so whoever administers this reviews it:
 * ADMIN SHOULD VERIFY PANEL -> MARKER COMPOSITION AGAINST THE REAL RANDOX
 * PANEL SPEC BEFORE GO-LIVE. Panels/markers are fully data-driven so this
 * is a config correction, not a code change.
 */
import 'dotenv/config';
import { prisma } from '../src/db/client.js';
import { encryptField } from '../src/lib/crypto.js';
import { hashPassword } from '../src/lib/password.js';
import { hashToken, generateToken } from '../src/lib/crypto.js';
import { seedRandoxCatalogue, formatCatalogueReport } from './seedCatalogue.js';
import { applyHouseStyle, applyVocabularyRule, sameWords } from '../src/lib/houseStyle.js';
import { isRetractableApproval, retractionReason } from '../src/lib/explanationReview.js';
import { explanationFor } from './markerExplanations.js';
import { LOTHIAN, PUBLISHED_RANGES, WITHHELD, publishedRangeSource } from './publishedReferenceRanges.js';

interface MarkerSeed {
  key: string;
  name: string;
  unit: string;
  low: number;
  high: number;
  sex?: 'MALE' | 'FEMALE' | 'ANY';
  whatItIs: string;
  highMeans?: string;
  lowMeans?: string;
  lifestyleContext?: string;
  severityMultiplier?: number;
}

const markers: MarkerSeed[] = [
  // --- Full blood count ---
  { key: 'haemoglobin', name: 'Haemoglobin', unit: 'g/L', low: 130, high: 170, sex: 'MALE', whatItIs: 'The protein in red blood cells that carries oxygen around your body.', highMeans: 'Can reflect dehydration, smoking, or conditions that increase red cell production.', lowMeans: 'Often reflects anaemia: reduced capacity to carry oxygen, which can cause fatigue and breathlessness.', lifestyleContext: 'Iron-rich food, staying hydrated, and treating any underlying cause support levels in the usual range.' },
  { key: 'haemoglobin-f', name: 'Haemoglobin', unit: 'g/L', low: 120, high: 150, sex: 'FEMALE', whatItIs: 'The protein in red blood cells that carries oxygen around your body.', highMeans: 'Can reflect dehydration, smoking, or conditions that increase red cell production.', lowMeans: 'Often reflects anaemia: reduced capacity to carry oxygen, which can cause fatigue and breathlessness.', lifestyleContext: 'Iron-rich food, staying hydrated, and treating any underlying cause support levels in the usual range.' },
  { key: 'wbc', name: 'White Blood Cell Count', unit: '10^9/L', low: 4.0, high: 10.0, whatItIs: 'Cells that make up your immune system and fight infection.', highMeans: 'Can indicate infection, inflammation, or stress on the body.', lowMeans: 'Can indicate a weakened immune response or certain viral infections.', lifestyleContext: 'Levels vary with recent illness, so a repeat test when well is often more informative.' },
  { key: 'platelets', name: 'Platelet Count', unit: '10^9/L', low: 150, high: 450, whatItIs: 'Cell fragments that help your blood clot.', highMeans: 'Can occur after inflammation, infection, or iron deficiency.', lowMeans: 'Can increase bruising or bleeding risk.', lifestyleContext: 'Usually monitored alongside other blood count markers rather than in isolation.' },
  { key: 'rbc', name: 'Red Blood Cell Count', unit: '10^12/L', low: 4.2, high: 5.9, whatItIs: 'The number of oxygen-carrying cells circulating in your blood.', highMeans: 'Can reflect dehydration or conditions that overproduce red cells.', lowMeans: 'Often reflects anaemia.', lifestyleContext: 'Interpreted alongside haemoglobin and haematocrit.' },
  { key: 'haematocrit', name: 'Haematocrit', unit: '%', low: 36, high: 50, whatItIs: 'The proportion of your blood made up of red blood cells.', highMeans: 'Can reflect dehydration or overproduction of red cells.', lowMeans: 'Often reflects anaemia or overhydration.', lifestyleContext: 'Interpreted alongside haemoglobin and red cell count.' },
  { key: 'mcv', name: 'Mean Cell Volume (MCV)', unit: 'fL', low: 76, high: 100, whatItIs: 'The average size of your red blood cells.', highMeans: 'Can relate to vitamin B12 or folate deficiency, or alcohol intake.', lowMeans: 'Can relate to iron deficiency.', lifestyleContext: 'A useful clue to the underlying cause when haemoglobin is also low.' },
  { key: 'rdw', name: 'Red Cell Distribution Width (RDW)', unit: '%', low: 11.5, high: 14.5, whatItIs: 'How much variation there is in the size of your red blood cells.', highMeans: 'Can indicate an early nutrient deficiency or mixed causes of anaemia.', lifestyleContext: 'Most useful alongside other full blood count markers.' },
  { key: 'neutrophils', name: 'Neutrophils', unit: '10^9/L', low: 2.0, high: 7.5, whatItIs: 'The most common type of white blood cell, first responders to infection.', highMeans: 'Can indicate bacterial infection, inflammation, or stress.', lowMeans: 'Can increase susceptibility to infection.', lifestyleContext: 'Levels shift quickly with acute illness.' },
  { key: 'lymphocytes', name: 'Lymphocytes', unit: '10^9/L', low: 1.0, high: 3.5, whatItIs: 'White blood cells central to your immune system’s response to viruses.', highMeans: 'Can reflect a recent or ongoing viral infection.', lowMeans: 'Can reflect immune suppression or recent illness.', lifestyleContext: 'Often interpreted alongside white cell count and recent health history.' },
  { key: 'monocytes', name: 'Monocyte Count', unit: '10^9/L', low: 0.2, high: 0.8, whatItIs: 'A type of white blood cell that clears damaged cells and helps coordinate the immune response.', highMeans: 'Can reflect a chronic infection or an inflammatory process.', lowMeans: 'Uncommon in isolation and usually interpreted alongside the rest of the blood count.', lifestyleContext: 'Read alongside the other white cell types rather than on its own.' },
  { key: 'eosinophils', name: 'Eosinophil Count', unit: '10^9/L', low: 0.04, high: 0.4, whatItIs: 'A white blood cell involved in allergic responses and in resisting parasitic infection.', highMeans: 'Can reflect allergy, asthma, eczema or hay fever, and less commonly a parasitic infection.', lowMeans: 'Rarely significant on its own.', lifestyleContext: 'Often higher during hay fever season or an allergic flare.' },
  { key: 'basophils', name: 'Basophil Count', unit: '10^9/L', low: 0.01, high: 0.1, whatItIs: 'The least common white blood cell, involved in allergic and inflammatory responses.', highMeans: 'Uncommon; usually interpreted alongside the rest of the blood count.', lifestyleContext: 'Read alongside the other white cell types rather than on its own.' },
  { key: 'mch', name: 'Mean Cell Haemoglobin (MCH)', unit: 'pg', low: 27.0, high: 32.0, whatItIs: 'The average amount of haemoglobin carried inside each red blood cell.', highMeans: 'Can accompany anaemia related to vitamin B12 or folate.', lowMeans: 'Can accompany iron-deficiency anaemia, where red cells are smaller and carry less haemoglobin.', lifestyleContext: 'Most useful alongside MCV and haemoglobin when working out the cause of an anaemia.' },
  { key: 'mchc', name: 'Mean Cell Haemoglobin Concentration (MCHC)', unit: 'g/L', low: 320, high: 360, whatItIs: 'How concentrated the haemoglobin is within your red blood cells.', highMeans: 'Uncommon; can occur in certain inherited red cell conditions.', lowMeans: 'Can accompany iron deficiency.', lifestyleContext: 'Interpreted alongside MCV and MCH rather than on its own.' },

  // --- Liver function ---
  { key: 'alt', name: 'ALT (Alanine Aminotransferase)', unit: 'U/L', low: 0, high: 40, whatItIs: 'An enzyme found mainly in the liver; raised levels can signal liver cell stress.', highMeans: 'Can reflect fatty liver, alcohol intake, medication effects, or viral hepatitis.', lifestyleContext: 'Alcohol reduction, weight management, and reviewing medications can help.' },
  { key: 'ast', name: 'AST (Aspartate Aminotransferase)', unit: 'U/L', low: 0, high: 40, whatItIs: 'An enzyme found in the liver and muscles; raised levels can signal cell stress.', highMeans: 'Can reflect liver strain, muscle damage, or heavy alcohol intake.', lifestyleContext: 'Interpreted alongside ALT and the AST:ALT ratio.' },
  { key: 'ggt', name: 'GGT (Gamma-Glutamyl Transferase)', unit: 'U/L', low: 10, high: 71, whatItIs: 'A liver enzyme sensitive to alcohol intake and bile flow.', highMeans: 'Can reflect alcohol intake, fatty liver, or bile duct issues.', lifestyleContext: 'Often the first liver marker to rise with alcohol intake and the first to fall on reduction.' },
  { key: 'bilirubin', name: 'Total Bilirubin', unit: 'µmol/L', low: 0, high: 21, whatItIs: 'A breakdown product of red blood cells, processed by the liver.', highMeans: 'Can reflect liver dysfunction, bile duct blockage, or increased red cell breakdown.', lifestyleContext: 'Mildly raised levels in isolation are often a benign, harmless variant (Gilbert’s syndrome).' },
  { key: 'albumin', name: 'Albumin', unit: 'g/L', low: 35, high: 50, whatItIs: 'The main protein made by your liver, important for fluid balance and transport.', lowMeans: 'Can reflect liver disease, inflammation, or poor nutrition.', lifestyleContext: 'Adequate protein intake supports levels in the usual range.' },
  { key: 'alp', name: 'Alkaline Phosphatase (ALP)', unit: 'U/L', low: 30, high: 120, whatItIs: 'An enzyme found in the liver and bone.', highMeans: 'Can reflect bile duct issues, liver conditions, or bone turnover.', lifestyleContext: 'Naturally higher during bone growth or healing.' },
  { key: 'total-protein', name: 'Total Protein', unit: 'g/L', low: 60, high: 80, whatItIs: 'The combined level of all proteins in your blood, including albumin.', lifestyleContext: 'Interpreted alongside albumin and overall nutritional status.' },

  // --- Kidney function ---
  { key: 'creatinine', name: 'Creatinine', unit: 'µmol/L', low: 60, high: 110, whatItIs: 'A waste product filtered out by your kidneys, used to estimate kidney function.', highMeans: 'Can reflect reduced kidney function or high muscle mass.', lifestyleContext: 'Staying well hydrated supports accurate results.' },
  { key: 'egfr', name: 'eGFR (Estimated Glomerular Filtration Rate)', unit: 'mL/min/1.73m²', low: 60, high: 999, whatItIs: 'An estimate of how well your kidneys are filtering waste from your blood.', lowMeans: 'Lower values can indicate reduced kidney function.', lifestyleContext: 'Blood pressure control and hydration support kidney health.' },
  { key: 'urea', name: 'Urea', unit: 'mmol/L', low: 2.5, high: 7.8, whatItIs: 'A waste product from protein breakdown, cleared by the kidneys.', highMeans: 'Can reflect reduced kidney function or dehydration.', lifestyleContext: 'Interpreted alongside creatinine and eGFR.' },
  { key: 'sodium', name: 'Sodium', unit: 'mmol/L', low: 133, high: 146, whatItIs: 'An electrolyte that helps regulate fluid balance and nerve function.', highMeans: 'Can reflect dehydration.', lowMeans: 'Can reflect fluid overload or certain medications.', lifestyleContext: 'Usually reflects hydration status at the time of testing.' },
  { key: 'potassium', name: 'Potassium', unit: 'mmol/L', low: 3.5, high: 5.3, whatItIs: 'An electrolyte essential for nerve and muscle function, including the heart.', highMeans: 'Can reflect kidney function or certain medications.', lowMeans: 'Can occur with certain medications or gastrointestinal losses.', lifestyleContext: 'Significant abnormalities here warrant prompt clinical attention.' },
  { key: 'chloride', name: 'Chloride', unit: 'mmol/L', low: 95, high: 108, whatItIs: 'An electrolyte that works with sodium to maintain fluid balance and the blood’s acid-base balance.', highMeans: 'Can reflect dehydration or an acid-base disturbance.', lowMeans: 'Can reflect fluid overload or losses through vomiting.', lifestyleContext: 'Largely reflects hydration status at the time of testing.' },
  { key: 'phosphate', name: 'Phosphate', unit: 'mmol/L', low: 0.8, high: 1.5, whatItIs: 'A mineral that works with calcium to build bone and is central to how cells store energy.', highMeans: 'Can reflect reduced kidney function.', lowMeans: 'Can reflect poor absorption, vitamin D deficiency or certain medications.', lifestyleContext: 'Interpreted alongside calcium and vitamin D.' },

  // --- Lipids ---
  { key: 'total-cholesterol', name: 'Total Cholesterol', unit: 'mmol/L', low: 0, high: 5.0, whatItIs: 'The combined measure of all cholesterol carried in your blood.', highMeans: 'Higher levels are linked to increased cardiovascular risk over time.', lifestyleContext: 'Diet, exercise, and not smoking all support cholesterol levels in the usual range.' },
  { key: 'hdl', name: 'HDL Cholesterol', unit: 'mmol/L', low: 1.55, high: 999, whatItIs: 'Often called “good” cholesterol. It helps remove excess cholesterol from your bloodstream.', lowMeans: 'Lower levels are linked to increased cardiovascular risk.', lifestyleContext: 'Regular exercise is one of the most effective ways to raise HDL.' },
  { key: 'ldl', name: 'LDL Cholesterol', unit: 'mmol/L', low: 0, high: 3.0, whatItIs: 'Often called “bad” cholesterol. It can build up in artery walls over time.', highMeans: 'Higher levels are linked to increased cardiovascular risk.', lifestyleContext: 'Diet lower in saturated fat and regular activity both help.' },
  { key: 'triglycerides', name: 'Triglycerides', unit: 'mmol/L', low: 0, high: 2.3, whatItIs: 'A type of fat in your blood, largely influenced by diet.', highMeans: 'Can reflect diet, alcohol intake, or metabolic factors.', lifestyleContext: 'Reducing refined sugar and alcohol intake often has a quick effect.' },
  { key: 'chol-hdl-ratio', name: 'Total Cholesterol / HDL Ratio', unit: 'ratio', low: 0, high: 5.0, whatItIs: 'A calculated ratio that helps put your total cholesterol into context.', highMeans: 'A higher ratio is linked to increased cardiovascular risk.', lifestyleContext: 'Improves with the same lifestyle changes that improve cholesterol overall.' },
  { key: 'apob', name: 'ApoB (Apolipoprotein B)', unit: 'g/L', low: 0, high: 1.0, whatItIs: 'A protein found on the particles that carry “bad” cholesterol. It reflects how many of those particles you have.', highMeans: 'Considered a strong marker of cardiovascular risk, sometimes more precise than LDL alone.', lifestyleContext: 'Responds to the same diet and lifestyle changes as LDL cholesterol.' },
  // Oxidised LDL and MPO are deliberately NOT seeded — Randox cannot supply
  // either under Aspire's current agreement. See EXCLUDED_MARKER_KEYS below,
  // which also detaches/deactivates them if they exist from an older seed.
  { key: 'lp-pla2', name: 'Lp-PLA2', unit: 'ng/mL', low: 0, high: 200, whatItIs: 'An enzyme linked to inflammation within blood vessel walls.', highMeans: 'Associated with increased cardiovascular risk, independent of cholesterol levels.', lifestyleContext: 'Diet, exercise and not smoking all support lower levels.' },
  { key: 'omega-3-index', name: 'Omega-3 Index', unit: '%', low: 8, high: 999, whatItIs: 'The proportion of omega-3 fatty acids in your red blood cell membranes.', lowMeans: 'Lower levels are linked to increased cardiovascular risk.', lifestyleContext: 'Oily fish, or omega-3 supplementation, raises this over 2–3 months.' },

  // --- Glycaemic ---
  { key: 'glucose', name: 'Fasting Glucose', unit: 'mmol/L', low: 3.9, high: 5.5, whatItIs: 'The amount of sugar circulating in your blood after fasting.', highMeans: 'Can indicate insulin resistance or a risk of developing diabetes.', lifestyleContext: 'Reducing refined carbohydrates and regular activity both help regulate blood sugar.' },
  { key: 'hba1c', name: 'HbA1c', unit: 'mmol/mol', low: 20, high: 42, whatItIs: 'A measure of your average blood sugar over the past 2–3 months.', highMeans: 'Higher levels indicate a risk of, or existing, diabetes.', lifestyleContext: 'Diet, weight management, and activity all meaningfully influence this over months.' },
  { key: 'fasting-insulin', name: 'Fasting Insulin', unit: 'mIU/L', low: 2, high: 25, whatItIs: 'The hormone that regulates blood sugar, measured after fasting.', highMeans: 'Elevated levels can be an early sign of insulin resistance, often before blood sugar itself rises.', lifestyleContext: 'Reducing refined carbohydrate intake and regular exercise both improve insulin sensitivity.' },

  // --- Inflammation ---
  { key: 'hs-crp', name: 'hs-CRP (High-Sensitivity C-Reactive Protein)', unit: 'mg/L', low: 0, high: 3.0, whatItIs: 'A sensitive marker of low-grade inflammation in the body.', highMeans: 'Can reflect general inflammation and is linked to cardiovascular risk when persistently raised.', lifestyleContext: 'Can be raised temporarily by illness or injury, so an isolated raised result is often best repeated.' },
  { key: 'crp', name: 'CRP (C-Reactive Protein)', unit: 'mg/L', low: 0, high: 5.0, whatItIs: 'A protein made by the liver that rises quickly when there is inflammation or infection in the body.', highMeans: 'Can reflect an infection, an injury or an inflammatory condition. It rises and falls quickly.', lifestyleContext: 'A recent cold or injury can raise this temporarily, so an isolated raised result is often best repeated once you are well.' },
  { key: 'il-6', name: 'IL-6 (Interleukin-6)', unit: 'pg/mL', low: 0, high: 7, whatItIs: 'A signalling protein involved in the body’s inflammatory response.', highMeans: 'Can reflect acute or chronic inflammation.', lifestyleContext: 'Sleep, stress management, and reducing chronic inflammation sources all help.' },
  { key: 'tnf-alpha', name: 'TNF-α (Tumour Necrosis Factor Alpha)', unit: 'pg/mL', low: 0, high: 8.1, whatItIs: 'A signalling protein that helps regulate immune and inflammatory responses.', highMeans: 'Can reflect chronic inflammation.', lifestyleContext: 'Interpreted alongside other inflammatory markers rather than alone.' },
  { key: 'homocysteine', name: 'Homocysteine', unit: 'µmol/L', low: 0, high: 15, whatItIs: 'An amino acid linked to B-vitamin status and cardiovascular health.', highMeans: 'Can reflect B12, B6, or folate deficiency, and is linked to cardiovascular risk.', lifestyleContext: 'Often improves with adequate B-vitamin and folate intake.' },
  { key: 'calprotectin', name: 'Calprotectin', unit: 'µg/g', low: 0, high: 50, whatItIs: 'A marker of inflammation specifically within the gut, usually measured from a stool sample.', highMeans: 'Can indicate gut inflammation and may warrant further investigation.', lifestyleContext: 'Best interpreted alongside your wider digestive symptoms and history.' },
  { key: 'esr', name: 'ESR (Erythrocyte Sedimentation Rate)', unit: 'mm/hr', low: 0, high: 20, whatItIs: 'A general marker of inflammation in the body.', highMeans: 'Can reflect infection, inflammation, or other underlying conditions.', lifestyleContext: 'A non-specific marker, usually interpreted alongside other results and symptoms.' },
  { key: 'uric-acid', name: 'Uric Acid', unit: 'µmol/L', low: 140, high: 420, whatItIs: 'A waste product from the breakdown of purines in food and cells.', highMeans: 'Can be linked to gout risk or metabolic factors.', lifestyleContext: 'Reducing alcohol and purine-rich foods (e.g. red meat, shellfish) can help.' },

  // --- Thyroid ---
  { key: 'tsh', name: 'TSH (Thyroid Stimulating Hormone)', unit: 'mIU/L', low: 0.4, high: 4.0, whatItIs: 'A pituitary hormone that regulates your thyroid gland.', highMeans: 'Can indicate an underactive thyroid (hypothyroidism).', lowMeans: 'Can indicate an overactive thyroid (hyperthyroidism).', lifestyleContext: 'Thyroid function is best assessed alongside Free T4 and how you’re feeling.' },
  { key: 'free-t4', name: 'Free T4', unit: 'pmol/L', low: 9, high: 21, whatItIs: 'The main hormone produced by your thyroid gland.', highMeans: 'Can indicate an overactive thyroid.', lowMeans: 'Can indicate an underactive thyroid.', lifestyleContext: 'Interpreted alongside TSH for a full picture of thyroid function.' },
  { key: 'free-t3', name: 'Free T3', unit: 'pmol/L', low: 3.1, high: 6.8, whatItIs: 'An active thyroid hormone that influences metabolism.', highMeans: 'Can indicate an overactive thyroid.', lowMeans: 'Can indicate an underactive thyroid or non-thyroidal illness.', lifestyleContext: 'Interpreted alongside TSH and Free T4.' },

  // --- Vitamins & minerals ---
  { key: 'vitamin-d', name: 'Vitamin D', unit: 'nmol/L', low: 50, high: 250, whatItIs: 'A vitamin essential for bone health and immune function, made mostly by sunlight on skin.', lowMeans: 'Low levels are common, especially in winter, and can affect bone and immune health.', lifestyleContext: 'Sensible sun exposure and supplementation (especially Oct–Mar in the UK) support levels in the usual range.' },
  { key: 'vitamin-b12', name: 'Vitamin B12', unit: 'ng/L', low: 197, high: 771, whatItIs: 'A vitamin essential for nerve function and red blood cell production.', lowMeans: 'Can cause fatigue, and if prolonged, nerve symptoms.', lifestyleContext: 'Found mainly in animal products, so plant-based diets often benefit from supplementation.' },
  { key: 'folate', name: 'Folate', unit: 'µg/L', low: 3.9, high: 26.8, whatItIs: 'A B-vitamin needed for cell division and red blood cell production.', lowMeans: 'Can contribute to fatigue and anaemia.', lifestyleContext: 'Leafy greens, legumes, and fortified foods support levels in the usual range.' },
  { key: 'ferritin', name: 'Ferritin', unit: 'µg/L', low: 30, high: 400, whatItIs: 'A protein that stores iron. It reflects your body’s iron reserves.', highMeans: 'Can reflect iron overload or, commonly, an inflammatory response rather than true excess iron.', lowMeans: 'Indicates depleted iron stores, often before anaemia develops.', lifestyleContext: 'Iron-rich food helps; persistent low levels are worth discussing with your GP.' },
  { key: 'iron', name: 'Serum Iron', unit: 'µmol/L', low: 10, high: 30, whatItIs: 'The amount of iron currently circulating in your blood.', highMeans: 'Can fluctuate with recent diet or supplementation.', lowMeans: 'Can contribute to iron-deficiency anaemia.', lifestyleContext: 'Best interpreted alongside ferritin for the full iron picture.' },
  { key: 'tibc', name: 'Total Iron Binding Capacity', unit: 'µmol/L', low: 45, high: 72, whatItIs: 'A measure of how much iron your blood could carry, reflecting iron transport capacity.', lifestyleContext: 'Interpreted alongside serum iron and ferritin.' },
  { key: 'calcium', name: 'Calcium', unit: 'mmol/L', low: 2.2, high: 2.6, whatItIs: 'A mineral essential for bone health, muscle function, and nerve signalling.', highMeans: 'Can reflect parathyroid or bone conditions.', lowMeans: 'Can reflect vitamin D deficiency or parathyroid conditions.', lifestyleContext: 'Dairy, fortified plant milks, and leafy greens are good dietary sources.' },
  { key: 'rbc-magnesium', name: 'RBC Magnesium', unit: 'mmol/L', low: 1.5, high: 2.5, whatItIs: 'A measure of magnesium stored inside your red blood cells, a more reliable picture than blood serum levels.', lowMeans: 'Can contribute to fatigue, cramps, and poor sleep.', lifestyleContext: 'Nuts, seeds, wholegrains, and leafy greens are good dietary sources.' },
  { key: 'zinc', name: 'Zinc', unit: 'µmol/L', low: 10, high: 18, whatItIs: 'A mineral important for immune function and wound healing.', lowMeans: 'Can affect immune function, taste, and skin health.', lifestyleContext: 'Meat, shellfish, seeds, and legumes are good dietary sources.' },

  // --- Hormones ---
  { key: 'testosterone', name: 'Testosterone', unit: 'nmol/L', low: 8.6, high: 29, sex: 'MALE', whatItIs: 'The primary male sex hormone, also present in smaller amounts in women.', highMeans: 'Can reflect certain hormonal conditions.', lowMeans: 'Can contribute to low energy, reduced libido, and mood changes.', lifestyleContext: 'Sleep, resistance exercise, and healthy weight all support natural levels.' },
  { key: 'testosterone-f', name: 'Testosterone', unit: 'nmol/L', low: 0.3, high: 1.7, sex: 'FEMALE', whatItIs: 'A sex hormone present in smaller amounts in women, important for energy and libido.', highMeans: 'Can reflect conditions such as PCOS.', lowMeans: 'Can contribute to low energy and reduced libido.', lifestyleContext: 'Sleep, resistance exercise, and healthy weight all support natural levels.' },
  { key: 'free-testosterone', name: 'Free Testosterone', unit: 'pmol/L', low: 198, high: 619, sex: 'MALE', whatItIs: 'The portion of testosterone that’s freely available for your body to use.', lowMeans: 'Can better explain symptoms than total testosterone alone, especially if SHBG is outside its usual range.', lifestyleContext: 'Sleep, resistance exercise, and healthy weight all support natural levels.' },
  { key: 'free-testosterone', name: 'Free Testosterone', unit: 'pmol/L', low: 1.0, high: 8.5, sex: 'FEMALE', whatItIs: 'The portion of testosterone that’s freely available for your body to use.', lowMeans: 'Can better explain symptoms than total testosterone alone, especially if SHBG is outside its usual range.', lifestyleContext: 'Sleep, resistance exercise, and healthy weight all support natural levels.' },
  { key: 'oestradiol', name: 'Oestradiol', unit: 'pmol/L', low: 100, high: 500, sex: 'FEMALE', whatItIs: 'The main form of oestrogen, central to the menstrual cycle and bone health.', lowMeans: 'Can relate to menopause or reduced ovarian function.', lifestyleContext: 'Levels vary naturally across the menstrual cycle and life stage.' },
  { key: 'amh', name: 'AMH (Anti-Müllerian Hormone)', unit: 'pmol/L', low: 7.0, high: 35.0, sex: 'FEMALE', whatItIs: 'A hormone that reflects your remaining ovarian egg reserve.', lowMeans: 'Suggests a lower ovarian reserve. This is context for fertility planning, not a diagnosis.', highMeans: 'Can be associated with conditions such as PCOS.', lifestyleContext: 'AMH declines naturally with age; a single result is best discussed in context.' },
  { key: 'fsh', name: 'FSH (Follicle Stimulating Hormone)', unit: 'IU/L', low: 1.5, high: 12.4, whatItIs: 'A hormone that regulates the menstrual cycle and sperm production.', highMeans: 'Can relate to reduced ovarian reserve or menopause.', lifestyleContext: 'Timing in the menstrual cycle significantly affects this result.' },
  { key: 'lh', name: 'LH (Luteinising Hormone)', unit: 'IU/L', low: 1.7, high: 8.6, whatItIs: 'A hormone that triggers ovulation and supports testosterone production.', lifestyleContext: 'Timing in the menstrual cycle significantly affects this result.' },
  { key: 'progesterone', name: 'Progesterone', unit: 'nmol/L', low: 0, high: 999, sex: 'FEMALE', whatItIs: 'A hormone essential for the menstrual cycle and early pregnancy.', lifestyleContext: 'Timing in the menstrual cycle significantly affects this result, which is usually tested in the mid-luteal phase.' },
  { key: 'prolactin', name: 'Prolactin', unit: 'mIU/L', low: 102, high: 496, whatItIs: 'A hormone best known for its role in milk production, also relevant to menstrual and reproductive health.', highMeans: 'Can affect menstrual cycles and fertility.', lifestyleContext: 'Can rise with stress or shortly after a meal, so it is worth repeating under calm, fasted conditions if raised.' },
  { key: 'shbg', name: 'SHBG (Sex Hormone Binding Globulin)', unit: 'nmol/L', low: 10, high: 57, whatItIs: 'A protein that binds sex hormones like testosterone and oestrogen, affecting how much is freely available.', lifestyleContext: 'Interpreted alongside total and free testosterone.' },
  { key: 'dhea-s', name: 'DHEA-S', unit: 'µmol/L', low: 2.2, high: 15.2, whatItIs: 'A hormone produced by the adrenal glands, a precursor to testosterone and oestrogen.', highMeans: 'Can relate to adrenal conditions.', lowMeans: 'Can relate to reduced adrenal reserve or normal ageing.', lifestyleContext: 'Naturally declines with age.' },
  { key: 'cortisol', name: 'Cortisol', unit: 'nmol/L', low: 133, high: 537, whatItIs: 'The body’s primary stress hormone, also involved in metabolism and immune regulation.', highMeans: 'Can reflect ongoing stress or, rarely, an adrenal condition.', lowMeans: 'Can reflect adrenal insufficiency.', lifestyleContext: 'Time of day significantly affects results, so this is best tested in the morning.' },
];

/**
 * The clinic offers three test levels — Core, Insight 360 and Signature — and
 * those are now seeded from the real Randox catalogue (see seedCatalogue.ts and
 * shared/markerCatalogue.ts) rather than from the guessed compositions this
 * file used to hold.
 *
 * The panels below are what those guesses were. They are DEACTIVATED rather
 * than deleted, per the no-hard-deletes rule: a report released last year
 * against "RP10 Heart Health" still has to render with its panel name intact,
 * and deleting the row would leave that report with a dangling foreign key and
 * a patient with a titleless result set. Deactivated panels disappear from the
 * pickers; nothing else about them changes.
 *
 * `signature` is absent from this list on purpose — the new catalogue reuses
 * that exact key, so the panel is upgraded in place rather than retired.
 */
/**
 * The three test levels the clinic offers. Anything else still active after a
 * seed run is reported at the end of it (see below) rather than deactivated —
 * an admin is free to add custom panels, and the seed has no way to tell one of
 * those from a leftover guess.
 */
const CLINIC_PANEL_KEYS = ['core', 'insight-360', 'signature'];

const SUPERSEDED_PANEL_KEYS = [
  'ran-chip-insight-360',
  'advanced-gp3-male',
  'advanced-gp3-female',
  'nutritional-health-hsc15',
  'rp3-metabolic-syndrome',
  'rp10-heart-health',
  'hsc14-fertility',
];

// Markers available across panels rather than tied to one panel's composition
// — Omega-3 Index, AMH, Free Testosterone, Calprotectin. Attached as an add-on
// to every active panel that doesn't already carry them as a base marker, so
// any panel can have any of the four added at order time.
const crossPanelAddOnMarkerKeys = ['omega-3-index', 'amh', 'free-testosterone', 'calprotectin'];

// Randox cannot supply these under Aspire's current agreement — never
// seeded, and detached/deactivated below if left over from an older seed
// run (never hard-deleted, in case a historical report already used one).
const EXCLUDED_MARKER_KEYS = ['oxidised-ldl', 'mpo'];

/**
 * Markers that were never part of the product and got into a real database
 * anyway.
 *
 * `test-marker` ("Test Marker", mmol/L) is a fixture key from
 * tests/demoSeedData.test.ts that reached the development database on 5 August
 * 2026. It is in no panel, no health area and no report, it has no explanation
 * copy, and the seed's own output was reporting it every run as "1 marker has
 * NO copy in markerExplanations.ts" — an alarm about a marker that should not
 * exist.
 *
 * DEACTIVATED, NOT DELETED, and by the same loop as the list above, for the
 * same reason: no hard deletes anywhere. It costs one inactive row and it
 * cannot orphan anything if some record somewhere does turn out to reference
 * it. It is a separate constant because the reason is a separate reason —
 * "Randox cannot supply this" and "this is a test fixture" should not be one
 * undifferentiated list of keys nobody can explain later.
 */
const STRAY_MARKER_KEYS = ['test-marker'];

const sourceDefinitions = [
  { key: 'randox_portal', name: 'Randox Portal' },
  { key: 'randox_api', name: 'Randox API' },
  { key: 'aspire_inhouse', name: 'Aspire In-House' },
  { key: 'manual_entry', name: 'Manual Entry' },
];

/**
 * "The same words, differently punctuated."
 *
 * Every upsert in this file is `update: {}` on purpose: a seed that overwrites
 * on every deploy is a seed quietly overruling whoever edited the copy. The
 * cost of that, discovered by reading the rendered product rather than the
 * source, is that a house-style correction never reaches a database that was
 * already seeded. Em dashes were taken out of the source copy months ago and
 * were still on screen in every environment, because no row was ever updated.
 *
 * So the rule is narrow rather than blanket. Strip punctuation and case from
 * both sides: if what is stored is the seed's own wording in an older
 * punctuation style, it is this file's copy and this file may correct it. If
 * anybody has changed a word, the normalised forms differ and the stored text
 * is left exactly alone.
 *
 * The one thing this deliberately does overwrite is a human edit that changed
 * ONLY punctuation. That is the trade: house style is the thing being enforced,
 * and it is worth more than preserving a comma somebody moved.
 */
/**
 * `supersedes` lists wordings this file has shipped before.
 *
 * The restyle rule below only replaces a stored block whose WORDS still match
 * this file's, so a genuine shortening of the copy would otherwise reach new
 * environments and never the live one — the same failure the marker
 * explanations already guard against. A stored body matching a superseded
 * wording exactly is ours to replace; anything else was reworded by a human
 * and is still left alone.
 */
const copyBlocks: { slug: string; body: string; supersedes?: string[] }[] = [
  {
    slug: 'out_of_range_prompt',
    /**
     * PROSE ONLY. The clinic's address and email used to be pasted onto the
     * end of this string, comma-joined, which made the copy block a second
     * (and by then a stale) source of truth for contact details — and put
     * "Aspire Clinic, Aspire Group of Companies, 27 Mortimer Street, London"
     * on the one card somebody reads when they are worried.
     *
     * The details now come from getClinicContact() and are rendered one item
     * per line by the shared ClinicContact component on screen and by the
     * same four lines in the PDF. This block says the thing only a clinician
     * can say; nothing in it has to be edited when the clinic moves.
     */
    body: 'One or more of your results falls outside the usual reference range. This is not a diagnosis. Many things affect a single result, and only a clinician who knows your full history can interpret it properly. Please contact your GP or the Aspire clinical team to discuss it.',
    supersedes: [
      'One or more of your results falls outside the usual reference range. This is not a diagnosis. Many things affect a single result, and only a clinician who knows your full history can interpret it properly. Please contact your GP or the Aspire clinical team to discuss it.\n\nAspire Clinic, Aspire Group of Companies, 27 Mortimer Street, London\nClinical team: clinical-team@aspireshield.com',
      'One or more of your results falls outside the expected reference range. This is not a diagnosis. Many things can affect a single result, and only a clinician who knows your full history can interpret it properly. Please contact your GP or the Aspire clinical team to discuss these results and next steps.\n\nAspire Clinic, Aspire Group of Companies, 27 Mortimer Street, London\nClinical team: clinical-team@aspireshield.com',
    ],
  },
  {
    slug: 'footer_disclaimer',
    body: 'This portal is for information only and does not constitute a diagnosis or medical advice. If you have concerns about your results, contact your GP or the Aspire clinical team. In a medical emergency, call 999 or NHS 111.',
    supersedes: [
      'The information in this portal is provided for your information and does not constitute a diagnosis or medical advice. If you have concerns about your results, please contact your GP or the Aspire clinical team. In a medical emergency, call 999 or NHS 111.',
    ],
  },
];

const retentionPolicies = [
  { dataType: 'CLINICAL_REPORTS', retentionPeriodDays: 8 * 365 },
  { dataType: 'AUDIT_LOG', retentionPeriodDays: 8 * 365 },
  { dataType: 'CONSENT_RECORDS', retentionPeriodDays: 8 * 365 },
];

/**
 * The house-style sweep over copy that lives in the database.
 *
 * Three corrections now, not one: the spaced em dash out, the straight
 * apostrophe curled, and an en dash joining two words replaced with a hyphen.
 * A numeric range keeps its en dash, here and everywhere else — `3.9–5.1` is
 * how every reference range in the product is set.
 *
 * Two boundaries, both deliberate.
 *
 * It is punctuation only — applyHouseStyle adds and removes no words — so the
 * meaning of a clinical sentence cannot change here.
 *
 * Copy a named clinician has signed off is corrected too, and that is the part
 * worth being explicit about. It would be safer-looking to skip those and
 * print a list for somebody to work through, but a list nobody actions leaves
 * the em dashes on the screen, which is the whole problem. What makes it
 * defensible is the same thing that makes it safe: no word changes, so nothing
 * a reviewer approved is different in substance. What makes it accountable is
 * that every reviewed record touched gets an audit entry naming the field,
 * with a SYSTEM actor, because a clinical record that changes silently is
 * worse than one that changes. The review status itself is untouched: pulling
 * approved copy back into the queue over a comma would take it off the
 * patient's screen for no clinical reason.
 */
async function restyleStoredCopy() {
  const explanations = await prisma.markerExplanation.findMany({
    include: { marker: { select: { name: true } } },
  });

  const FIELDS = ['whatItIs', 'highMeans', 'lowMeans', 'lifestyleContext'] as const;
  let cleaned = 0;
  let audited = 0;
  let reworded = 0;

  for (const e of explanations) {
    const patch: Partial<Record<(typeof FIELDS)[number], string>> = {};
    const changedFields: string[] = [];
    let wordingChanged = false;
    for (const field of FIELDS) {
      const value = e[field];
      if (typeof value !== 'string') continue;
      // Compare rather than sniff for a character: several corrections run here
      // now, and "does it contain an em dash" stopped being the question.
      //
      // Two passes, and the difference between them is the whole reason the
      // audit entry below distinguishes them. applyHouseStyle is punctuation
      // and cannot change a word. applyVocabularyRule substitutes from a fixed,
      // written-down table of exact phrases that breach the non-diagnostic
      // vocabulary rule — it DOES change words, so it is recorded as such.
      const styled = applyHouseStyle(value);
      const restyled = applyVocabularyRule(styled);
      if (restyled === value) continue;
      if (restyled !== styled) wordingChanged = true;
      patch[field] = restyled;
      changedFields.push(field);
    }
    if (changedFields.length === 0) continue;

    await prisma.markerExplanation.update({ where: { id: e.id }, data: patch });
    cleaned += 1;
    if (wordingChanged) reworded += 1;

    if (e.reviewedById) {
      await prisma.auditLogEntry.create({
        data: {
          actorType: 'SYSTEM',
          action: 'MARKER_EXPLANATION_RESTYLED',
          targetType: 'MarkerExplanation',
          targetId: e.id,
          metadata: {
            marker: e.marker.name,
            fields: changedFields,
            change: wordingChanged
              ? 'house style applied, and a phrase from the non-diagnostic vocabulary table substituted (see VOCABULARY_CORRECTIONS in lib/houseStyle.ts)'
              : 'house style applied: em dashes replaced with a full stop or a comma, apostrophes curled, compound en dashes hyphenated',
            // True ONLY where the fixed vocabulary table fired. Every other
            // correction in this sweep is punctuation and cannot change a word.
            wordingChanged,
          },
        },
      });
      audited += 1;
    }
  }

  if (cleaned > 0) {
    console.log(
      `  Applied house style to ${cleaned} marker explanation(s).` +
        (reworded > 0
          ? ` ${reworded} also had a phrase substituted from the non-diagnostic vocabulary table; the rest were punctuation only.`
          : ' Punctuation only, no wording changed.') +
        (audited > 0 ? ` ${audited} were clinician-reviewed and are recorded in the audit log.` : ''),
    );
  }

  // The same sweep over the two copy blocks. They ship from this file so they
  // should already be in style, but they are editable in the admin console and
  // this is the only place that would catch it if somebody pasted otherwise.
  const blocks = await prisma.copyBlock.findMany();
  let blocksCleaned = 0;
  for (const b of blocks) {
    const restyled = applyVocabularyRule(applyHouseStyle(b.body));
    if (restyled === b.body) continue;
    await prisma.copyBlock.update({ where: { id: b.id }, data: { body: restyled } });
    blocksCleaned += 1;
  }
  if (blocksCleaned > 0) {
    console.log(`  Applied house style to ${blocksCleaned} copy block(s). Punctuation only, no wording changed.`);
  }
}

/**
 * THE SEX-SPECIFIC RANGES FROM A PUBLISHED THIRD-PARTY LABORATORY.
 *
 * Twenty analytes in the catalogue are sex-dependent in clinical use and store
 * one blanket `ANY` band, which renders an ordinary, correctly-formatted
 * suggestion that is wrong for roughly half of patients. Ten of them can now
 * be answered from a named source; the other ten cannot and stay flagged. See
 * publishedReferenceRanges.ts for the source, the conversions and, for every
 * analyte NOT loaded, the reason.
 *
 * THREE PROPERTIES, ALL OF THEM DELIBERATE:
 *
 *  · IT NEVER OVERWRITES A RANDOX ROW. Reference intervals are assay-specific.
 *    A row already at `RANDOX` is left exactly as it is and the fact is
 *    printed, because "we skipped it" and "we forgot it" look identical in a
 *    silent run.
 *  · IT ONLY EVER TOUCHES A ROW NO RESULT POINTS AT, and this is the one that
 *    bites. `ReferenceRange` holds two different things under one roof: the
 *    catalogue of fallbacks, and one row per result ever materialised
 *    recording what was printed on that patient's paper (see the audit —
 *    3,127 rows across 444 markers in this development database, and one
 *    marker with 76). A `findFirst` on marker-and-sex therefore lands on an
 *    arbitrary RESULT record far more often than on the catalogue row, and
 *    updating it rewrites one patient's history to say their laboratory
 *    printed a range it did not. `results: { none: {} }` is the whole
 *    difference and it is not an optimisation.
 *  · IT REPLACES ITS OWN PREVIOUS ROW rather than adding a second one. The
 *    catalogue is meant to hold one row per marker-and-sex; the table's habit
 *    of accumulating rows is a separate known defect and this must not feed it.
 *  · THE BLANKET `ANY` ROW GOES. Leaving it beside the two sex-specific rows
 *    would keep answering for a patient with no sex on file — which is exactly
 *    the silent wrong answer being fixed, still there, now with company. With
 *    it gone the resolver refuses and says why.
 */
async function seedPublishedReferenceRanges() {
  let written = 0;
  let skippedRandox = 0;
  let anyRemoved = 0;
  const unknownMarkers: string[] = [];

  for (const range of PUBLISHED_RANGES) {
    const marker = await prisma.marker.findUnique({ where: { key: range.markerKey } });
    if (!marker) {
      unknownMarkers.push(range.markerKey);
      continue;
    }

    // A CATALOGUE row and never a result's own record. See the third bullet
    // above: without `results: { none: {} }` this rewrites a patient's history.
    const existing = await prisma.referenceRange.findFirst({
      where: { markerId: marker.id, sex: range.sex, ageMin: null, ageMax: null, results: { none: {} } },
      orderBy: { createdAt: 'asc' },
    });
    if (existing?.provenance === 'RANDOX') {
      skippedRandox += 1;
      continue;
    }

    const data = {
      markerId: marker.id,
      sex: range.sex,
      unit: range.stored.unit,
      low: range.stored.low,
      high: range.stored.high,
      source: publishedRangeSource(range),
      provenance: 'PUBLISHED' as const,
      sourceDocument: LOTHIAN.document,
      sourcePublisher: LOTHIAN.publisher,
      sourceDate: LOTHIAN.date,
      sourceUrl: LOTHIAN.url,
    };
    if (existing) await prisma.referenceRange.update({ where: { id: existing.id }, data });
    else await prisma.referenceRange.create({ data });
    written += 1;
  }

  // The blanket row, once BOTH sexes are covered — never before. Removing it
  // while only one sex had a band would leave the other with nothing.
  for (const key of [...new Set(PUBLISHED_RANGES.map((r) => r.markerKey))]) {
    const sexes = new Set(PUBLISHED_RANGES.filter((r) => r.markerKey === key).map((r) => r.sex));
    if (sexes.size < 2) continue;
    const marker = await prisma.marker.findUnique({ where: { key } });
    if (!marker) continue;
    const blanket = await prisma.referenceRange.findMany({
      where: { markerId: marker.id, sex: 'ANY', provenance: { not: 'RANDOX' }, results: { none: {} } },
    });
    for (const row of blanket) {
      // `results: { none: {} }` above is the guard that matters: a row a real
      // result points at is that result's record of what was printed on the
      // paper, not a catalogue fallback, and deleting one would rewrite
      // history. Those are left and the count says so.
      await prisma.referenceRange.delete({ where: { id: row.id } });
      anyRemoved += 1;
    }
  }

  console.log(
    `  Wrote ${written} sex-specific range(s) at PUBLISHED, from ${LOTHIAN.publisher} (${LOTHIAN.date}).` +
      (anyRemoved > 0 ? ` Removed ${anyRemoved} blanket ANY row(s) they replace.` : '') +
      (skippedRandox > 0 ? ` Left ${skippedRandox} alone because a RANDOX range already covers them.` : ''),
  );
  console.log(
    `  ${WITHHELD.length} sex-dependent analyte(s) are deliberately NOT loaded and stay flagged: ` +
      `${WITHHELD.map((w) => w.name).join(', ')}. See prisma/publishedReferenceRanges.ts for the reason on each.`,
  );
  if (unknownMarkers.length > 0) {
    console.log(`  ${unknownMarkers.length} range(s) name a marker this database has no row for: ${unknownMarkers.join(', ')}`);
  }
}

/**
 * THE FIXTURE ACCOUNTS. Every user any seed in this repository creates.
 *
 * Exported so `explanationApprovals.test.ts` asserts the retraction below
 * against the same list rather than a second copy of it — a list that drifts
 * from the accounts it names is a filter that quietly stops filtering.
 */
export const SEED_FIXTURE_EMAILS = [
  'admin@aspireshield.dev',
  'clinician@aspireshield.dev',
  'demo.admin@aspireshield.dev',
  'demo.clinician@aspireshield.dev',
  'demo.showcase@aspireshield.dev',
  'demo.patient@example.com',
] as const;

/**
 * RETRACT EVERY APPROVAL THAT IS NOT A REAL ONE, AND SAY SO IN THE AUDIT LOG.
 *
 * The seed has not written a review status for some time (see the note in
 * main() below), but the rows an earlier version of it wrote are still in every
 * database it ever ran against — 69 attributed to Chloe Clinician, one to Ada
 * Admin, two with no reviewer at all. "Stopped creating them" is not the same
 * as "they are gone", and while they are there the product reports 72 pieces of
 * clinical copy as checked when the honest number is zero. That is worse than
 * a DRAFT row, not better: nobody goes back to something already ticked off.
 *
 * A REVIEW IS A NAMED PERSON WHO READ IT. So exactly three things are retracted
 * here, and nothing else:
 *
 *  · A status with no `reviewedById`. There is nobody to ask what was checked.
 *  · A status attributed to one of the accounts a seed creates. A fixture is
 *    not a reviewer, whatever its job title says on the record.
 *  · Nothing else. A row signed by a real account is left exactly as it is,
 *    including one signed by an administrator rather than a clinician — that
 *    is a real person's real act and it is the audit's job to say it is not a
 *    clinical sign-off, not this sweep's job to erase it.
 *
 * Each retraction gets its own audit entry under a SYSTEM actor naming the
 * status it held and the account it was attributed to, because a clinical
 * record that changes silently is worse than one that changes.
 */
async function retractSeedApprovals() {
  const fixtureIds = new Set(
    (
      await prisma.user.findMany({
        where: { email: { in: [...SEED_FIXTURE_EMAILS] } },
        select: { id: true, email: true },
      })
    ).map((u) => [u.id, u.email] as const),
  );
  const emailById = new Map(fixtureIds);

  const suspect = await prisma.markerExplanation.findMany({
    where: { reviewStatus: { not: 'DRAFT' } },
    include: { marker: { select: { name: true } } },
  });

  const fixtureUserIds = new Set(emailById.keys());
  let retracted = 0;
  for (const e of suspect) {
    // A real account signed it. Not ours to undo — see explanationReview.ts.
    if (!isRetractableApproval(e, fixtureUserIds)) continue;
    const attributedTo = e.reviewedById ? emailById.get(e.reviewedById) : undefined;

    await prisma.markerExplanation.update({
      where: { id: e.id },
      data: { reviewStatus: 'DRAFT', reviewedById: null, reviewedAt: null },
    });
    await prisma.auditLogEntry.create({
      data: {
        actorType: 'SYSTEM',
        action: 'MARKER_EXPLANATION_APPROVAL_RETRACTED',
        targetType: 'MarkerExplanation',
        targetId: e.id,
        metadata: {
          marker: e.marker.name,
          from: e.reviewStatus,
          to: 'DRAFT',
          attributedTo: attributedTo ?? null,
          reason: retractionReason(e, attributedTo ?? null),
        },
      },
    });
    retracted += 1;
  }

  if (retracted > 0) {
    console.log(
      `  Retracted ${retracted} explanation approval(s) that no real reviewer signed. Each is recorded in the audit log.`,
    );
  }
}

/**
 * Write patient-facing copy for every catalogue marker that has none.
 *
 * The catalogue import creates several hundred markers (food sensitivity items,
 * genetic indicators, microbiome proportions, the long tail of measured
 * analytes) with no explanation attached. Until this ran, every one of them
 * rendered a placeholder line telling the patient the wording was still being
 * finalised, which on a report someone paid four figures for is the worst
 * sentence on the page.
 *
 * Three properties this deliberately has:
 *
 *  - CREATE ONLY. `markerExplanation.create` inside an existence check, never
 *    an update. Copy an admin or a clinician has since edited is not this
 *    file's to touch, and neither is the older seed copy above.
 *  - reviewStatus STAYS DRAFT. Nobody clinical has read this wording. The
 *    field records who checked what, and writing REVIEWED here would be a lie
 *    told to the one team that relies on it. Patients see the copy either way
 *    (see patients/service.ts) and cannot tell the difference, which is the
 *    correct division: draft is an internal fact about review, not a warning
 *    to hang in front of somebody reading about their ferritin.
 *  - ONE AUDIT ROW PER EXPLANATION, under a SYSTEM actor. Bulk write, per-copy
 *    record, exactly as the review queue does for bulk approval.
 *
 * A marker this has no honest copy for gets NO explanation row and is named in
 * the run's output. A visible gap somebody can fill beats a sentence that
 * sounds finished and says nothing.
 */
async function writeMissingExplanations() {
  const markers = await prisma.marker.findMany({
    where: { isActive: true, explanation: null },
    select: { id: true, key: true, name: true, resultType: true },
    orderBy: { name: 'asc' },
  });
  if (markers.length === 0) {
    console.log('  Every active marker already has explanation copy.');
    return;
  }

  const written: Record<string, number> = { MEASURED: 0, GENETIC: 0, SENSITIVITY: 0, COMPOSITION: 0, QUALITATIVE: 0 };
  const unwritten: string[] = [];

  for (const marker of markers) {
    const copy = explanationFor(marker);
    if (!copy) {
      unwritten.push(`${marker.key} (${marker.resultType})`);
      continue;
    }

    // highMeans / lowMeans / lifestyleContext stay null on purpose. A sentence
    // beginning "if it's high" is a statement about the reader rather than
    // about the analyte, and none of this copy has been near a clinician.
    const explanation = await prisma.markerExplanation.create({
      data: { markerId: marker.id, whatItIs: copy.whatItIs, reviewStatus: 'DRAFT' },
    });

    await prisma.auditLogEntry.create({
      data: {
        actorType: 'SYSTEM',
        action: 'MARKER_EXPLANATION_CREATED',
        targetType: 'MarkerExplanation',
        targetId: explanation.id,
        metadata: {
          markerId: marker.id,
          markerKey: marker.key,
          resultType: marker.resultType,
          reviewStatus: 'DRAFT',
          source: 'seed: prisma/markerExplanations.ts (Aspire-authored, not clinician-reviewed)',
        },
      },
    });

    written[marker.resultType] = (written[marker.resultType] ?? 0) + 1;
  }

  const total = Object.values(written).reduce((a, b) => a + b, 0);
  console.log(`  Wrote ${total} explanation(s), all DRAFT and all recorded in the audit log:`);
  for (const [type, n] of Object.entries(written)) if (n > 0) console.log(`    ${type.padEnd(12)} ${n}`);
  if (unwritten.length > 0) {
    console.log(`  ${unwritten.length} marker(s) have NO copy in markerExplanations.ts and were left without one:`);
    for (const k of unwritten) console.log(`    - ${k}`);
  }
}

async function main() {
  console.log('Removing excluded markers (Randox cannot supply) and stray fixtures...');
  for (const [key, why] of [
    ...EXCLUDED_MARKER_KEYS.map((k) => [k, 'Randox cannot supply'] as const),
    ...STRAY_MARKER_KEYS.map((k) => [k, 'test fixture, never part of the product'] as const),
  ]) {
    const existing = await prisma.marker.findUnique({ where: { key } });
    if (!existing || !existing.isActive) continue;
    await prisma.panelMarker.deleteMany({ where: { markerId: existing.id } });
    await prisma.markerCategoryMembership.deleteMany({ where: { markerId: existing.id } });
    await prisma.marker.update({ where: { id: existing.id }, data: { isActive: false } });
    console.log(`  - deactivated and detached: ${key} (${why})`);
  }

  console.log('Seeding sources...');
  for (const s of sourceDefinitions) {
    await prisma.source.upsert({ where: { key: s.key }, update: { name: s.name }, create: s });
  }

  console.log('Seeding markers...');
  const markerIdByKey = new Map<string, string>();
  let restyledExplanations = 0;
  for (const m of markers) {
    const marker = await prisma.marker.upsert({
      where: { key: m.key },
      update: {},
      create: {
        key: m.key,
        name: m.name,
        defaultUnit: m.unit,
        severityMultiplier: m.severityMultiplier ?? 1.5,
      },
    });
    markerIdByKey.set(m.key, marker.id);

    const existingRange = await prisma.referenceRange.findFirst({
      where: { markerId: marker.id, sex: m.sex ?? 'ANY' },
    });
    if (!existingRange) {
      await prisma.referenceRange.create({
        data: {
          markerId: marker.id,
          sex: m.sex ?? 'ANY',
          unit: m.unit,
          low: m.low,
          high: m.high,
          source: 'Seed default: standard adult reference range, confirm against Randox report',
          // UNSOURCED, and that is the honest tier for every one of these:
          // they are standard adult bands nobody has verified against a
          // document. The audit says so in a file; this says so on the row,
          // which is what the verify form can actually show an admin.
          provenance: 'UNSOURCED',
        },
      });
    }

    let explanation = await prisma.markerExplanation.upsert({
      where: { markerId: marker.id },
      update: {},
      create: {
        markerId: marker.id,
        whatItIs: m.whatItIs,
        highMeans: m.highMeans,
        lowMeans: m.lowMeans,
        lifestyleContext: m.lifestyleContext,
        reviewStatus: 'DRAFT',
      },
    });

    // Same words, older punctuation: this is the seed's own copy and the seed
    // may restyle it. This is what carries a house-style change (em dashes out)
    // into a database that was seeded before it — without it, a correction to
    // this file reaches new environments only, and the live product keeps
    // rendering copy nobody can find in the repository. See sameWords.
    const restyled = {
      whatItIs: m.whatItIs,
      highMeans: m.highMeans ?? null,
      lowMeans: m.lowMeans ?? null,
      lifestyleContext: m.lifestyleContext ?? null,
    };
    const isSeedCopyRestyled =
      (Object.keys(restyled) as (keyof typeof restyled)[]).every((k) => sameWords(explanation[k], restyled[k])) &&
      (Object.keys(restyled) as (keyof typeof restyled)[]).some((k) => explanation[k] !== restyled[k]);
    if (isSeedCopyRestyled) {
      explanation = await prisma.markerExplanation.update({ where: { id: explanation.id }, data: restyled });
      restyledExplanations += 1;
    }

    // No auto-approve. This used to promote untouched seed copy to REVIEWED,
    // because patient visibility hung off reviewStatus and copy that seeded as
    // DRAFT was copy nobody ever saw. Visibility no longer hangs off it (see
    // writeMissingExplanations below, and patients/service.ts), so the only
    // thing a promotion here would achieve is a record saying a clinician
    // checked wording no clinician has read. reviewStatus is a factual record
    // of who checked what, and a seed cannot truthfully write to it.
    //
    // Rows already REVIEWED in an existing database by a REAL account are left
    // exactly as they are. The ones an earlier version of this seed wrote are
    // not — see retractSeedApprovals(), which runs below and undoes them with
    // an audit entry each.
    void explanation;
  }

  if (restyledExplanations > 0) {
    console.log(`Re-styled ${restyledExplanations} seed explanation(s) to the current punctuation. No wording changed.`);
  }

  console.log('Retiring superseded guessed panels (deactivated, never deleted)...');
  for (const key of SUPERSEDED_PANEL_KEYS) {
    const existing = await prisma.panel.findUnique({ where: { key } });
    if (!existing || !existing.isActive) continue;
    await prisma.panel.update({ where: { id: existing.id }, data: { isActive: false } });
    console.log(`  - deactivated: ${key} (reports already filed against it keep their title)`);
  }

  console.log('Importing the Randox catalogue (Core, Insight 360, Signature)...');
  const catalogueReport = await seedRandoxCatalogue();
  console.log(formatCatalogueReport(catalogueReport));

  // After the catalogue, because the catalogue is what creates the markers
  // this writes copy for.
  console.log('Writing explanation copy for markers that have none...');
  await writeMissingExplanations();

  // AFTER every explanation exists and BEFORE the run reports anything, so the
  // count it prints is the count a reader would get. The seed does not create
  // approvals; this takes back the ones an earlier version of it did.
  console.log('Retracting explanation approvals no real reviewer signed...');
  await retractSeedApprovals();

  // After the catalogue too — several of these markers (troponin I, CA 125,
  // the microalbumin ratio) exist only because the catalogue import created
  // them, so running this earlier would file ranges against nothing.
  console.log('Loading sourced sex-specific reference ranges...');
  await seedPublishedReferenceRanges();

  // Anything else still active is either an older seed's guess that predates
  // SUPERSEDED_PANEL_KEYS, or a panel an admin deliberately created. Those two
  // are indistinguishable from here and only one of them should be retired, so
  // this reports rather than acts: deactivating an admin's own custom panel on
  // every deploy would be a seed quietly overruling a person.
  const strays = await prisma.panel.findMany({
    where: { isActive: true, key: { notIn: CLINIC_PANEL_KEYS } },
    select: { key: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (strays.length > 0) {
    console.log(`\n${strays.length} active panel(s) outside the three the clinic offers:`);
    for (const p of strays) console.log(`  - ${p.key} ("${p.name}")`);
    console.log('  Deactivate any of these that are no longer sold, on the admin Panels screen.\n');
  }

  console.log('Attaching cross-panel add-on markers (Omega-3 Index, AMH, Free Testosterone, Calprotectin)...');
  const activePanels = await prisma.panel.findMany({
    where: { isActive: true },
    include: { markers: { select: { markerId: true } } },
  });
  for (const panel of activePanels) {
    const already = new Set(panel.markers.map((pm) => pm.markerId));
    for (const markerKey of crossPanelAddOnMarkerKeys) {
      const markerId = markerIdByKey.get(markerKey);
      // Already on the panel as a base marker — don't override its sortOrder
      // or demote it to an add-on.
      if (!markerId || already.has(markerId)) continue;
      await prisma.panelMarker.upsert({
        where: { panelId_markerId: { panelId: panel.id, markerId } },
        update: { isAddOn: true },
        create: { panelId: panel.id, markerId, isAddOn: true, sortOrder: 999 },
      });
    }
  }

  console.log('Seeding copy blocks...');
  let restyledBlocks = 0;
  for (const c of copyBlocks) {
    const existing = await prisma.copyBlock.upsert({
      where: { slug: c.slug },
      update: {},
      create: { slug: c.slug, body: c.body },
    });
    // Still this file's copy — either its current words in an older
    // punctuation style, or a wording this file used to ship. Either way it is
    // ours to bring up to date. Anything a human has actually reworded is left
    // alone, because it matches neither.
    const isOurs =
      sameWords(existing.body, c.body) || (c.supersedes ?? []).some((prev) => sameWords(existing.body, prev));
    if (existing.body !== c.body && isOurs) {
      await prisma.copyBlock.update({ where: { id: existing.id }, data: { body: c.body } });
      restyledBlocks += 1;
    }
  }
  if (restyledBlocks > 0) {
    console.log(`  Brought ${restyledBlocks} copy block(s) up to this file’s current wording and punctuation.`);
  }

  await restyleStoredCopy();

  console.log('Seeding retention policies...');
  for (const r of retentionPolicies) {
    await prisma.retentionPolicy.upsert({
      where: { dataType: r.dataType },
      update: {},
      create: r,
    });
  }

  console.log('Seeding consent versions...');
  const consentTypes = ['DATA_PROCESSING', 'RESULTS_STORAGE', 'COMMS_EMAIL', 'COMMS_SMS'] as const;
  const consentBodies: Record<(typeof consentTypes)[number], string> = {
    DATA_PROCESSING: 'I consent to Aspire Clinic processing my personal and health data to provide blood test results through this portal, in line with the Privacy Policy.',
    RESULTS_STORAGE: 'I consent to my blood test results being stored securely and made available to me through this portal.',
    COMMS_EMAIL: 'I consent to receiving email communications from Aspire Clinic about my results and account.',
    COMMS_SMS: 'I consent to receiving SMS communications from Aspire Clinic about my results and account.',
  };
  for (const type of consentTypes) {
    await prisma.consentVersion.upsert({
      where: { type_version: { type, version: 1 } },
      update: {},
      create: { type, version: 1, bodyText: consentBodies[type] },
    });
  }

  // Dev staff logins + a demo patient — never in production. Admin access
  // is entirely env-driven (ADMIN_EMAILS, see lib/adminAccess.ts), so
  // there is no legitimate reason for the seed script to create a
  // login-ready admin account in production; doing so would mean a
  // well-known hardcoded password (the SEED_*_PASSWORD override exists,
  // but the fallback below is public in this repo's history) sitting on
  // a real account. Skipped outright rather than trusted to be
  // remembered at seed time.
  if (process.env.NODE_ENV === 'production') {
    console.log('NODE_ENV=production — skipping dev staff users and demo patient.');
    return;
  }

  console.log('Seeding dev staff users...');
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'DevAdminPass123!';
  const clinicianPassword = process.env.SEED_CLINICIAN_PASSWORD ?? 'DevClinicianPass123!';

  const admin = await prisma.user.upsert({
    where: { email: 'admin@aspireshield.dev' },
    update: {},
    create: {
      email: 'admin@aspireshield.dev',
      passwordHash: await hashPassword(adminPassword),
      role: 'ADMIN',
      status: 'ACTIVE',
      twoFactorMethod: 'EMAIL',
      staffProfile: { create: { firstName: 'Ada', lastName: 'Admin', roleTitle: 'Practice Administrator' } },
    },
  });

  const clinician = await prisma.user.upsert({
    where: { email: 'clinician@aspireshield.dev' },
    update: {},
    create: {
      email: 'clinician@aspireshield.dev',
      passwordHash: await hashPassword(clinicianPassword),
      role: 'CLINICIAN',
      status: 'ACTIVE',
      twoFactorMethod: 'EMAIL',
      staffProfile: {
        create: { firstName: 'Chloe', lastName: 'Clinician', postNominals: 'MBBS, MRCGP', roleTitle: 'Clinical Lead' },
      },
    },
  });

  console.log('Seeding one invited demo patient...');
  const demoPatient = await prisma.user.upsert({
    where: { email: 'demo.patient@example.com' },
    update: {},
    create: {
      email: 'demo.patient@example.com',
      passwordHash: await hashPassword(generateToken(24)), // unusable placeholder until activation
      role: 'PATIENT',
      status: 'INVITED',
      twoFactorMethod: 'EMAIL',
      patientProfile: {
        create: {
          firstName: 'Demo',
          lastName: 'Patient',
          sex: 'FEMALE',
          dobEncrypted: encryptField('1990-01-01'),
          contactNumberEncrypted: encryptField('+44 7700 900000'),
          addressEncrypted: encryptField('1 Example Street, London'),
          postcode: 'W1W 5RH',
          gpName: 'Dr Example GP',
          gpAddressEncrypted: encryptField('Example Surgery, London'),
        },
      },
    },
  });

  const rawInviteToken = generateToken(32);
  await prisma.inviteToken.upsert({
    where: { tokenHash: hashToken(rawInviteToken) },
    update: {},
    create: {
      userId: demoPatient.id,
      tokenHash: hashToken(rawInviteToken),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    },
  });

  console.log('\nSeed complete.');
  console.log(`Admin login:      admin@aspireshield.dev / ${adminPassword}`);
  console.log(`Clinician login:  clinician@aspireshield.dev / ${clinicianPassword}`);
  console.log(`Demo patient invite token (dev only): ${rawInviteToken}`);
  void admin;
  void clinician;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
