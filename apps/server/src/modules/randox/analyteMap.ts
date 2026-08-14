import { resolveCatalogueMarkers } from '@aspire-bloods/shared';

/**
 * ---------------------------------------------------------------------------
 * RANDOX ANALYTE STRING → OUR MARKER KEY.
 * ---------------------------------------------------------------------------
 *
 * THE PROBLEM THIS SOLVES. Every row in GetOrderResultDetail's `reportResults`
 * looks like this:
 *
 *   orderNumber, dateOfReceipt, dateOfReport, analyte, group, result,
 *   units, refLow, refHigh, lowHigh, sampleType, caveat, displayName
 *
 * There is no marker id on it and no marker code. The only identity a result
 * carries is the `analyte` string, with `group` and `displayName` beside it.
 * Our catalogue is keyed by code. Something has to bridge that, and this file
 * is the whole of the bridge.
 *
 * IT IS DATA, NOT LOGIC, AND IT IS DELIBERATELY DULL. Two passes and no more:
 *
 *   1. EXACT.       The string as Randox sent it, against the names and
 *                   aliases as our catalogue holds them.
 *   2. NORMALISED.  The same comparison with case, whitespace and punctuation
 *                   removed. "Vitamin D (25-OH)" and "vitamin d 25 oh" are one
 *                   spelling of one thing.
 *
 * AND NOTHING BEYOND THAT. No fuzzy matching, no similarity scoring, no
 * substring fallback, no token overlap, no "closest candidate". The shared
 * matcher in modules/reports/matchMarker.ts has all of those and is right to:
 * it feeds a table an admin reads and corrects before anything is saved. This
 * path has no admin in it. A wrong answer here files a real measurement under
 * the wrong analyte on a real patient's record, unwatched — and "Magnesium"
 * against "RBC Magnesium", "Testosterone" against "Free Testosterone" and
 * "Bilirubin" against "Direct Bilirubin" are each two genuinely different
 * tests that any substring rule would happily conflate.
 *
 * AN UNMAPPED ANALYTE DOES NOT VANISH AND IS NOT INVENTED INTO A MARKER. It
 * goes to the exception queue carrying the raw analyte string, the group and
 * the display name, so a human can add one line to ANALYTE_OVERRIDES below.
 *
 * SAMPLE TYPE IS PART OF THE IDENTITY. Randox print the nine urinalysis
 * analytes bare — "Glucose", "Protein", "Bilirubin" — and those are the same
 * strings as three serum markers. They are not the same test, and a patient's
 * glucose trend must never quietly acquire a dipstick reading. So where a name
 * is claimed by both, `sampleType` decides, and a row with an ambiguous name
 * and no sample type is refused rather than guessed at.
 */

export type AnalyteMatchVia = 'override' | 'learned' | 'sample-type' | 'exact' | 'normalised';

/**
 * Mappings a human has accepted from the exception queue, keyed by
 * `analyteIdentity()`.
 *
 * PASSED IN, NEVER CACHED. This is the one part of the map that lives in the
 * database rather than in this file, and a stale copy of it in a module-level
 * variable would file a result against whatever an admin USED to think the
 * analyte was. The ingestion path already queries per delivery
 * (`normaliseResultDetail`), so it reads these in the same breath and hands
 * them over; every other caller passes nothing and gets the code-only map,
 * which is what a test wants.
 */
export type LearnedAnalyteMappings = ReadonlyMap<string, string>;

/**
 * THE IDENTITY OF AN ANALYTE STRING: its normalised form plus its sample type.
 *
 * Both halves, always, because Randox print the nine urinalysis pads bare —
 * "Glucose", "Protein", "Bilirubin" — and those are the same strings as three
 * serum markers. A learned mapping keyed on the name alone would file a urine
 * dipstick glucose against a fasting plasma glucose the first time somebody
 * accepted the wrong one, and would do it silently ever after.
 *
 * A row with no sample type gets the literal `-` rather than an empty segment,
 * so "Glucose" with no sample type and "Glucose" with sample type "" are one
 * identity rather than two.
 */
export function analyteIdentity(analyte: string, sampleType?: string | null): string {
  return `${normaliseAnalyte(analyte)}::${(sampleType ?? '').trim().toLowerCase() || '-'}`;
}

export type AnalyteResolution =
  | { status: 'MAPPED'; markerKey: string; via: AnalyteMatchVia; matchedOn: string }
  | { status: 'UNMAPPED'; reason: string }
  | { status: 'AMBIGUOUS'; candidates: string[]; reason: string };

export interface AnalyteRowIdentity {
  analyte: string | null;
  displayName?: string | null;
  group?: string | null;
  sampleType?: string | null;
}

/**
 * Case, whitespace and punctuation removed. Nothing else — no stemming, no
 * plural stripping, no accent-aware token games. Two strings that differ by
 * more than typography are two strings.
 */
export function normaliseAnalyte(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * ---------------------------------------------------------------------------
 * WHERE AN OVERRIDE CAME FROM. Every entry carries one.
 * ---------------------------------------------------------------------------
 *
 * A mapping is a clinical decision — it files a measurement against an analyte
 * on somebody's record — so "who says so" travels with it rather than living in
 * a comment above the block. `kind` is the part that matters and it is the
 * distinction this file has always turned on:
 *
 *   RANDOX_REPORT   read off a document Randox produced. Evidence.
 *   CATALOGUE_NOTE  our own catalogue records that we corrected Randox's
 *                   spelling here, so this is that correction put back. Evidence
 *                   about US, which is weaker, and is why these were the only
 *                   entries for as long as there was nothing else.
 *
 * There is no third kind and there is not going to be one called GUESS.
 */
export type AnalyteSourceKind = 'RANDOX_REPORT' | 'CATALOGUE_NOTE';

export interface AnalyteSource {
  kind: AnalyteSourceKind;
  /** The document, as it is named in specs/. */
  document: string;
  /** The page it is printed on, where the source is paginated. */
  page?: number;
}

export interface AnalyteOverrideEntry {
  markerKey: string;
  source: AnalyteSource;
}

const HSC5 = 'HSC5-Randox-Basic-Screen-Example-Report.pdf';
const CATALOGUE = 'packages/shared/markerCatalogue.ts — "Randox’s spelling slips are corrected here"';

/**
 * EXPLICIT OVERRIDES: where Randox's string is not one our catalogue holds.
 *
 * ── THE PDF IS READABLE AFTER ALL (Aug 2026) ──────────────────────────────
 *
 * This note used to say the sample report "uses subset fonts with a custom
 * encoding and its analyte column cannot be extracted mechanically", and that
 * every entry here therefore had to come from our own catalogue's notes. The
 * first half was a misdiagnosis and the second half was a real cost: the one
 * document in the tree carrying Randox's own spellings for 34 analytes was
 * being treated as unreadable.
 *
 * What was actually happening: every font in that PDF is `/Encoding
 * /Identity-H`, which means TWO-BYTE CIDs. Read one byte at a time the text
 * comes out as a substitution cipher offset by the subset's first glyph —
 * "Haemoglobin" reads as "+DePoJloELn" — which looks exactly like a custom
 * encoding nobody can undo. Decoded two bytes at a time through the font's own
 * ToUnicode CMap it is ordinary text. The ONE trap left is that the document
 * carries several subsets whose CMaps cover different code ranges; picking the
 * wrong one per font resolves some glyphs and not others, which is what makes
 * the failure look partial rather than total.
 *
 * WHAT DID NOT CHANGE. Nothing here is a plausible-looking Randox spelling,
 * then or now. Inventing one would still be worse than an empty list, because
 * the exception queue catches an ABSENT mapping and nothing catches a wrong
 * one. Every entry below is a string somebody can go and look at, in a file in
 * this repository, on a numbered page.
 *
 * AND THE REPORT IS EVIDENCE ABOUT THE REPORT. It is a rendered PDF, not a
 * GetOrderResultDetail payload, so what it proves is how Randox NAME these
 * tests — not which JSON field carries that name. That distinction is why
 * `confirmedAgainstRealPayload` below stays at zero and a separate figure
 * counts these. It is also why an override keyed on the printed string is safe
 * either way: `resolveAnalyte` tries the override table against `analyte` AND
 * `displayName`, so it hits whichever of the two the string turns out to be.
 */
export const ANALYTE_OVERRIDES_SOURCED: Record<string, AnalyteOverrideEntry> = {
  // ── From the catalogue's own record of corrections we made ───────────────
  // Randox's spelling → our marker key. Each of these is the catalogue's own
  // name with the documented substitution put BACK, which is what Randox
  // actually print. Keys verified against resolveCatalogueMarkers().
  //
  // "Bayleaf" is deliberately absent: it normalises to the same string as
  // "Bay Leaf", so pass 2 already resolves it and an override would be a line
  // of noise implying a problem that does not exist.
  'Pepsingogen 1': { markerKey: 'pepsinogen-1', source: { kind: 'CATALOGUE_NOTE', document: CATALOGUE } },
  'Pepsingogen 2': { markerKey: 'pepsinogen-2', source: { kind: 'CATALOGUE_NOTE', document: CATALOGUE } },
  'Cancer Atigen 125 (CA 125)': { markerKey: 'ca-125', source: { kind: 'CATALOGUE_NOTE', document: CATALOGUE } },
  'Glutamine Dehydrogenase (GLDH)': { markerKey: 'gldh', source: { kind: 'CATALOGUE_NOTE', document: CATALOGUE } },
  'Neutrophil Gelatinase Associatd Lipocalin (NGAL)': { markerKey: 'ngal', source: { kind: 'CATALOGUE_NOTE', document: CATALOGUE } },
  'Muscle Recover': { markerKey: 'muscle-recovery', source: { kind: 'CATALOGUE_NOTE', document: CATALOGUE } },
  'Patridge (IgG)': { markerKey: 'partridge-igg', source: { kind: 'CATALOGUE_NOTE', document: CATALOGUE } },
  'Melon (Galla/Honeydew) (IgG)': { markerKey: 'melon-galia-honeydew-igg', source: { kind: 'CATALOGUE_NOTE', document: CATALOGUE } },
  'Archael Composition': { markerKey: 'archaeal-composition', source: { kind: 'CATALOGUE_NOTE', document: CATALOGUE } },

  // ── From the HSC5 report, "Results for your Doctor", pages 14–15 ─────────
  //
  // ONLY THE TWO THAT DO NOT ALREADY RESOLVE. The other 32 strings on that
  // table match the catalogue through the ordinary exact or normalised pass,
  // and an override for each of them would be 32 lines that change nothing and
  // then have to be maintained. They are recorded in HSC5_ANALYTE_STRINGS
  // below, which is where the coverage figure and the audit read them from —
  // a mapping that already works is a fact worth pinning and not a line worth
  // adding here.
  //
  // Both of these would have gone to the exception queue on the first real
  // delivery, which is exactly what this exercise was for.

  // We hold "Red Blood Cell Mean Volume (MCV)". Randox print "Mean CELL
  // Volume" — one word, and it is the difference between a match and a held
  // report. Our aliases carry "MCV", "Mean Cell Volume" and "Red Blood Cell
  // Mean Volume"; none of them is this string.
  'Red Blood Cell Mean Cell Volume (MCV)': { markerKey: 'mcv', source: { kind: 'RANDOX_REPORT', document: HSC5, page: 14 } },

  // We hold "eGFR", with "Estimated Glomerular Filtration Rate" as an alias.
  // Randox print the full name AND the abbreviation together, which is neither.
  'Estimated Glomerular Filtration Rate (eGFR)': { markerKey: 'egfr', source: { kind: 'RANDOX_REPORT', document: HSC5, page: 15 } },
};

/**
 * The flat form the resolver reads. Derived, so an entry cannot exist without a
 * source — the only way into this map is through the one above.
 */
export const ANALYTE_OVERRIDES: Record<string, string> = Object.fromEntries(
  Object.entries(ANALYTE_OVERRIDES_SOURCED).map(([spelling, entry]) => [spelling, entry.markerKey]),
);

/**
 * ---------------------------------------------------------------------------
 * EVERY ANALYTE STRING RANDOX PRINT ON THE HSC5 BASIC SCREEN REPORT.
 * ---------------------------------------------------------------------------
 *
 * Transcribed from the "Results for your Doctor" table — pages 14 and 15 of
 * specs/HSC5-Randox-Basic-Screen-Example-Report.pdf — which is the one place in
 * this repository where Randox name a set of analytes in their own words. 34
 * strings, in the report's own order, with the page each is printed on.
 *
 * Two of them wrap across two lines in that table and are recorded here
 * REASSEMBLED, which is the only judgement in the list and is checkable: the
 * per-panel pages set the same names on one line each ("Red Blood Cell Mean
 * Cell Volume (MCV)" on page 7, "Total Cholesterol / HDL Cholesterol Ratio" on
 * page 6), and they agree.
 *
 * WHAT THIS IS FOR, AND IT IS NOT A SECOND OVERRIDE TABLE. Nothing resolves
 * through it. It is the CHECK LIST: `analyteMappingCoverage()` counts how many
 * of these the map answers to and `analyteObservations.test.ts` fails if one
 * stops resolving, so a catalogue rename that breaks a Randox spelling is
 * caught by a test rather than by a held report. Where one of them does not
 * resolve, the fix is a line in ANALYTE_OVERRIDES_SOURCED above — which is how
 * both of the entries there got written.
 */
export interface Hsc5AnalyteString {
  /** Exactly as printed. */
  analyte: string;
  page: 14 | 15;
  /** The panel heading it is printed under, as Randox group it. */
  group: string;
}

export const HSC5_ANALYTE_STRINGS: readonly Hsc5AnalyteString[] = [
  { analyte: 'Haemoglobin', page: 14, group: 'Full Blood Count' },
  { analyte: 'Haematocrit', page: 14, group: 'Full Blood Count' },
  { analyte: 'Mean Cell Haemoglobin (MCH)', page: 14, group: 'Full Blood Count' },
  { analyte: 'Mean Cell Haemoglobin Concentration (MCHC)', page: 14, group: 'Full Blood Count' },
  { analyte: 'Red Blood Cell Mean Cell Volume (MCV)', page: 14, group: 'Full Blood Count' },
  { analyte: 'Red Blood Cell Count', page: 14, group: 'Full Blood Count' },
  { analyte: 'Basophil Count', page: 14, group: 'Full Blood Count' },
  { analyte: 'Eosinophil Count', page: 14, group: 'Full Blood Count' },
  { analyte: 'Lymphocyte Count', page: 14, group: 'Full Blood Count' },
  { analyte: 'Monocyte Count', page: 14, group: 'Full Blood Count' },
  { analyte: 'Neutrophil Count', page: 14, group: 'Full Blood Count' },
  { analyte: 'White Blood Cell Count', page: 14, group: 'Full Blood Count' },
  { analyte: 'Platelet Count', page: 14, group: 'Full Blood Count' },
  { analyte: 'Total Cholesterol', page: 14, group: 'Heart Health' },
  { analyte: 'LDL Cholesterol', page: 14, group: 'Heart Health' },
  { analyte: 'HDL Cholesterol', page: 14, group: 'Heart Health' },
  { analyte: 'Total Cholesterol / HDL Cholesterol Ratio', page: 14, group: 'Heart Health' },
  { analyte: 'Triglycerides', page: 14, group: 'Heart Health' },
  { analyte: 'High Sensitivity C-Reactive Protein (hsCRP)', page: 14, group: 'Heart Health' },
  { analyte: 'Glucose', page: 14, group: 'Diabetes Health' },
  { analyte: 'Creatinine', page: 15, group: 'Kidney Health' },
  { analyte: 'Estimated Glomerular Filtration Rate (eGFR)', page: 15, group: 'Kidney Health' },
  { analyte: 'Chloride', page: 15, group: 'Kidney Health' },
  { analyte: 'Phosphate', page: 15, group: 'Kidney Health' },
  { analyte: 'Potassium', page: 15, group: 'Kidney Health' },
  { analyte: 'Sodium', page: 15, group: 'Kidney Health' },
  { analyte: 'Urea', page: 15, group: 'Kidney Health' },
  { analyte: 'Alanine Aminotransferase (ALT)', page: 15, group: 'Liver Health' },
  { analyte: 'Alkaline Phosphatase (ALP)', page: 15, group: 'Liver Health' },
  { analyte: 'Aspartate Aminotransferase (AST)', page: 15, group: 'Liver Health' },
  { analyte: 'Gamma-Glutamyltransferase (GGT)', page: 15, group: 'Liver Health' },
  { analyte: 'Total Bilirubin', page: 15, group: 'Liver Health' },
  { analyte: 'Albumin', page: 15, group: 'Liver Health' },
  { analyte: 'CRP', page: 15, group: 'Other' },
] as const;

/**
 * The urinalysis analytes, which Randox print bare and our catalogue holds
 * qualified "(urine)".
 *
 * Keyed by normalised analyte and only ever consulted when `sampleType` says
 * urine. Both halves matter: without this a urine glucose files itself as a
 * fasting plasma glucose, and without the sample-type gate a serum glucose
 * files itself as a dipstick reading.
 */
export const URINE_ANALYTE_KEYS: Record<string, string> = {
  glucose: 'glucose-urine',
  protein: 'protein-urine',
  bilirubin: 'bilirubin-urine',
  ketones: 'ketones-urine',
  urobilinogen: 'urobilinogen-urine',
  nitrite: 'nitrite-urine',
  ph: 'ph-urine',
  // The catalogue holds these two as cell counts rather than as the dipstick
  // pads Randox name them after; "Blood" and "Leukocytes" are the strings a
  // dipstick prints for exactly those.
  blood: 'red-blood-cells-urine',
  redbloodcells: 'red-blood-cells-urine',
  leukocytes: 'white-blood-cells-urine',
  leucocytes: 'white-blood-cells-urine',
  whitebloodcells: 'white-blood-cells-urine',
  // Specific gravity is a tenth urinalysis pad that our catalogue does not
  // carry. It is left out rather than pointed at a made-up key, so it arrives
  // in the exception queue and somebody decides whether to add the marker.
};

/** Whether a Randox `sampleType` string is describing urine. */
export function isUrineSample(sampleType: string | null | undefined): boolean {
  return typeof sampleType === 'string' && /urine/i.test(sampleType);
}

interface AnalyteIndex {
  /** Exact string → keys. More than one key means the string is ambiguous. */
  exact: Map<string, Set<string>>;
  /** Normalised string → keys. */
  normalised: Map<string, Set<string>>;
  /** Every key the catalogue holds, for validating the override table. */
  keys: Set<string>;
}

let cached: AnalyteIndex | null = null;

/**
 * The index, built once from the catalogue.
 *
 * A name or alias claimed by two different markers is recorded as claimed by
 * two different markers and is never resolved automatically — the set is kept
 * rather than last-write-wins, because silently preferring whichever the
 * catalogue happened to list second is exactly the class of bug this file
 * exists to remove.
 */
function index(): AnalyteIndex {
  if (cached) return cached;
  const exact = new Map<string, Set<string>>();
  const normalisedMap = new Map<string, Set<string>>();
  const keys = new Set<string>();

  const put = (map: Map<string, Set<string>>, term: string, key: string) => {
    if (!term.trim()) return;
    const bucket = map.get(term) ?? new Set<string>();
    bucket.add(key);
    map.set(term, bucket);
  };

  for (const marker of resolveCatalogueMarkers()) {
    keys.add(marker.key);
    for (const term of [marker.name, ...marker.aliases]) {
      put(exact, term, marker.key);
      put(normalisedMap, normaliseAnalyte(term), marker.key);
    }
    // The key itself, so a Randox string that happens to be our code resolves.
    put(normalisedMap, normaliseAnalyte(marker.key), marker.key);
  }

  cached = { exact, normalised: normalisedMap, keys };
  return cached;
}

/** Tests only — the catalogue is static, so the index is built once per process. */
export function __resetAnalyteIndexForTest(): void {
  cached = null;
}

/**
 * Resolve one result row to a marker key.
 *
 * `analyte` is the identity; `displayName` is tried only as a second string
 * for the same two passes, because Randox's patient-facing name is sometimes
 * the one our catalogue holds. `group` is never used to resolve — it is
 * Randox's health area, it is recorded on the row, and using it to
 * disambiguate would be inference dressed as a lookup.
 */
export function resolveAnalyte(row: AnalyteRowIdentity, learned?: LearnedAnalyteMappings): AnalyteResolution {
  const analyte = row.analyte?.trim() ?? '';
  const displayName = row.displayName?.trim() ?? '';
  if (!analyte && !displayName) {
    return { status: 'UNMAPPED', reason: 'The result row carries no analyte and no display name, so there is nothing to identify it by.' };
  }

  const { exact, normalised, keys } = index();

  // 1. An explicit override, on either string, exactly as written. Highest
  //    precedence because it is a human's decision about this exact spelling.
  for (const candidate of [analyte, displayName]) {
    if (!candidate) continue;
    const overridden = ANALYTE_OVERRIDES[candidate];
    if (overridden) {
      if (!keys.has(overridden)) {
        return {
          status: 'UNMAPPED',
          reason: `ANALYTE_OVERRIDES maps "${candidate}" to "${overridden}", which is not a marker key in the catalogue. Fix the override rather than guessing at the analyte.`,
        };
      }
      return { status: 'MAPPED', markerKey: overridden, via: 'override', matchedOn: candidate };
    }
  }

  // 1b. A mapping a human accepted from the exception queue. Same precedence
  //     reasoning as the overrides above and immediately after them: both are
  //     a person's decision about this exact spelling, and a person's decision
  //     outranks a lookup. The code table wins over the learned one where they
  //     disagree, because the code table is sourced from Randox's own
  //     documented spellings and is reviewable in a diff.
  if (learned && learned.size > 0) {
    for (const candidate of [analyte, displayName]) {
      if (!candidate) continue;
      const key = learned.get(analyteIdentity(candidate, row.sampleType));
      if (!key) continue;
      if (!keys.has(key)) {
        // The catalogue moved under an accepted mapping — a marker renamed or
        // retired since somebody accepted it. Refused rather than guessed at,
        // and it lands back in the queue with this sentence on it.
        return {
          status: 'UNMAPPED',
          reason: `An accepted mapping sends "${candidate}" to marker "${key}", which is no longer in the catalogue. Accept it again against a current marker.`,
        };
      }
      return { status: 'MAPPED', markerKey: key, via: 'learned', matchedOn: candidate };
    }
  }

  // 2. Urine. Consulted BEFORE the general index, because the whole point is
  //    that these strings also resolve — wrongly — against serum markers.
  if (isUrineSample(row.sampleType)) {
    for (const candidate of [analyte, displayName]) {
      if (!candidate) continue;
      const urineKey = URINE_ANALYTE_KEYS[normaliseAnalyte(candidate)];
      if (urineKey && keys.has(urineKey)) {
        return { status: 'MAPPED', markerKey: urineKey, via: 'sample-type', matchedOn: candidate };
      }
    }
  }

  // 3. Exact, then 4. normalised. Both refuse an ambiguous term rather than
  //    picking from it.
  for (const [map, via] of [
    [exact, 'exact'],
    [normalised, 'normalised'],
  ] as const) {
    for (const candidate of [analyte, displayName]) {
      if (!candidate) continue;
      const term = via === 'exact' ? candidate : normaliseAnalyte(candidate);
      const hits = map.get(term);
      if (!hits || hits.size === 0) continue;
      if (hits.size > 1) {
        const candidates = [...hits].sort();
        // A urinalysis name with no sample type on the row lands here, and
        // that is the correct outcome: the row genuinely does not say which
        // test it is.
        return {
          status: 'AMBIGUOUS',
          candidates,
          reason:
            `"${candidate}" identifies ${candidates.length} different markers in the catalogue (${candidates.join(', ')})` +
            (row.sampleType ? ` and sampleType "${row.sampleType}" does not separate them.` : ' and the row carries no sampleType to separate them.'),
        };
      }
      return { status: 'MAPPED', markerKey: [...hits][0], via, matchedOn: candidate };
    }
  }

  return {
    status: 'UNMAPPED',
    reason:
      `No marker in the catalogue is named "${analyte || displayName}"` +
      (row.group ? ` (Randox group "${row.group}")` : '') +
      '. Add it to ANALYTE_OVERRIDES in modules/randox/analyteMap.ts, or add the name as an alias on the marker.',
  };
}

/**
 * How much of the catalogue an incoming Randox result could actually be filed
 * against, and how much of it could not.
 *
 * Reported rather than assumed, and deliberately conservative: a marker counts
 * as mapped only if its own name resolves back to its own key through the two
 * passes above. A name shared with another marker counts as AMBIGUOUS and not
 * as mapped, because at ingestion time it would be refused.
 *
 * The number this produces is the number. It is not padded by counting
 * substring hits or by assuming Randox will send our exact spelling for
 * anything we have not seen them send.
 */
export function analyteMappingCoverage(): {
  total: number;
  /**
   * The CLINICAL population — MEASURED plus QUALITATIVE.
   *
   * It was MEASURED alone, and that stopped being right the day twenty-two
   * entries were reclassified out of MEASURED into QUALITATIVE: the nineteen
   * UTI organisms, the resting ECG, the body composition analyser and the
   * prostate cancer risk score. Every one of those still arrives in a Randox
   * payload and still has to be filed against a marker — what changed is how
   * they RENDER, not whether they need mapping. Leaving them out would have
   * quietly dropped this denominator by 22 and made the map look better for a
   * reason that has nothing to do with the map.
   */
  measured: number;
  /** Resolves from its own catalogue name. Self-consistency, NOT confirmation. */
  resolvesFromOwnName: number;
  /** Has at least one alternative spelling, so it survives Randox printing it differently. */
  withAlternativeSpelling: number;
  /** Resolvable on exactly ONE string. These are where a spelling difference costs a result. */
  singleSpellingOnly: { key: string; name: string }[];
  /** The same question asked of the WHOLE catalogue, per result type. */
  byResultType: Record<string, { total: number; singleSpelling: number }>;
  /** Markers reachable through an explicit, sourced override of Randox's own spelling. */
  overrides: number;
  /**
   * Markers whose mapping has been checked against a real Randox result
   * payload. Zero, and it stays zero until one arrives.
   */
  confirmedAgainstRealPayload: number;
  /**
   * Markers whose mapping is confirmed against a RANDOX-AUTHORED DOCUMENT —
   * today, the 34 analyte strings printed on the HSC5 Basic Screen example
   * report.
   *
   * A SECOND FIGURE RATHER THAN A BIGGER FIRST ONE, and the distinction is the
   * point. A rendered PDF proves how Randox NAME a test. A payload proves which
   * JSON field carries that name and how it is spelled there. The second is
   * what the ingestion path actually reads, so merging the two would let a
   * screen say "34 confirmed" about a question nothing has answered.
   *
   * `resolvable` is the number of those 34 the map answers to today — it should
   * be all of them, and `unresolved` names any that are not, which is a live
   * defect rather than a statistic.
   */
  confirmedAgainstSourcedDocument: { total: number; resolvable: number; unresolved: string[] };
  ambiguous: { key: string; name: string; candidates: string[] }[];
  unmapped: { key: string; name: string }[];
} {
  const markers = resolveCatalogueMarkers();
  // Everything a clinician acts on, plus everything that carries a finding.
  // See the note on `measured` above for why QUALITATIVE is in here.
  const clinical = markers.filter((m) => {
    const t = m.resultType ?? 'MEASURED';
    return t === 'MEASURED' || t === 'QUALITATIVE';
  });
  const ambiguous: { key: string; name: string; candidates: string[] }[] = [];
  const unmapped: { key: string; name: string }[] = [];
  const singleSpellingOnly: { key: string; name: string }[] = [];
  const overrideTargets = new Set(Object.values(ANALYTE_OVERRIDES));
  const byResultType: Record<string, { total: number; singleSpelling: number }> = {};
  let resolvesFromOwnName = 0;
  let withAlternativeSpelling = 0;

  /** Distinct spellings this marker answers to, deduplicated after normalisation. */
  const spellingsFor = (marker: (typeof markers)[number]) => {
    const spellings = new Set([marker.name, ...marker.aliases].map(normaliseAnalyte));
    for (const [randoxName, key] of Object.entries(ANALYTE_OVERRIDES)) {
      if (key === marker.key) spellings.add(normaliseAnalyte(randoxName));
    }
    return spellings;
  };

  // The whole catalogue, per type. The food-sensitivity and DNA sections are
  // not exempt from this question just because they render in their own
  // sections: a result Randox send for one of them still has to be filed, and
  // 207 food items that each answer to exactly one spelling is a fact worth
  // having in front of somebody rather than one hidden by a filter.
  for (const marker of markers) {
    const type = marker.resultType ?? 'MEASURED';
    const bucket = (byResultType[type] ??= { total: 0, singleSpelling: 0 });
    bucket.total += 1;
    if (spellingsFor(marker).size <= 1) bucket.singleSpelling += 1;
  }

  for (const marker of clinical) {
    const resolution = resolveAnalyte({ analyte: marker.name });
    if (resolution.status === 'MAPPED' && resolution.markerKey === marker.key) resolvesFromOwnName += 1;
    else if (resolution.status === 'AMBIGUOUS') ambiguous.push({ key: marker.key, name: marker.name, candidates: resolution.candidates });
    else unmapped.push({ key: marker.key, name: marker.name });

    if (spellingsFor(marker).size > 1) withAlternativeSpelling += 1;
    else singleSpellingOnly.push({ key: marker.key, name: marker.name });
  }

  return {
    total: markers.length,
    measured: clinical.length,
    resolvesFromOwnName,
    withAlternativeSpelling,
    singleSpellingOnly,
    byResultType,
    overrides: overrideTargets.size,
    // Deliberately hardcoded, and deliberately zero. Nothing IN THIS FILE has
    // met a real Randox payload, and a coverage figure that implied otherwise
    // would be the padding this function's own comment forbids.
    //
    // It does NOT become a computed number here when the first result lands.
    // What a delivery has actually confirmed is counted from
    // `RandoxAnalyteObservation` by `mappingConfidence()` in
    // analyteObservations.ts, from recorded sightings, and the two are
    // reported side by side rather than merged. This one answers "what does
    // the code claim on its own evidence", and that answer is nothing.
    confirmedAgainstRealPayload: 0,
    // Counted, not asserted: each of the 34 printed strings is put back through
    // the resolver. A catalogue rename that breaks one shows up here as a name
    // in `unresolved` rather than as a held report six weeks later.
    confirmedAgainstSourcedDocument: (() => {
      const unresolved: string[] = [];
      for (const { analyte } of HSC5_ANALYTE_STRINGS) {
        const r = resolveAnalyte({ analyte });
        if (r.status !== 'MAPPED') unresolved.push(analyte);
      }
      return {
        total: HSC5_ANALYTE_STRINGS.length,
        resolvable: HSC5_ANALYTE_STRINGS.length - unresolved.length,
        unresolved,
      };
    })(),
    ambiguous,
    unmapped,
  };

}

/**
 * Randox's `group` beside our health areas.
 *
 * `group` is Randox's own health area on each result row. We never resolve a
 * marker by it — see resolveAnalyte — but a group we have no counterpart for
 * is worth knowing about, because it usually means a whole area of the
 * catalogue is filed differently on their side. Reported, not acted on.
 */
export function reconcileGroups(groups: string[], ourCategoryNames: string[]): { group: string; matches: string | null }[] {
  const ours = new Map(ourCategoryNames.map((n) => [normaliseAnalyte(n), n]));
  return [...new Set(groups.filter(Boolean))].sort().map((group) => ({
    group,
    matches: ours.get(normaliseAnalyte(group)) ?? null,
  }));
}
