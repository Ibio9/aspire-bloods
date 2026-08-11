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

export type AnalyteMatchVia = 'override' | 'sample-type' | 'exact' | 'normalised';

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
 * EXPLICIT OVERRIDES: where Randox's string is not one our catalogue holds.
 *
 * Every entry needs a source. These are the spelling divergences the
 * catalogue's own provenance note records (packages/shared/markerCatalogue.ts,
 * "Randox's spelling slips are corrected here"): Randox print the left-hand
 * string, we hold the corrected name, and without these lines the corrected
 * name is exactly why the match fails.
 *
 * THIS LIST IS SHORT ON PURPOSE AND IS NOT PADDED. The sample report PDF in
 * specs/ uses subset fonts with a custom encoding and its analyte column
 * cannot be extracted mechanically, so no entry here is derived from it —
 * inventing plausible Randox spellings and calling them sourced would be worse
 * than an empty list, because the exception queue catches an absent mapping
 * and nothing catches a wrong one. Every real analyte string Randox send that
 * is missing from here will arrive in the queue with its exact spelling on it,
 * which is the right way to fill this in.
 */
export const ANALYTE_OVERRIDES: Record<string, string> = {
  // Randox's spelling → our marker key. Each of these is the catalogue's own
  // name with the documented substitution put BACK, which is what Randox
  // actually print. Keys verified against resolveCatalogueMarkers().
  //
  // "Bayleaf" is deliberately absent: it normalises to the same string as
  // "Bay Leaf", so pass 2 already resolves it and an override would be a line
  // of noise implying a problem that does not exist.
  'Pepsingogen 1': 'pepsinogen-1',
  'Pepsingogen 2': 'pepsinogen-2',
  'Cancer Atigen 125 (CA 125)': 'ca-125',
  'Glutamine Dehydrogenase (GLDH)': 'gldh',
  'Neutrophil Gelatinase Associatd Lipocalin (NGAL)': 'ngal',
  'Muscle Recover': 'muscle-recovery',
  'Patridge (IgG)': 'partridge-igg',
  'Melon (Galla/Honeydew) (IgG)': 'melon-galia-honeydew-igg',
  'Archael Composition': 'archaeal-composition',
};

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
export function resolveAnalyte(row: AnalyteRowIdentity): AnalyteResolution {
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
  measured: number;
  /** Resolves from its own catalogue name. Self-consistency, NOT confirmation. */
  resolvesFromOwnName: number;
  /** Has at least one alternative spelling, so it survives Randox printing it differently. */
  withAlternativeSpelling: number;
  /** Resolvable on exactly ONE string. These are where a spelling difference costs a result. */
  singleSpellingOnly: { key: string; name: string }[];
  /** Markers reachable through an explicit, sourced override of Randox's own spelling. */
  overrides: number;
  /**
   * Markers whose mapping has been checked against a real Randox result
   * payload. Zero, and it stays zero until one arrives.
   */
  confirmedAgainstRealPayload: number;
  ambiguous: { key: string; name: string; candidates: string[] }[];
  unmapped: { key: string; name: string }[];
} {
  const markers = resolveCatalogueMarkers();
  const measured = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED');
  const ambiguous: { key: string; name: string; candidates: string[] }[] = [];
  const unmapped: { key: string; name: string }[] = [];
  const singleSpellingOnly: { key: string; name: string }[] = [];
  const overrideTargets = new Set(Object.values(ANALYTE_OVERRIDES));
  let resolvesFromOwnName = 0;
  let withAlternativeSpelling = 0;

  for (const marker of measured) {
    const resolution = resolveAnalyte({ analyte: marker.name });
    if (resolution.status === 'MAPPED' && resolution.markerKey === marker.key) resolvesFromOwnName += 1;
    else if (resolution.status === 'AMBIGUOUS') ambiguous.push({ key: marker.key, name: marker.name, candidates: resolution.candidates });
    else unmapped.push({ key: marker.key, name: marker.name });

    // Distinct spellings this marker answers to: its name, its aliases, and
    // any override pointing at it, deduplicated after normalisation.
    const spellings = new Set([marker.name, ...marker.aliases].map(normaliseAnalyte));
    for (const [randoxName, key] of Object.entries(ANALYTE_OVERRIDES)) {
      if (key === marker.key) spellings.add(normaliseAnalyte(randoxName));
    }
    if (spellings.size > 1) withAlternativeSpelling += 1;
    else singleSpellingOnly.push({ key: marker.key, name: marker.name });
  }

  return {
    total: markers.length,
    measured: measured.length,
    resolvesFromOwnName,
    withAlternativeSpelling,
    singleSpellingOnly,
    overrides: overrideTargets.size,
    // Deliberately hardcoded, and deliberately zero. Nothing here has met a
    // real Randox payload, and a coverage figure that implied otherwise would
    // be the padding this function's own comment forbids. It becomes a real
    // count when the first sandbox result lands and its analyte strings are
    // recorded against the markers they were filed under.
    confirmedAgainstRealPayload: 0,
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
