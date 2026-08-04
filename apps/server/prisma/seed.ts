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
  { key: 'haemoglobin', name: 'Haemoglobin', unit: 'g/L', low: 130, high: 170, sex: 'MALE', whatItIs: 'The protein in red blood cells that carries oxygen around your body.', highMeans: 'Can reflect dehydration, smoking, or conditions that increase red cell production.', lowMeans: 'Often reflects anaemia — reduced capacity to carry oxygen, which can cause fatigue and breathlessness.', lifestyleContext: 'Iron-rich food, staying hydrated, and treating any underlying cause support healthy levels.' },
  { key: 'haemoglobin-f', name: 'Haemoglobin', unit: 'g/L', low: 120, high: 150, sex: 'FEMALE', whatItIs: 'The protein in red blood cells that carries oxygen around your body.', highMeans: 'Can reflect dehydration, smoking, or conditions that increase red cell production.', lowMeans: 'Often reflects anaemia — reduced capacity to carry oxygen, which can cause fatigue and breathlessness.', lifestyleContext: 'Iron-rich food, staying hydrated, and treating any underlying cause support healthy levels.' },
  { key: 'wbc', name: 'White Blood Cell Count', unit: '10^9/L', low: 4.0, high: 11.0, whatItIs: 'Cells that make up your immune system and fight infection.', highMeans: 'Can indicate infection, inflammation, or stress on the body.', lowMeans: 'Can indicate a weakened immune response or certain viral infections.', lifestyleContext: 'Levels vary with recent illness — a repeat test when well is often more informative.' },
  { key: 'platelets', name: 'Platelet Count', unit: '10^9/L', low: 150, high: 400, whatItIs: 'Cell fragments that help your blood clot.', highMeans: 'Can occur after inflammation, infection, or iron deficiency.', lowMeans: 'Can increase bruising or bleeding risk.', lifestyleContext: 'Usually monitored alongside other blood count markers rather than in isolation.' },
  { key: 'rbc', name: 'Red Blood Cell Count', unit: '10^12/L', low: 4.2, high: 5.9, whatItIs: 'The number of oxygen-carrying cells circulating in your blood.', highMeans: 'Can reflect dehydration or conditions that overproduce red cells.', lowMeans: 'Often reflects anaemia.', lifestyleContext: 'Interpreted alongside haemoglobin and haematocrit.' },
  { key: 'haematocrit', name: 'Haematocrit', unit: '%', low: 36, high: 50, whatItIs: 'The proportion of your blood made up of red blood cells.', highMeans: 'Can reflect dehydration or overproduction of red cells.', lowMeans: 'Often reflects anaemia or overhydration.', lifestyleContext: 'Interpreted alongside haemoglobin and red cell count.' },
  { key: 'mcv', name: 'Mean Cell Volume (MCV)', unit: 'fL', low: 80, high: 100, whatItIs: 'The average size of your red blood cells.', highMeans: 'Can relate to vitamin B12 or folate deficiency, or alcohol intake.', lowMeans: 'Can relate to iron deficiency.', lifestyleContext: 'A useful clue to the underlying cause when haemoglobin is also low.' },
  { key: 'rdw', name: 'Red Cell Distribution Width (RDW)', unit: '%', low: 11.5, high: 14.5, whatItIs: 'How much variation there is in the size of your red blood cells.', highMeans: 'Can indicate an early nutrient deficiency or mixed causes of anaemia.', lifestyleContext: 'Most useful alongside other full blood count markers.' },
  { key: 'neutrophils', name: 'Neutrophils', unit: '10^9/L', low: 2.0, high: 7.5, whatItIs: 'The most common type of white blood cell, first responders to infection.', highMeans: 'Can indicate bacterial infection, inflammation, or stress.', lowMeans: 'Can increase susceptibility to infection.', lifestyleContext: 'Levels shift quickly with acute illness.' },
  { key: 'lymphocytes', name: 'Lymphocytes', unit: '10^9/L', low: 1.0, high: 4.0, whatItIs: 'White blood cells central to your immune system’s response to viruses.', highMeans: 'Can reflect a recent or ongoing viral infection.', lowMeans: 'Can reflect immune suppression or recent illness.', lifestyleContext: 'Often interpreted alongside white cell count and recent health history.' },

  // --- Liver function ---
  { key: 'alt', name: 'ALT (Alanine Aminotransferase)', unit: 'U/L', low: 0, high: 41, whatItIs: 'An enzyme found mainly in the liver; raised levels can signal liver cell stress.', highMeans: 'Can reflect fatty liver, alcohol intake, medication effects, or viral hepatitis.', lifestyleContext: 'Alcohol reduction, weight management, and reviewing medications can help.' },
  { key: 'ast', name: 'AST (Aspartate Aminotransferase)', unit: 'U/L', low: 0, high: 40, whatItIs: 'An enzyme found in the liver and muscles; raised levels can signal cell stress.', highMeans: 'Can reflect liver strain, muscle damage, or heavy alcohol intake.', lifestyleContext: 'Interpreted alongside ALT and the AST:ALT ratio.' },
  { key: 'ggt', name: 'GGT (Gamma-Glutamyl Transferase)', unit: 'U/L', low: 0, high: 60, whatItIs: 'A liver enzyme sensitive to alcohol intake and bile flow.', highMeans: 'Can reflect alcohol intake, fatty liver, or bile duct issues.', lifestyleContext: 'Often the first liver marker to rise with alcohol intake and the first to fall on reduction.' },
  { key: 'bilirubin', name: 'Total Bilirubin', unit: 'µmol/L', low: 0, high: 21, whatItIs: 'A breakdown product of red blood cells, processed by the liver.', highMeans: 'Can reflect liver dysfunction, bile duct blockage, or increased red cell breakdown.', lifestyleContext: 'Mildly raised levels in isolation are often a benign, harmless variant (Gilbert’s syndrome).' },
  { key: 'albumin', name: 'Albumin', unit: 'g/L', low: 35, high: 50, whatItIs: 'The main protein made by your liver, important for fluid balance and transport.', lowMeans: 'Can reflect liver disease, inflammation, or poor nutrition.', lifestyleContext: 'Adequate protein intake supports healthy levels.' },
  { key: 'alp', name: 'Alkaline Phosphatase (ALP)', unit: 'U/L', low: 30, high: 130, whatItIs: 'An enzyme found in the liver and bone.', highMeans: 'Can reflect bile duct issues, liver conditions, or bone turnover.', lifestyleContext: 'Naturally higher during bone growth or healing.' },
  { key: 'total-protein', name: 'Total Protein', unit: 'g/L', low: 60, high: 80, whatItIs: 'The combined level of all proteins in your blood, including albumin.', lifestyleContext: 'Interpreted alongside albumin and overall nutritional status.' },

  // --- Kidney function ---
  { key: 'creatinine', name: 'Creatinine', unit: 'µmol/L', low: 60, high: 110, whatItIs: 'A waste product filtered out by your kidneys, used to estimate kidney function.', highMeans: 'Can reflect reduced kidney function or high muscle mass.', lifestyleContext: 'Staying well hydrated supports accurate results.' },
  { key: 'egfr', name: 'eGFR (Estimated Glomerular Filtration Rate)', unit: 'mL/min/1.73m²', low: 90, high: 999, whatItIs: 'An estimate of how well your kidneys are filtering waste from your blood.', lowMeans: 'Lower values can indicate reduced kidney function.', lifestyleContext: 'Blood pressure control and hydration support kidney health.' },
  { key: 'urea', name: 'Urea', unit: 'mmol/L', low: 2.5, high: 7.8, whatItIs: 'A waste product from protein breakdown, cleared by the kidneys.', highMeans: 'Can reflect reduced kidney function or dehydration.', lifestyleContext: 'Interpreted alongside creatinine and eGFR.' },
  { key: 'sodium', name: 'Sodium', unit: 'mmol/L', low: 135, high: 145, whatItIs: 'An electrolyte that helps regulate fluid balance and nerve function.', highMeans: 'Can reflect dehydration.', lowMeans: 'Can reflect fluid overload or certain medications.', lifestyleContext: 'Usually reflects hydration status at the time of testing.' },
  { key: 'potassium', name: 'Potassium', unit: 'mmol/L', low: 3.5, high: 5.1, whatItIs: 'An electrolyte essential for nerve and muscle function, including the heart.', highMeans: 'Can reflect kidney function or certain medications.', lowMeans: 'Can occur with certain medications or gastrointestinal losses.', lifestyleContext: 'Significant abnormalities here warrant prompt clinical attention.' },

  // --- Lipids ---
  { key: 'total-cholesterol', name: 'Total Cholesterol', unit: 'mmol/L', low: 0, high: 5.0, whatItIs: 'The combined measure of all cholesterol carried in your blood.', highMeans: 'Higher levels are linked to increased cardiovascular risk over time.', lifestyleContext: 'Diet, exercise, and not smoking all support healthy cholesterol levels.' },
  { key: 'hdl', name: 'HDL Cholesterol', unit: 'mmol/L', low: 1.0, high: 999, whatItIs: 'Often called "good" cholesterol — helps remove excess cholesterol from your bloodstream.', lowMeans: 'Lower levels are linked to increased cardiovascular risk.', lifestyleContext: 'Regular exercise is one of the most effective ways to raise HDL.' },
  { key: 'ldl', name: 'LDL Cholesterol', unit: 'mmol/L', low: 0, high: 3.0, whatItIs: 'Often called "bad" cholesterol — can build up in artery walls over time.', highMeans: 'Higher levels are linked to increased cardiovascular risk.', lifestyleContext: 'Diet lower in saturated fat and regular activity both help.' },
  { key: 'triglycerides', name: 'Triglycerides', unit: 'mmol/L', low: 0, high: 1.7, whatItIs: 'A type of fat in your blood, largely influenced by diet.', highMeans: 'Can reflect diet, alcohol intake, or metabolic factors.', lifestyleContext: 'Reducing refined sugar and alcohol intake often has a quick effect.' },
  { key: 'chol-hdl-ratio', name: 'Total Cholesterol / HDL Ratio', unit: 'ratio', low: 0, high: 4.5, whatItIs: 'A calculated ratio that helps put your total cholesterol into context.', highMeans: 'A higher ratio is linked to increased cardiovascular risk.', lifestyleContext: 'Improves with the same lifestyle changes that improve cholesterol overall.' },
  { key: 'apob', name: 'ApoB (Apolipoprotein B)', unit: 'g/L', low: 0, high: 1.0, whatItIs: 'A protein found on the particles that carry "bad" cholesterol — reflects the number of these particles.', highMeans: 'Considered a strong marker of cardiovascular risk, sometimes more precise than LDL alone.', lifestyleContext: 'Responds to the same diet and lifestyle changes as LDL cholesterol.' },
  { key: 'oxidised-ldl', name: 'Oxidised LDL', unit: 'U/L', low: 0, high: 60, whatItIs: 'A form of LDL cholesterol that has undergone oxidative damage, thought to be more harmful to artery walls.', highMeans: 'Associated with increased cardiovascular risk.', lifestyleContext: 'Antioxidant-rich food, not smoking, and managing standard cholesterol all help.' },
  { key: 'lp-pla2', name: 'Lp-PLA2', unit: 'ng/mL', low: 0, high: 200, whatItIs: 'An enzyme linked to inflammation within blood vessel walls.', highMeans: 'Associated with increased cardiovascular risk, independent of cholesterol levels.', lifestyleContext: 'Anti-inflammatory lifestyle habits — diet, exercise, not smoking — support lower levels.' },
  { key: 'omega-3-index', name: 'Omega-3 Index', unit: '%', low: 8, high: 999, whatItIs: 'The proportion of omega-3 fatty acids in your red blood cell membranes.', lowMeans: 'Lower levels are linked to increased cardiovascular risk.', lifestyleContext: 'Oily fish, or omega-3 supplementation, raises this over 2–3 months.' },

  // --- Glycaemic ---
  { key: 'glucose', name: 'Fasting Glucose', unit: 'mmol/L', low: 3.9, high: 5.5, whatItIs: 'The amount of sugar circulating in your blood after fasting.', highMeans: 'Can indicate insulin resistance or a risk of developing diabetes.', lifestyleContext: 'Reducing refined carbohydrates and regular activity both help regulate blood sugar.' },
  { key: 'hba1c', name: 'HbA1c', unit: 'mmol/mol', low: 20, high: 42, whatItIs: 'A measure of your average blood sugar over the past 2–3 months.', highMeans: 'Higher levels indicate a risk of, or existing, diabetes.', lifestyleContext: 'Diet, weight management, and activity all meaningfully influence this over months.' },
  { key: 'fasting-insulin', name: 'Fasting Insulin', unit: 'mIU/L', low: 2, high: 25, whatItIs: 'The hormone that regulates blood sugar, measured after fasting.', highMeans: 'Elevated levels can be an early sign of insulin resistance, often before blood sugar itself rises.', lifestyleContext: 'Reducing refined carbohydrate intake and regular exercise both improve insulin sensitivity.' },

  // --- Inflammation ---
  { key: 'hs-crp', name: 'hs-CRP (High-Sensitivity C-Reactive Protein)', unit: 'mg/L', low: 0, high: 3.0, whatItIs: 'A sensitive marker of low-grade inflammation in the body.', highMeans: 'Can reflect general inflammation and is linked to cardiovascular risk when persistently raised.', lifestyleContext: 'Can be raised temporarily by illness or injury — an isolated raised result is often best repeated.' },
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
  { key: 'vitamin-d', name: 'Vitamin D', unit: 'nmol/L', low: 50, high: 250, whatItIs: 'A vitamin essential for bone health and immune function, made mostly by sunlight on skin.', lowMeans: 'Low levels are common, especially in winter, and can affect bone and immune health.', lifestyleContext: 'Sensible sun exposure and supplementation (especially Oct–Mar in the UK) support healthy levels.' },
  { key: 'vitamin-b12', name: 'Vitamin B12', unit: 'ng/L', low: 197, high: 771, whatItIs: 'A vitamin essential for nerve function and red blood cell production.', lowMeans: 'Can cause fatigue, and if prolonged, nerve symptoms.', lifestyleContext: 'Found mainly in animal products — plant-based diets often benefit from supplementation.' },
  { key: 'folate', name: 'Folate', unit: 'µg/L', low: 3.9, high: 26.8, whatItIs: 'A B-vitamin needed for cell division and red blood cell production.', lowMeans: 'Can contribute to fatigue and anaemia.', lifestyleContext: 'Leafy greens, legumes, and fortified foods support healthy levels.' },
  { key: 'ferritin', name: 'Ferritin', unit: 'µg/L', low: 30, high: 400, whatItIs: 'A protein that stores iron — reflects your body’s iron reserves.', highMeans: 'Can reflect iron overload or, commonly, an inflammatory response rather than true excess iron.', lowMeans: 'Indicates depleted iron stores, often before anaemia develops.', lifestyleContext: 'Iron-rich food helps; persistent low levels are worth discussing with your GP.' },
  { key: 'iron', name: 'Serum Iron', unit: 'µmol/L', low: 10, high: 30, whatItIs: 'The amount of iron currently circulating in your blood.', highMeans: 'Can fluctuate with recent diet or supplementation.', lowMeans: 'Can contribute to iron-deficiency anaemia.', lifestyleContext: 'Best interpreted alongside ferritin for the full iron picture.' },
  { key: 'tibc', name: 'Total Iron Binding Capacity', unit: 'µmol/L', low: 45, high: 72, whatItIs: 'A measure of how much iron your blood could carry, reflecting iron transport capacity.', lifestyleContext: 'Interpreted alongside serum iron and ferritin.' },
  { key: 'calcium', name: 'Calcium', unit: 'mmol/L', low: 2.2, high: 2.6, whatItIs: 'A mineral essential for bone health, muscle function, and nerve signalling.', highMeans: 'Can reflect parathyroid or bone conditions.', lowMeans: 'Can reflect vitamin D deficiency or parathyroid conditions.', lifestyleContext: 'Dairy, fortified plant milks, and leafy greens are good dietary sources.' },
  { key: 'rbc-magnesium', name: 'RBC Magnesium', unit: 'mmol/L', low: 1.5, high: 2.5, whatItIs: 'A measure of magnesium stored inside your red blood cells, a more reliable picture than blood serum levels.', lowMeans: 'Can contribute to fatigue, cramps, and poor sleep.', lifestyleContext: 'Nuts, seeds, wholegrains, and leafy greens are good dietary sources.' },
  { key: 'zinc', name: 'Zinc', unit: 'µmol/L', low: 10, high: 18, whatItIs: 'A mineral important for immune function and wound healing.', lowMeans: 'Can affect immune function, taste, and skin health.', lifestyleContext: 'Meat, shellfish, seeds, and legumes are good dietary sources.' },

  // --- Hormones ---
  { key: 'testosterone', name: 'Testosterone', unit: 'nmol/L', low: 8.6, high: 29, sex: 'MALE', whatItIs: 'The primary male sex hormone, also present in smaller amounts in women.', highMeans: 'Can reflect certain hormonal conditions.', lowMeans: 'Can contribute to low energy, reduced libido, and mood changes.', lifestyleContext: 'Sleep, resistance exercise, and healthy weight all support natural levels.' },
  { key: 'testosterone-f', name: 'Testosterone', unit: 'nmol/L', low: 0.3, high: 1.7, sex: 'FEMALE', whatItIs: 'A sex hormone present in smaller amounts in women, important for energy and libido.', highMeans: 'Can reflect conditions such as PCOS.', lowMeans: 'Can contribute to low energy and reduced libido.', lifestyleContext: 'Sleep, resistance exercise, and healthy weight all support natural levels.' },
  { key: 'free-testosterone', name: 'Free Testosterone', unit: 'pmol/L', low: 198, high: 619, sex: 'MALE', whatItIs: 'The portion of testosterone that’s freely available for your body to use.', lowMeans: 'Can better explain symptoms than total testosterone alone, especially if SHBG is abnormal.', lifestyleContext: 'Sleep, resistance exercise, and healthy weight all support natural levels.' },
  { key: 'oestradiol', name: 'Oestradiol', unit: 'pmol/L', low: 100, high: 500, sex: 'FEMALE', whatItIs: 'The main form of oestrogen, central to the menstrual cycle and bone health.', lowMeans: 'Can relate to menopause or reduced ovarian function.', lifestyleContext: 'Levels vary naturally across the menstrual cycle and life stage.' },
  { key: 'amh', name: 'AMH (Anti-Müllerian Hormone)', unit: 'pmol/L', low: 7.0, high: 35.0, sex: 'FEMALE', whatItIs: 'A hormone that reflects your remaining ovarian egg reserve.', lowMeans: 'Suggests a lower ovarian reserve — relevant context for fertility planning, not a diagnosis.', highMeans: 'Can be associated with conditions such as PCOS.', lifestyleContext: 'AMH declines naturally with age; a single result is best discussed in context.' },
  { key: 'fsh', name: 'FSH (Follicle Stimulating Hormone)', unit: 'IU/L', low: 1.5, high: 12.4, whatItIs: 'A hormone that regulates the menstrual cycle and sperm production.', highMeans: 'Can relate to reduced ovarian reserve or menopause.', lifestyleContext: 'Timing in the menstrual cycle significantly affects this result.' },
  { key: 'lh', name: 'LH (Luteinising Hormone)', unit: 'IU/L', low: 1.7, high: 8.6, whatItIs: 'A hormone that triggers ovulation and supports testosterone production.', lifestyleContext: 'Timing in the menstrual cycle significantly affects this result.' },
  { key: 'progesterone', name: 'Progesterone', unit: 'nmol/L', low: 0, high: 999, sex: 'FEMALE', whatItIs: 'A hormone essential for the menstrual cycle and early pregnancy.', lifestyleContext: 'Timing in the menstrual cycle significantly affects this result — usually tested mid-luteal phase.' },
  { key: 'prolactin', name: 'Prolactin', unit: 'mIU/L', low: 102, high: 496, whatItIs: 'A hormone best known for its role in milk production, also relevant to menstrual and reproductive health.', highMeans: 'Can affect menstrual cycles and fertility.', lifestyleContext: 'Can rise with stress or shortly after a meal — repeat testing under calm, fasted conditions if raised.' },
  { key: 'shbg', name: 'SHBG (Sex Hormone Binding Globulin)', unit: 'nmol/L', low: 10, high: 57, whatItIs: 'A protein that binds sex hormones like testosterone and oestrogen, affecting how much is freely available.', lifestyleContext: 'Interpreted alongside total and free testosterone.' },
  { key: 'dhea-s', name: 'DHEA-S', unit: 'µmol/L', low: 2.2, high: 15.2, whatItIs: 'A hormone produced by the adrenal glands, a precursor to testosterone and oestrogen.', highMeans: 'Can relate to adrenal conditions.', lowMeans: 'Can relate to reduced adrenal reserve or normal ageing.', lifestyleContext: 'Naturally declines with age.' },
  { key: 'cortisol', name: 'Cortisol', unit: 'nmol/L', low: 133, high: 537, whatItIs: 'The body’s primary stress hormone, also involved in metabolism and immune regulation.', highMeans: 'Can reflect ongoing stress or, rarely, an adrenal condition.', lowMeans: 'Can reflect adrenal insufficiency.', lifestyleContext: 'Time of day significantly affects results — this is best tested in the morning.' },
];

const panelDefinitions: { key: string; name: string; description: string; markerKeys: { key: string; isAddOn?: boolean }[] }[] = [
  {
    key: 'ran-chip-insight-360',
    name: 'Ran Chip Insight 360',
    description: 'Randox’s most comprehensive panel — a full 360-degree view across blood count, organ function, cardiovascular, metabolic, and inflammatory markers.',
    markerKeys: ['haemoglobin','haemoglobin-f','wbc','platelets','rbc','haematocrit','mcv','rdw','neutrophils','lymphocytes','alt','ast','ggt','bilirubin','albumin','alp','total-protein','creatinine','egfr','urea','sodium','potassium','total-cholesterol','hdl','ldl','triglycerides','chol-hdl-ratio','glucose','hba1c','tsh','free-t4','free-t3','vitamin-d','vitamin-b12','folate','ferritin','iron','calcium','hs-crp','esr','uric-acid'].map((key) => ({ key })),
  },
  {
    key: 'signature',
    name: 'Signature',
    description: 'A focused general health check covering blood count, key organ function, and cardiovascular markers.',
    markerKeys: ['haemoglobin','haemoglobin-f','wbc','platelets','alt','creatinine','egfr','total-cholesterol','hdl','ldl','triglycerides','glucose','tsh'].map((key) => ({ key })),
  },
  {
    key: 'advanced-gp3-male',
    name: 'Advanced GP3 (Male)',
    description: 'Comprehensive men’s health panel spanning organ function, cardiovascular, metabolic, and male hormone markers.',
    markerKeys: ['haemoglobin','wbc','platelets','alt','ast','ggt','creatinine','egfr','total-cholesterol','hdl','ldl','triglycerides','glucose','hba1c','tsh','free-t4','free-t3','vitamin-d','vitamin-b12','ferritin','testosterone','shbg'].map((key) => ({ key })),
  },
  {
    key: 'advanced-gp3-female',
    name: 'Advanced GP3 (Female)',
    description: 'Comprehensive women’s health panel spanning organ function, cardiovascular, metabolic, and female hormone markers.',
    markerKeys: ['haemoglobin-f','wbc','platelets','alt','ast','ggt','creatinine','egfr','total-cholesterol','hdl','ldl','triglycerides','glucose','hba1c','tsh','free-t4','free-t3','vitamin-d','vitamin-b12','ferritin','testosterone-f','oestradiol','shbg'].map((key) => ({ key })),
  },
  {
    key: 'nutritional-health-hsc15',
    name: 'Nutritional Health HSC15',
    description: 'A 15-marker panel focused on vitamin, mineral, and nutritional status.',
    markerKeys: ['vitamin-d','vitamin-b12','folate','ferritin','iron','tibc','calcium','rbc-magnesium','zinc','haemoglobin','albumin','total-protein','calprotectin','uric-acid','hba1c'].map((key) => ({ key })),
  },
  {
    key: 'rp3-metabolic-syndrome',
    name: 'RP3 Metabolic Syndrome',
    description: 'Markers associated with metabolic syndrome — blood sugar regulation, insulin sensitivity, and related lipids.',
    markerKeys: ['glucose','hba1c','fasting-insulin','triglycerides','hdl','total-cholesterol'].map((key) => ({ key, isAddOn: key === 'fasting-insulin' })),
  },
  {
    key: 'rp10-heart-health',
    name: 'RP10 Heart Health',
    description: 'An in-depth cardiovascular risk panel covering lipids, apolipoproteins, and vascular inflammation markers.',
    markerKeys: ['total-cholesterol','hdl','ldl','triglycerides','chol-hdl-ratio','apob','oxidised-ldl','lp-pla2','hs-crp','homocysteine','omega-3-index'].map((key) => ({ key, isAddOn: ['apob','oxidised-ldl','lp-pla2','homocysteine','omega-3-index'].includes(key) })),
  },
  {
    key: 'hsc14-fertility',
    name: 'HSC14 Fertility',
    description: 'A 14-marker fertility and reproductive hormone panel.',
    markerKeys: ['fsh','lh','oestradiol','progesterone','prolactin','shbg','amh','testosterone-f','dhea-s','cortisol','tsh','vitamin-d'].map((key) => ({ key, isAddOn: ['amh','dhea-s','cortisol'].includes(key) })),
  },
];

// Add-on markers explicitly named in the brief that aren't already attached
// to a panel above get attached to the most clinically relevant panel so
// they exist in the system and can be ordered/reported against.
const extraAddOnAttachments: { panelKey: string; markerKey: string }[] = [
  { panelKey: 'nutritional-health-hsc15', markerKey: 'calprotectin' },
  { panelKey: 'advanced-gp3-male', markerKey: 'free-testosterone' },
  { panelKey: 'rp10-heart-health', markerKey: 'il-6' },
  { panelKey: 'rp10-heart-health', markerKey: 'tnf-alpha' },
];

const copyBlocks = [
  {
    slug: 'out_of_range_prompt',
    body: 'One or more of your results falls outside the expected reference range. This is not a diagnosis — many things can affect a single result, and only a clinician who knows your full history can interpret it properly. Please contact your GP or the Aspire clinical team to discuss these results and next steps.\n\nAspire Clinic — Aspire Group of Companies, 27 Mortimer Street, London\nClinical team: clinical-team@aspireshield.com',
  },
  {
    slug: 'footer_disclaimer',
    body: 'The information in this portal is provided for your information and does not constitute a diagnosis or medical advice. If you have concerns about your results, please contact your GP or the Aspire clinical team. In a medical emergency, call 999 or NHS 111.',
  },
];

const retentionPolicies = [
  { dataType: 'CLINICAL_REPORTS', retentionPeriodDays: 8 * 365 },
  { dataType: 'AUDIT_LOG', retentionPeriodDays: 8 * 365 },
  { dataType: 'CONSENT_RECORDS', retentionPeriodDays: 8 * 365 },
];

async function main() {
  console.log('Seeding markers...');
  const markerIdByKey = new Map<string, string>();
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
          source: 'Seed default — standard adult reference range, confirm against Randox report',
        },
      });
    }

    await prisma.markerExplanation.upsert({
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
  }

  console.log('Seeding panels...');
  for (const p of panelDefinitions) {
    const panel = await prisma.panel.upsert({
      where: { key: p.key },
      update: { name: p.name, description: p.description },
      create: { key: p.key, name: p.name, description: p.description },
    });

    for (const [i, mk] of p.markerKeys.entries()) {
      const markerId = markerIdByKey.get(mk.key);
      if (!markerId) continue;
      await prisma.panelMarker.upsert({
        where: { panelId_markerId: { panelId: panel.id, markerId } },
        update: { isAddOn: mk.isAddOn ?? false, sortOrder: i },
        create: { panelId: panel.id, markerId, isAddOn: mk.isAddOn ?? false, sortOrder: i },
      });
    }
  }

  for (const { panelKey, markerKey } of extraAddOnAttachments) {
    const panel = await prisma.panel.findUnique({ where: { key: panelKey } });
    const markerId = markerIdByKey.get(markerKey);
    if (!panel || !markerId) continue;
    await prisma.panelMarker.upsert({
      where: { panelId_markerId: { panelId: panel.id, markerId } },
      update: { isAddOn: true },
      create: { panelId: panel.id, markerId, isAddOn: true, sortOrder: 999 },
    });
  }

  console.log('Seeding copy blocks...');
  for (const c of copyBlocks) {
    await prisma.copyBlock.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
  }

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
