/**
 * Patient-facing explanation copy for every marker in the Randox catalogue
 * that prisma/seed.ts's own `markers` list does not already cover.
 *
 * ─── Why this file is separate from seed.ts ────────────────────────────────
 *
 * seed.ts carries copy for the ~72 analytes it also seeds reference ranges
 * for, and it promotes that copy out of DRAFT itself. The catalogue import
 * (seedCatalogue.ts) then creates several hundred more markers with no copy
 * at all, and those are what this file is for. Keeping them apart keeps the
 * two review stories apart too: nothing in here is ever auto-approved, and
 * `reviewStatus` stays DRAFT until a clinician actually reads it.
 *
 * ─── What a good entry looks like ─────────────────────────────────────────
 *
 * One or two sentences describing WHAT THE MARKER IS and WHY IT IS TESTED.
 * Never what a result means about the person reading it. The distinction is
 * the whole discipline of this file:
 *
 *   "An enzyme found mainly in muscle."                 ✓ about the analyte
 *   "A high level suggests muscle damage."              ✗ about the reader
 *
 * So every entry here fills `whatItIs` and nothing else. `highMeans`,
 * `lowMeans` and `lifestyleContext` exist on the model and are used by the
 * older seed copy, but a sentence beginning "if it's high" is a statement
 * about the patient, and none of this copy has been through a clinician.
 * Leaving those three null is not an omission, it is the point.
 *
 * Where the science is thin, the thinness IS the copy. A research-grade
 * cytokine and a direct-to-consumer DNA trait both get an honest sentence
 * saying so, because a confident-sounding sentence about a marker nobody can
 * yet interpret is worse than no sentence at all.
 *
 * British English. No em dashes (see lib/houseStyle.ts, which sweeps stored
 * copy). Nothing here says good, bad, healthy, unhealthy, concerning or
 * optimal, and nothing tells anyone to do anything.
 */

/** Copy for one marker. Only `whatItIs` is ever written from this file. */
export interface ExplanationSeed {
  whatItIs: string;
}

// ---------------------------------------------------------------------------
// MEASURED — an analyte with a value, a unit and a reference range, or a
// qualitative reading from a dipstick, a device or a PCR panel.
// ---------------------------------------------------------------------------

export const MEASURED_EXPLANATIONS: Record<string, ExplanationSeed> = {
  // --- Allergy and autoimmunity ---
  ige: {
    whatItIs:
      'Immunoglobulin E, the class of antibody involved in immediate allergic reactions. A total IgE measures how much of it is circulating overall, and is read alongside symptoms and any allergen-specific testing.',
  },
  'anti-ccp': {
    whatItIs:
      'An antibody directed at citrullinated proteins, which are formed when the body modifies its own proteins during inflammation. It is one of the blood tests used when inflammatory joint disease is being assessed.',
  },
  ana: {
    whatItIs:
      'Antibodies that bind to material inside the body’s own cell nuclei, reported as a titre rather than a concentration. The test is a starting point in the assessment of autoimmune connective tissue conditions, and low titres are also found in people with no such condition.',
  },
  'anti-tg': {
    whatItIs:
      'An antibody directed at thyroglobulin, the protein the thyroid gland uses to build its hormones. It is measured when the immune system involvement in thyroid function is being assessed.',
  },
  'anti-tpo': {
    whatItIs:
      'An antibody directed at thyroid peroxidase, an enzyme the thyroid uses to make its hormones. It is read alongside thyroid hormone levels when autoimmune thyroid conditions are being considered.',
  },
  'anti-ttg': {
    whatItIs:
      'Antibodies directed at tissue transglutaminase, an enzyme found in the lining of the gut. They are measured when coeliac disease is being investigated, and the result is only interpretable if gluten is still being eaten regularly.',
  },
  'gastric-parietal-cell-antibodies': {
    whatItIs:
      "Antibodies directed at the stomach's parietal cells, which make stomach acid and the protein needed to absorb vitamin B12. They are measured as part of the assessment of vitamin B12 deficiency and autoimmune conditions of the stomach lining.",
  },
  'intrinsic-factor-antibodies': {
    whatItIs:
      'Antibodies directed at intrinsic factor, the stomach protein that allows vitamin B12 to be absorbed further down the gut. They are measured when the cause of a low vitamin B12 is being investigated.',
  },
  'rheumatoid-factor': {
    whatItIs:
      'An antibody that binds to other antibodies. It is one of several tests used in the assessment of inflammatory joint disease, and it is also found in some people with no joint condition at all.',
  },
  't1d-autoantibodies': {
    whatItIs:
      'A group of antibodies directed at parts of the insulin-producing cells of the pancreas. They are used to help establish which type of diabetes is present rather than to screen for diabetes.',
  },

  // --- Bone, calcium and the parathyroids ---
  pth: {
    whatItIs:
      'Parathyroid hormone, released by four small glands in the neck to regulate the amount of calcium in the blood. It is interpreted alongside calcium, phosphate and vitamin D rather than on its own.',
  },

  // --- Glucose and metabolism ---
  'c-peptide': {
    whatItIs:
      'A fragment the pancreas releases in equal amount to insulin whenever it makes some. Because it lasts longer in the blood than insulin does, it is used as an indicator of how much insulin the body is producing itself.',
  },
  fructosamine: {
    whatItIs:
      'A measure of glucose bound to proteins in the blood, reflecting average glucose over roughly the previous two to three weeks. It is used where HbA1c would be unreliable, such as when red blood cells are turning over unusually fast.',
  },
  'microalbumin-creatinine-ratio': {
    whatItIs:
      'The amount of albumin in a urine sample expressed against that sample’s creatinine, which corrects for how dilute it was. It is the standard way of detecting small amounts of protein passing into the urine.',
  },
  nefa: {
    whatItIs:
      'Fatty acids circulating unattached to other molecules, released when the body draws on its fat stores. They are measured mainly in research into fat and glucose metabolism, and they move sharply with fasting and with recent meals.',
  },
  adiponectin: {
    whatItIs:
      'A hormone released by fat tissue that acts on how the body handles glucose and fats. It is measured chiefly in metabolic research and has no established clinical interpretation in routine care.',
  },
  'igf-1': {
    whatItIs:
      'Insulin like growth factor 1, made mainly by the liver in response to growth hormone. Because it is far steadier through the day than growth hormone itself, it is used as an indirect measure of growth hormone activity.',
  },

  // --- Digestive ---
  'h-pylori': {
    whatItIs:
      'A test for Helicobacter pylori, a bacterium that can live in the lining of the stomach. It is reported as detected or not detected rather than as a number.',
  },
  gastrin: {
    whatItIs:
      'A hormone made in the stomach lining that stimulates the production of stomach acid. It is measured as part of the assessment of how the stomach is producing acid.',
  },
  'pepsinogen-1': {
    whatItIs:
      'The inactive precursor of pepsin, a protein-digesting enzyme, released by cells in the main body of the stomach. It is measured as an indicator of the state of that part of the stomach lining.',
  },
  'pepsinogen-2': {
    whatItIs:
      'A second form of the pepsin precursor, released from a wider area of the stomach and the upper small intestine. It is usually read as a ratio against pepsinogen 1 rather than on its own.',
  },
  qfit: {
    whatItIs:
      'A quantitative faecal immunochemical test, which measures human haemoglobin in a small stool sample. It is used to detect blood in the stool at levels too low to see.',
  },
  'ttg-iga': {
    whatItIs:
      'The IgA class of antibody against tissue transglutaminase, which is the specific form used in coeliac testing. Because a small number of people make very little IgA of any kind, it is usually interpreted alongside a total IgA measurement.',
  },

  // --- Hormones ---
  'free-androgen-index': {
    whatItIs:
      'A calculation comparing total testosterone with sex hormone binding globulin, the protein that carries most of it. It is used to estimate how much testosterone is available to the tissues rather than bound up in transit.',
  },

  // --- Lipids, apolipoproteins and cardiovascular ---
  'apo-a1': {
    whatItIs:
      'Apolipoprotein A-I, the main structural protein of HDL cholesterol particles, with roughly one molecule per particle. It is measured as an indicator of how many of those particles are circulating.',
  },
  'apo-b-a1-ratio': {
    whatItIs:
      'A calculated comparison of apolipoprotein B with apolipoprotein A-I. It is used in cardiovascular risk assessment to relate the two kinds of cholesterol-carrying particle to one another.',
  },
  'apo-cii': {
    whatItIs:
      'A small protein carried on triglyceride-rich particles, where it switches on the enzyme that breaks triglycerides down. It is measured in the specialist assessment of fat metabolism rather than in routine testing.',
  },
  'apo-e': {
    whatItIs:
      'A protein that helps clear fat-carrying particles from the bloodstream. This is a measurement of the protein circulating in blood, and it is a different test from looking at the APOE gene.',
  },
  'cv-risk-score': {
    whatItIs:
      'A calculated percentage estimating the likelihood of a cardiovascular event over a defined period, combining several measurements with age and other details. Scores of this kind describe averages across large groups of people and do not predict what will happen to any one person.',
  },
  'lipoprotein-a': {
    whatItIs:
      'A cholesterol-carrying particle with an additional protein attached to it. The amount someone has is largely set by inherited factors and changes very little through life.',
  },

  // --- Cardiac and muscle enzymes ---
  'creatine-kinase': {
    whatItIs:
      'An enzyme concentrated in muscle, including heart muscle, which passes into the blood when muscle cells are strained or damaged. Recent hard exercise raises it considerably.',
  },
  'ck-mb': {
    whatItIs:
      'The form of creatine kinase found in relatively high concentration in heart muscle. It was long used in the assessment of heart muscle injury, a role that troponin has now largely taken over.',
  },
  ecg: {
    whatItIs:
      'An electrocardiogram, a recording of the heart’s electrical activity taken through electrodes placed on the skin. It is reported as a written interpretation rather than as a number.',
  },
  myoglobin: {
    whatItIs:
      'A protein that stores oxygen inside muscle cells and passes into the blood when muscle is damaged. It rises and clears quickly, and it does not distinguish heart muscle from the muscles of the limbs.',
  },
  'troponin-i': {
    whatItIs:
      'A protein in the contracting machinery of heart muscle, released into the blood when heart muscle cells are injured. Modern assays detect very small amounts, so results are always read against the timing of any symptoms.',
  },
  'troponin-t': {
    whatItIs:
      'A protein of the same contracting complex in heart muscle as troponin I, measured by a different assay. Laboratories generally report one or the other, and their numbers are not interchangeable.',
  },

  // --- Infection and inflammation ---
  aso: {
    whatItIs:
      'Antistreptolysin O, an antibody made against a toxin produced by group A streptococcus bacteria. It is used to establish whether there has been a recent streptococcal infection rather than to detect a current one.',
  },
  'complement-c3': {
    whatItIs:
      'One of the complement proteins, a set of blood proteins that work with antibodies to clear infection and damaged cells. It is measured as part of the assessment of inflammatory and autoimmune conditions.',
  },
  'd-dimer': {
    whatItIs:
      'A fragment left behind when the body breaks down a blood clot. It is used mainly to help rule blood clots out, because a great many ordinary things also raise it.',
  },
  'e-selectin': {
    whatItIs:
      'An adhesion molecule that appears on the inner lining of blood vessels and helps white blood cells stick to it. It is a research marker of blood vessel lining activation and has no established interpretation in routine care.',
  },
  egf: {
    whatItIs:
      'Epidermal growth factor, a signalling protein involved in the growth and repair of skin and other tissues. It is measured as a research marker, and a single reading has no established clinical meaning.',
  },
  'icam-1': {
    whatItIs:
      'An adhesion molecule on the inner lining of blood vessels that lets white blood cells attach and move into tissue. It is a research marker of inflammation in the vessel wall rather than a routine clinical test.',
  },
  'il-8': {
    whatItIs:
      'Interleukin 8, a signalling protein that draws neutrophils towards a site of inflammation. It is a research marker, and levels move quickly in response to short-lived events.',
  },
  'il-10': {
    whatItIs:
      'Interleukin 10, a signalling protein that damps inflammation down. It is a research marker of the balance between the immune system’s activating and calming signals, with no agreed clinical interpretation.',
  },
  'l-selectin': {
    whatItIs:
      'An adhesion molecule carried on white blood cells that helps them leave the bloodstream and enter tissue. It is a research marker of immune activity rather than a routine clinical test.',
  },
  'mcp-1': {
    whatItIs:
      'Monocyte chemotactic protein 1, a signalling protein that draws monocytes towards inflamed tissue. It is measured as a research marker of inflammation.',
  },
  'p-selectin': {
    whatItIs:
      'An adhesion molecule stored inside platelets and the lining of blood vessels and brought to the surface when either is activated. It is a research marker of platelet and vessel wall activity.',
  },
  'vcam-1': {
    whatItIs:
      'An adhesion molecule that appears on the inner lining of blood vessels and allows white blood cells to bind. It is a research marker of inflammation in the vessel wall, not a routine clinical test.',
  },
  'mip-1-alpha': {
    whatItIs:
      'Macrophage inflammatory protein 1 alpha, a signalling protein that recruits white blood cells to inflamed tissue. It is measured as a research marker and has no established interpretation in routine care.',
  },
  'stnf-r1': {
    whatItIs:
      'The soluble form of one of the two receptors for tumour necrosis factor, shed from cell surfaces into the blood. It is measured as a research marker of inflammatory signalling.',
  },
  'stnf-r2': {
    whatItIs:
      'The soluble form of the second tumour necrosis factor receptor, shed from cell surfaces into the blood. Like its counterpart, it is a research marker of inflammatory signalling.',
  },

  // --- Iron handling ---
  transferrin: {
    whatItIs:
      'The protein that carries iron around the bloodstream. It is read alongside iron and ferritin when the way the body is handling iron is being assessed.',
  },
  'transferrin-saturation': {
    whatItIs:
      'The percentage of transferrin, the blood’s iron carrier, that is currently carrying iron. It is calculated from iron and iron binding capacity rather than measured directly.',
  },

  // --- Kidney ---
  'b2-microglobulin': {
    whatItIs:
      'A small protein shed from the surface of most cells, filtered by the kidneys and then largely reabsorbed. It is used as a marker of kidney filtration and, in specific settings, in the assessment of certain blood conditions.',
  },
  bicarbonate: {
    whatItIs:
      'A dissolved salt that acts as the blood’s main buffer, holding its acidity within a narrow band. It is measured alongside the other electrolytes.',
  },
  'cystatin-c': {
    whatItIs:
      'A small protein made at a steady rate by almost every cell and cleared by the kidneys. It is used to estimate kidney filtration, and unlike creatinine it is largely unaffected by how much muscle someone carries.',
  },
  ngal: {
    whatItIs:
      'Neutrophil gelatinase associated lipocalin, released by the kidney tubules and by certain white blood cells when they are under stress. It is studied as an early signal of kidney injury and is not yet part of routine clinical care.',
  },

  // --- Minerals and nutrition ---
  magnesium: {
    whatItIs:
      'A mineral required by hundreds of enzyme reactions, including those of nerve and muscle function. Blood holds only a small fraction of the body’s total magnesium, so a serum measurement is an indirect guide to overall stores.',
  },
  copper: {
    whatItIs:
      'A trace mineral needed by enzymes involved in iron handling, connective tissue and nerve function. Most of the copper in blood is bound to a carrier protein called caeruloplasmin.',
  },
  'glutathione-reductase': {
    whatItIs:
      'An enzyme in red blood cells that regenerates glutathione, one of the body’s antioxidants. Its activity depends on vitamin B2, so the test is used as an indirect measure of riboflavin status.',
  },

  // --- Liver ---
  aldolase: {
    whatItIs:
      'An enzyme used in the breakdown of glucose for energy, present in both muscle and liver. It passes into the blood when either tissue is damaged.',
  },
  'bile-acids': {
    whatItIs:
      'Acids the liver makes from cholesterol and releases into the gut to help digest fat, most of which is then reabsorbed. Measuring them in blood is used as an indicator of how the liver is handling that circulation.',
  },
  'direct-bilirubin': {
    whatItIs:
      'The portion of bilirubin that the liver has already processed and prepared for excretion in bile. It is reported alongside total bilirubin to show which part of the total it accounts for.',
  },
  globulin: {
    whatItIs:
      'All the blood proteins other than albumin taken together, including antibodies and carrier proteins. It is usually calculated by subtracting albumin from total protein rather than measured directly.',
  },
  gldh: {
    whatItIs:
      'Glutamate dehydrogenase, an enzyme concentrated inside liver cells, particularly in their mitochondria. It is measured as a liver enzyme that is more specific to the liver than several of the others.',
  },
  ldh: {
    whatItIs:
      'Lactate dehydrogenase, an enzyme present in almost every tissue and released whenever cells are damaged. Because it is so widespread, it indicates that cells somewhere have been damaged rather than where.',
  },

  // --- Pancreas ---
  lipase: {
    whatItIs:
      'An enzyme made by the pancreas that breaks down dietary fat in the small intestine. It is measured when the pancreas is being assessed.',
  },
  'pancreatic-amylase': {
    whatItIs:
      'The form of amylase, a starch-digesting enzyme, that comes specifically from the pancreas. Measuring this form separates it from the amylase produced by the salivary glands.',
  },

  // --- Thyroid ---
  calcitonin: {
    whatItIs:
      'A hormone made by particular cells in the thyroid gland, with a minor role in calcium handling. It is measured chiefly as a marker for one uncommon type of thyroid tumour.',
  },
  'thyroid-binding-globulin-tbg': {
    whatItIs:
      'The main protein that carries thyroid hormones through the bloodstream. It is measured when total and free thyroid hormone levels appear to disagree, since the amount of carrier protein affects the total.',
  },

  // --- Prostate ---
  'prostate-cancer-risk-score': {
    whatItIs:
      'A calculated score combining PSA measurements with other details to express prostate cancer risk. Scores of this kind describe likelihood across groups of people, and they are neither a diagnosis nor a substitute for specialist assessment.',
  },
  'total-psa': {
    whatItIs:
      'Prostate specific antigen, a protein made by the prostate gland and present in small amounts in blood. It is affected by prostate size, age, recent ejaculation, cycling and urinary infection as well as by prostate disease.',
  },

  // --- Tumour markers ---
  afp: {
    whatItIs:
      'Alpha-fetoprotein, produced in large amounts before birth and in small amounts in adults. It is used as a tumour marker for certain liver and germ cell tumours, and it also rises in pregnancy and in some non-cancerous liver conditions.',
  },
  'beta-hcg': {
    whatItIs:
      'The beta subunit of human chorionic gonadotrophin, the hormone produced by the placenta during pregnancy. Outside pregnancy it is used as a tumour marker for certain germ cell and placental tumours.',
  },
  'ca-15-3': {
    whatItIs:
      'Cancer antigen 15-3, a protein shed from the surface of some cells. It is used to follow the course of breast cancer that has already been diagnosed rather than to screen for it.',
  },
  'ca-19-9': {
    whatItIs:
      'Cancer antigen 19-9, a carbohydrate marker used mainly in pancreatic and biliary disease. It is used to follow known disease rather than to screen for it, and a small proportion of people do not produce it at all.',
  },
  'ca-125': {
    whatItIs:
      'Cancer antigen 125, a protein used chiefly in the assessment and follow-up of ovarian cancer. It also rises with menstruation, endometriosis, fibroids and other non-cancerous conditions, which is why it is not used for screening on its own.',
  },
  cea: {
    whatItIs:
      'Carcinoembryonic antigen, present in high amounts before birth and in small amounts in adults. It is used as a tumour marker chiefly to follow bowel cancer that has already been diagnosed, and it is also higher in people who smoke.',
  },
  nse: {
    whatItIs:
      'Neuron specific enolase, an enzyme found in nerve cells and in cells of the neuroendocrine system. It is used as a tumour marker for certain neuroendocrine and small cell tumours, and any breakdown of red blood cells in the sample affects the result.',
  },

  // --- Epstein-Barr virus. Reported as an index against the assay's cut-off. ---
  'epstein-barr-antibodies': {
    whatItIs:
      'A combined measure of antibodies against Epstein-Barr virus, the virus behind glandular fever. It is reported as an index against the assay’s own cut-off rather than as a concentration.',
  },
  'epstein-barr-nuclear-antigen-igg': {
    whatItIs:
      'IgG antibodies against the Epstein-Barr nuclear antigen, which usually appear some weeks to months after a first infection and then persist. It is read with the other Epstein-Barr antibodies to place an infection in time.',
  },
  'epstein-barr-viral-capsid-antigen-igg': {
    whatItIs:
      'IgG antibodies against the outer protein coat of Epstein-Barr virus. Once formed these generally persist for life, so they speak to past exposure rather than to current illness.',
  },
  'epstein-barr-viral-capsid-antigen-igm': {
    whatItIs:
      'IgM antibodies against the outer protein coat of Epstein-Barr virus. IgM is the first antibody class the body makes and usually fades within a few months, so it is used to judge how recent an exposure was.',
  },

  // --- Personal health measurements, recorded at the appointment ---
  'systolic-blood-pressure': {
    whatItIs:
      'The pressure in the arteries as the heart contracts and pushes blood out. It is the upper of the two numbers in a blood pressure reading and is taken with a cuff at your appointment.',
  },
  'diastolic-blood-pressure': {
    whatItIs:
      'The pressure in the arteries between heartbeats, while the heart is refilling. It is the lower of the two numbers in a blood pressure reading and is taken with a cuff at your appointment.',
  },
  pulse: {
    whatItIs:
      'The number of times the heart beats each minute, counted at your appointment. It shifts with activity, temperature, caffeine and how recently you have moved.',
  },
  'oxygen-saturation': {
    whatItIs:
      'The percentage of haemoglobin currently carrying oxygen, read through a clip on the finger. It is recorded at your appointment rather than measured from a blood sample.',
  },
  height: {
    whatItIs:
      'Your standing height, measured at your appointment. It is recorded so it can be used in calculations such as body mass index rather than as a measurement of blood.',
  },
  weight: {
    whatItIs:
      'Your body weight, measured at your appointment. It is recorded on its own and for use in calculations such as body mass index.',
  },
  'waist-circumference': {
    whatItIs:
      'The distance around your waist, taken with a tape at your appointment. It is recorded as an indicator of where body fat is carried, which weight alone cannot show.',
  },
  'hip-circumference': {
    whatItIs:
      'The distance around the hips at their widest point, taken with a tape at your appointment. It is recorded mainly so that it can be compared with waist circumference.',
  },
  'waist-hip-ratio': {
    whatItIs:
      'Waist circumference divided by hip circumference. It describes where body fat is distributed rather than how much of it there is.',
  },
  'body-composition-analyser': {
    whatItIs:
      'A reading taken at your appointment from a body composition device, which passes a small electrical current through the body to estimate the proportions of fat, muscle and water. Readings from these devices vary with hydration and with the time of day.',
  },

  // --- Urinalysis. A dipstick grade, read from a urine sample. ---
  'bilirubin-urine': {
    whatItIs:
      'A urine dipstick reading for bilirubin, the pigment formed when red blood cells are broken down. It is a screening reading on a colour scale rather than a measurement.',
  },
  'glucose-urine': {
    whatItIs:
      'A urine dipstick reading for glucose. The kidneys normally reabsorb glucose before urine is formed, so the strip is a coarse screen and not a measure of blood glucose.',
  },
  'ketones-urine': {
    whatItIs:
      'A urine dipstick reading for ketones, the compounds the body produces when it draws on fat rather than glucose for energy. They appear with fasting, low carbohydrate diets and illness as well as in diabetes.',
  },
  'ph-urine': {
    whatItIs:
      'The acidity of the urine, read from a dipstick on a scale of roughly 5 to 9. It shifts with diet, with fluid intake and with the time since the last meal.',
  },
  'protein-urine': {
    whatItIs:
      'A urine dipstick reading for protein. The strip responds mainly to albumin and is deliberately coarse, which is why small amounts are measured separately as an albumin to creatinine ratio.',
  },
  'red-blood-cells-urine': {
    whatItIs:
      'A urine dipstick reading for blood in the urine. The strip detects haemoglobin, so it responds to red blood cells too few to see and also to menstrual contamination of the sample.',
  },
  'urobilinogen-urine': {
    whatItIs:
      'A urine dipstick reading for urobilinogen, which is formed in the gut from bilirubin and partly reabsorbed. Small amounts are normally present in urine.',
  },
  'white-blood-cells-urine': {
    whatItIs:
      'A urine dipstick reading for leucocyte esterase, an enzyme released by white blood cells. It is read together with the nitrite square as a screen for urinary infection.',
  },
  'nitrite-urine': {
    whatItIs:
      'A urine dipstick reading for nitrite. Several urinary bacteria convert nitrate in urine into nitrite, so the square is an indirect screen for infection, and bacteria that do not make that conversion will not show on it.',
  },

  // --- UTI panel. Reported as detected or not detected, from a urine sample.
  //     Three of the nineteen describe antibiotic resistance genes, which are
  //     a property of bacteria in the sample and not a finding about a person.
  'acinetobacter-baumannii': {
    whatItIs:
      'Acinetobacter baumannii, a bacterium widespread in the environment and associated with infections acquired in hospital. The panel reports whether it was detected in the urine sample.',
  },
  'enterobacter-cloacae': {
    whatItIs:
      'Enterobacter cloacae, a bacterium that lives in the gut and is also found in urinary infection. The panel reports whether it was detected in the urine sample.',
  },
  'enterococcus-faecalis': {
    whatItIs:
      'Enterococcus faecalis, one of the commonest gut bacteria and a recognised cause of urinary infection. The panel reports whether it was detected in the urine sample.',
  },
  'enterococcus-faecium': {
    whatItIs:
      'Enterococcus faecium, a relative of Enterococcus faecalis that also lives in the gut. The panel reports whether it was detected in the urine sample.',
  },
  'escherichia-coli': {
    whatItIs:
      'Escherichia coli, a bacterium that normally lives in the gut and is by far the commonest cause of urinary tract infection. The panel reports whether it was detected in the urine sample.',
  },
  'klebsiella-aerogenes': {
    whatItIs:
      'Klebsiella aerogenes, a gut bacterium that is also found in urinary infection. The panel reports whether it was detected in the urine sample.',
  },
  'klebsiella-oxytoca': {
    whatItIs:
      'Klebsiella oxytoca, a bacterium of the same family as Klebsiella pneumoniae. The panel reports whether it was detected in the urine sample.',
  },
  'klebsiella-pneumoniae': {
    whatItIs:
      'Klebsiella pneumoniae, a bacterium that can live harmlessly in the gut and is also a recognised cause of urinary infection. The panel reports whether it was detected in the urine sample.',
  },
  'morganella-morganii': {
    whatItIs:
      'Morganella morganii, found in the gut and in the environment and an occasional cause of urinary infection. The panel reports whether it was detected in the urine sample.',
  },
  'proteus-spp': {
    whatItIs:
      'Proteus species, bacteria known for making urine more alkaline and for their association with urinary stones. The panel reports whether they were detected in the urine sample.',
  },
  'providencia-stuartii': {
    whatItIs:
      'Providencia stuartii, most often associated with urinary infection in people who have a long-term catheter. The panel reports whether it was detected in the urine sample.',
  },
  'pseudomonas-aeruginosa': {
    whatItIs:
      'Pseudomonas aeruginosa, a bacterium widespread in soil and water that can also cause urinary infection. The panel reports whether it was detected in the urine sample.',
  },
  'staphylococcus-aureus': {
    whatItIs:
      'Staphylococcus aureus, which commonly lives on skin and in the nose and can cause infection elsewhere in the body. The panel reports whether it was detected in the urine sample.',
  },
  'staphylococcus-epidermidis': {
    whatItIs:
      'Staphylococcus epidermidis, one of the usual inhabitants of human skin. It is a frequent contaminant of urine samples as well as an occasional cause of infection, and the panel reports whether it was detected.',
  },
  'staphylococcus-saprophyticus': {
    whatItIs:
      'Staphylococcus saprophyticus, recognised as a cause of urinary infection particularly in younger women. The panel reports whether it was detected in the urine sample.',
  },
  'streptococcus-agalactiae-gbs': {
    whatItIs:
      'Streptococcus agalactiae, also called group B streptococcus, which many adults carry without it causing them any trouble. The panel reports whether it was detected in the urine sample.',
  },
  'methicillin-resistance': {
    whatItIs:
      'A test for the genetic marker that makes staphylococci resistant to methicillin and the related antibiotics. It describes a property of bacteria in the sample rather than a measurement of the person.',
  },
  'trimethoprim-resistance': {
    whatItIs:
      'A test for genetic markers that make bacteria resistant to trimethoprim. It describes a property of bacteria in the sample rather than a measurement of the person.',
  },
  'vancomycin-resistance': {
    whatItIs:
      'A test for genetic markers that make enterococci resistant to vancomycin. It describes a property of bacteria in the sample rather than a measurement of the person.',
  },
};

// ---------------------------------------------------------------------------
// GENETIC — inherited variants. Not measurements, and never a statement that
// a condition is present, developing or coming. Where the evidence behind a
// commercial trait is thin, the copy says so; several of these are the sort of
// indicator sold widely and supported lightly, and a patient is owed that.
// ---------------------------------------------------------------------------

export const GENETIC_EXPLANATIONS: Record<string, ExplanationSeed> = {
  'genetic-coeliac-disease': {
    whatItIs:
      'Looks at the HLA-DQ2 and HLA-DQ8 tissue types, which are carried by almost everyone who develops coeliac disease. They are also common in people who never develop it, so this indicator is far more informative for what it can rule out than for what it can rule in.',
  },
  'genetic-lactose-intolerance': {
    whatItIs:
      'Looks at a variant near the lactase gene that governs whether the enzyme for digesting milk sugar keeps being produced into adult life. It describes an inherited tendency and does not measure how milk is being tolerated now.',
  },
  // "Lactose Intolerance", "Lactose Intolerance Risk" and "Coeliac Disease
  // Risk" are Randox's other names for the two entries above and resolve to
  // the same keys through markerCatalogue's KEY_OVERRIDES. One record, several
  // names, one explanation.
  'haemochromatosis-risk': {
    whatItIs:
      'Looks at the HFE gene variants, chiefly C282Y and H63D, associated with hereditary haemochromatosis, a condition in which too much iron is absorbed. Many people who carry these variants never accumulate excess iron, and it is iron studies in the blood that show whether any is accumulating.',
  },
  'type-1-diabetes-risk': {
    whatItIs:
      'Looks at HLA tissue types associated with type 1 diabetes. These types are common in the general population and the great majority of people who carry them never develop the condition.',
  },

  // --- Athletic performance. Commercially popular, thinly evidenced. ---
  'creatine-conversion': {
    whatItIs:
      'Relates to inherited variation in genes involved in creatine metabolism in muscle. The research behind indicators of this kind is limited, and it measures nothing about your muscles as they are today.',
  },
  'injury-risk': {
    whatItIs:
      'Relates to inherited variation in genes shaping tendons, ligaments and other connective tissue. The associations with injury reported in the research are small, and this is not an assessment of any tissue as it is now.',
  },
  'muscle-composition': {
    whatItIs:
      'Relates to variants such as those in the ACTN3 gene, associated with the proportions of fast and slow twitch muscle fibres. It describes an inherited tendency, and training has a far larger bearing on performance than any of these variants.',
  },
  'muscle-mass': {
    whatItIs:
      'Relates to inherited variation in genes associated with muscle bulk across populations. The contribution of any single variant is small, and this is not a measurement of how much muscle is present.',
  },
  'muscle-recovery': {
    whatItIs:
      'Relates to inherited variation in genes involved in inflammation and tissue repair after exercise. The evidence linking these variants to how anyone actually recovers is limited.',
  },

  // --- Diet and nutrition. These describe tendencies in handling a nutrient,
  //     never the amount of it in the body, which is a blood test. ---
  'bitter-taste-perception': {
    whatItIs:
      'Relates to variants in the TAS2R38 taste receptor gene, which affect how strongly certain bitter compounds are tasted. It is one of the better established links between a single gene and an everyday trait.',
  },
  'sweet-taste-perception': {
    whatItIs:
      'Relates to variants in the TAS1R sweet taste receptor genes, associated with how strongly sweetness is perceived. It describes an inherited trait rather than anything about what is eaten.',
  },
  'calcium-deficiency-risk': {
    whatItIs:
      'Relates to inherited variation in genes involved in calcium handling and vitamin D metabolism. It describes a tendency and is not a measurement of the calcium in your blood or bones.',
  },
  'fasting-response': {
    whatItIs:
      'Relates to inherited variation in genes involved in switching between glucose and fat as a fuel. Research in this area is at an early stage and no dietary conclusion follows from it.',
  },
  'folate-deficiency-risk': {
    whatItIs:
      'Relates to variants in MTHFR and related genes, which affect how folate is converted into the form the body uses. It describes an inherited tendency rather than measuring the folate in your blood.',
  },
  'gluten-intolerance': {
    whatItIs:
      'Relates to the HLA tissue types associated with coeliac disease. It is not a test for gluten sensitivity more broadly, and it cannot show whether gluten is behind any symptom.',
  },
  'magnesium-deficiency-risk': {
    whatItIs:
      'Relates to inherited variation in genes involved in absorbing and retaining magnesium. It describes a tendency and is not a measurement of the magnesium in your body.',
  },
  'omega-3-and-omega-6-benefit': {
    whatItIs:
      'Relates to variants in the FADS genes, which affect how efficiently plant omega 3 and omega 6 fats are converted into their longer chain forms. What this means in practice for diet is still being worked out.',
  },
  'saturated-fats-response': {
    whatItIs:
      'Relates to inherited variation, including in APOA2, associated with differences in how blood fats respond to saturated fat in the diet. Findings in this area have not been consistent between studies.',
  },
  'selenium-deficiency-risk': {
    whatItIs:
      'Relates to inherited variation in genes that transport selenium and build it into the body’s proteins. It describes a tendency rather than measuring selenium.',
  },
  'vitamin-a-deficiency-risk': {
    whatItIs:
      'Relates to variants in BCMO1 and related genes, which affect how efficiently plant carotenes are converted into vitamin A. It describes an inherited tendency rather than measuring vitamin A.',
  },
  'vitamin-b12-deficiency-risk': {
    whatItIs:
      'Relates to inherited variation in genes involved in transporting and processing vitamin B12, such as FUT2 and TCN2. It describes a tendency rather than measuring the vitamin B12 in your blood.',
  },
  'vitamin-c-deficiency-risk': {
    whatItIs:
      'Relates to variants in SLC23A1 and related vitamin C transporter genes. It describes an inherited tendency rather than measuring vitamin C.',
  },
  'vitamin-d-deficiency-risk': {
    whatItIs:
      'Relates to variants in genes such as GC and CYP2R1 that affect how vitamin D is carried and activated. It describes a tendency rather than measuring the vitamin D in your blood, which is a separate test.',
  },
  'zinc-deficiency-risk': {
    whatItIs:
      'Relates to inherited variation in the zinc transporter genes. It describes a tendency rather than measuring the zinc in your body.',
  },

  // --- Health and wellbeing ---
  'caffeine-metabolism': {
    whatItIs:
      'Relates to variants in CYP1A2 and ADORA2A, associated with how quickly caffeine is cleared and how strongly its effects are felt. It describes an inherited tendency and is not a limit of any kind.',
  },
  'familial-hypercholesterolaemia-risk': {
    whatItIs:
      'Relates to variants in genes such as LDLR, APOB and PCSK9 associated with familial hypercholesterolaemia, an inherited condition of cholesterol handling. A panel of this kind covers only some of the many known variants, so on its own it can neither confirm nor exclude the condition.',
  },
  'genetic-obesity-risk': {
    whatItIs:
      'Relates to variants such as those in FTO and MC4R, associated with differences in body weight across large populations. The contribution of any one variant is small and is readily outweighed by everything else that bears on weight.',
  },
  'genetic-type-ii-diabetes-risk': {
    whatItIs:
      'Relates to variants such as those in TCF7L2, associated with type 2 diabetes across large populations. It describes an inherited tendency and says nothing about whether the condition is present, which is what glucose and HbA1c are for.',
  },
  'high-cholesterol-and-cardiovascular-disease-risk': {
    whatItIs:
      'Relates to variants, including those in APOE, associated with differences in blood cholesterol and cardiovascular risk across populations. It is a separate thing from measuring cholesterol itself, which is what the lipid results do.',
  },
  'hypertension-risk': {
    whatItIs:
      'Relates to inherited variation in genes involved in regulating blood pressure, such as those of the renin angiotensin system. Each variant contributes very little, and a blood pressure reading measures directly what these can only suggest a tendency towards.',
  },
  'mental-health': {
    whatItIs:
      'Relates to inherited variation in genes involved in handling brain chemical messengers such as serotonin and dopamine. The links between single variants and mental health are weak and much disputed, and nothing here can indicate a condition.',
  },
  sleep: {
    whatItIs:
      'Relates to inherited variation in body clock genes such as CLOCK and PER. It describes a tendency towards a sleep pattern rather than measuring how anyone actually sleeps.',
  },
};

// ---------------------------------------------------------------------------
// COMPOSITION — gut microbiome. Every one of these is a share of the whole,
// not an amount, and the field has no agreed reference ranges. Saying so is
// not hedging; it is the most useful true thing available about the number.
// ---------------------------------------------------------------------------

export const COMPOSITION_EXPLANATIONS: Record<string, ExplanationSeed> = {
  'archaeal-composition': {
    whatItIs:
      'The share of your gut microbiome made up of archaea, single-celled organisms distinct from bacteria and known in the gut chiefly for producing methane. It is a proportion of the whole rather than a count, and how to read it is still an open question in the research.',
  },
  'bacteria-that-break-down-fibre': {
    whatItIs:
      'The share of your gut microbiome made up of bacteria that ferment dietary fibre. It is a proportion rather than a count, and there is no agreed range for what any particular proportion means.',
  },
  'bacteria-with-probiotic-properties': {
    whatItIs:
      'The share of your gut microbiome made up of groups such as Lactobacillus and Bifidobacterium, which are the ones commonly sold as probiotics. It is a proportion rather than a count, there is no established proportion these groups are expected to make up, and their effects appear to depend heavily on the particular strain.',
  },
  'butyric-acid-producing-bacteria': {
    whatItIs:
      'The share of your gut microbiome made up of bacteria that produce butyrate, a short chain fatty acid the cells lining the colon use as fuel. It is a proportion rather than a count, and no reference range has been established for it.',
  },
  'hydrogen-sulphide-producing-bacteria': {
    whatItIs:
      'The share of your gut microbiome made up of bacteria that produce hydrogen sulphide. It is a proportion rather than a count, and the research on what different proportions mean is unsettled.',
  },
  'microbiome-weight-gain-conditions': {
    whatItIs:
      'A composite reading built from the proportions of bacterial groups that some published studies have associated with body weight. Those associations have been inconsistent, and this is not a measurement of weight or of metabolism.',
  },
  'pathogenic-bacteria': {
    whatItIs:
      'The share of your gut microbiome made up of groups that include species capable of causing illness. Many of these live in the gut without causing any, so a proportion here is not the same thing as an infection and this is not a test for one.',
  },
  'presence-of-oxalate-degrading-bacteria': {
    whatItIs:
      'Whether bacteria able to break down oxalate, a compound found in many plant foods and in some kidney stones, appeared in your sample. It is reported as part of the microbiome’s make-up rather than as a measurement of activity.',
  },
  'the-firmicutes-bacteroidetes-f-b-ratio': {
    whatItIs:
      'The ratio between two of the largest groups of gut bacteria. It was once widely reported as a summary of gut health, and later work has not supported that use, so it is best read as a description of composition and nothing more.',
  },
  bacteriophages: {
    whatItIs:
      'The share of your gut microbiome made up of bacteriophages, which are viruses that infect bacteria rather than human cells. This is the least well understood part of the microbiome and there is no established interpretation of the figure.',
  },
};

// ---------------------------------------------------------------------------
// SENSITIVITY — the 207 food IgG items.
//
// ONE explanation for the whole panel, with only the food name varying.
//
// This is a deliberate editorial decision, not a shortcut. Every item on the
// panel is the same assay asked about a different food, and the science is
// identical across all 207: IgG to a food records exposure to it. Writing 207
// individually worded explanations would say, by its very existence, that each
// food carries a meaning of its own that is worth reading about separately.
// It does not, and 207 chances to imply otherwise is 207 chances to do harm.
//
// BSACI, EAACI and AAAAI all advise against using IgG food panels to direct
// what anyone eats. The copy says so on every item, because a patient reading
// one food's card is entitled to that on the card they are reading rather than
// only in the section heading above it.
// ---------------------------------------------------------------------------

/**
 * The panel-wide food sensitivity explanation, with the food named so the
 * card reads as though it were written for that food. `food` is the marker
 * name with the catalogue's disambiguating "(IgG)" suffix removed.
 */
export function foodSensitivityExplanation(food: string): ExplanationSeed {
  return {
    whatItIs:
      `Measures IgG antibodies to ${food} in the blood. Producing IgG to a food records exposure to it rather than a problem with it, and it is routinely found in people who eat that food regularly and digest it perfectly well. ` +
      `The allergy and immunology bodies BSACI, EAACI and AAAAI all advise against using IgG food panels to decide what to eat, so a result here is not a reason to avoid ${food}.`,
  };
}

/** Strips the catalogue's disambiguating suffix: "Cod (IgG)" becomes "Cod". */
export function foodNameFromMarkerName(markerName: string): string {
  return markerName.replace(/\s*\(IgG\)$/i, '');
}

/**
 * Copy for one marker, or null if this file has nothing to say about it.
 *
 * Null is a real answer and the seed reports it rather than papering over it:
 * a marker with no honest explanation gets no explanation row, which is a gap
 * somebody can see and fill, not a placeholder sentence a patient has to read.
 */
export function explanationFor(
  marker: { key: string; name: string; resultType: string },
): ExplanationSeed | null {
  if (marker.resultType === 'SENSITIVITY') {
    return foodSensitivityExplanation(foodNameFromMarkerName(marker.name));
  }
  const byType: Record<string, Record<string, ExplanationSeed>> = {
    MEASURED: MEASURED_EXPLANATIONS,
    GENETIC: GENETIC_EXPLANATIONS,
    COMPOSITION: COMPOSITION_EXPLANATIONS,
  };
  return byType[marker.resultType]?.[marker.key] ?? null;
}

/** Every non-food key this file covers. Used by the tests and the seed report. */
export const AUTHORED_KEYS_BY_TYPE = {
  MEASURED: Object.keys(MEASURED_EXPLANATIONS),
  GENETIC: Object.keys(GENETIC_EXPLANATIONS),
  COMPOSITION: Object.keys(COMPOSITION_EXPLANATIONS),
} as const;
