/**
 * The reference-range audit.
 *
 *   npm run audit:ranges --workspace=apps/server
 *
 * ─── WHAT A FALLBACK RANGE IS FOR, AND WHAT IT IS NOT ─────────────────────
 *
 * Ranges live on the RESULT. Every patient-facing read path takes
 * `reportResult.referenceRange` — the row created from the range printed on the
 * document the result came from — and there is no path anywhere that falls back
 * to the marker's catalogue range for display. The catalogue ranges audited
 * here do exactly one thing: pre-fill the verify and manual-entry forms so an
 * admin has something to confirm or correct. `resolveReferenceRange()` is
 * called from precisely two places (panels/router.ts and reports/service.ts),
 * both of them that form.
 *
 * That is why a wrong fallback is a real defect but not a patient-facing one:
 * it is a wrong suggestion in front of somebody whose job is to check it
 * against the paper. It still has to be right, because a suggestion that is
 * usually right is a suggestion people stop reading.
 *
 * ─── THE ORDER OF TRUTH ───────────────────────────────────────────────────
 *
 *  1. The range that arrived on the result. Not audited here — it is per
 *     result, and it is already the only thing displayed.
 *  2. The Randox sample report in `src/modules/randox/specs/`, transcribed
 *     into RANDOX_SOURCE below with the page it came from. This is the
 *     authority for the fallbacks.
 *  3. What is stored, in seed.ts and in the ReferenceRange table.
 *
 * ─── WHAT IS NOT INVENTED HERE ────────────────────────────────────────────
 *
 * A marker with no entry in RANDOX_SOURCE is reported as UNSOURCED and left
 * exactly as it is. It is not reconciled against a textbook, a memory, or a
 * plausible-looking number: "source them, never invent them" is the rule, and
 * a range invented confidently is worse than one that is admittedly a
 * placeholder, because nobody goes back to check the confident one.
 *
 * ─── WHAT "FINISHED" MEANS, AND WHY IT DOES NOT MEAN "ALL SOURCED" ────────
 *
 * The audit now walks the WHOLE catalogue rather than only the markers seed.ts
 * happens to carry a fallback for, and it groups by the panel tier each marker
 * belongs to — Basic Screen, Standard Screen, Standard Screen Plus, Advanced
 * GP2, Advanced GP3, then Insight 360 and Signature. That is what makes the
 * gaps countable per panel instead of being one undifferentiated "unsourced"
 * heap.
 *
 * It does NOT mean every range is now sourced, and it cannot:
 *
 *  · The only Randox document in `specs/` carrying reference ranges is the
 *    HSC5 Basic Screen example report. Basic Screen is therefore the ONLY tier
 *    with a source, and everything above it is unsourceable from what we hold.
 *  · There is no API route to them either. GetTests returns id, name, code,
 *    stabilityTime, sampleTubes, cost and currency — no units and no refLow or
 *    refHigh — and nothing else in the OpenAPI spec returns a range outside
 *    GetOrderResultDetail, which is per result. Confirmed against the spec in
 *    August 2026; nobody should go looking for one again.
 *
 * So the honest output is a complete, per-panel account of what is sourced,
 * what is not, and what the specific risk of each gap is. Advanced GP3 is
 * prioritised in the report because it is what Core sells.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  CATALOGUE_PANELS,
  GP3_NESTING,
  markerKeyForName,
  markerKeysForPanel,
  resolveCatalogueMarkers,
} from '@aspire-bloods/shared';
import { prisma } from '../src/db/client.js';
import { LOTHIAN, PUBLISHED_RANGES, WITHHELD } from '../prisma/publishedReferenceRanges.js';

const OUT = path.resolve(process.cwd(), '../../docs/audits/reference-ranges.md');

interface SourceRange {
  /** The marker key in our catalogue. */
  key: string;
  /** Exactly as Randox print it. */
  printed: string;
  unit: string;
  low: number | null;
  high: number | null;
  page: string;
  /**
   * True where the analyte's range genuinely differs by sex in clinical use.
   * The example report prints ONE range per analyte and does not say whose, so
   * for these the printed range cannot be adopted: doing so would apply one
   * sex's range to everybody, which mislabels roughly half of patients.
   */
  sexSpecificInPractice?: boolean;
  note?: string;
}

/**
 * Transcribed from `HSC5-Randox-Basic-Screen-Example-Report.pdf` (Randox
 * Health Basic Screen, document 0080-RT (2), June 2020), pages 7 to 15.
 *
 * A one-sided band is recorded with a null on the open side, exactly as
 * printed: Randox write "<5.0 Desirable / ≥5.0 High" for total cholesterol,
 * which is a threshold, not a range with a floor of zero.
 *
 * THIS LIST IS COMPLETE FOR THAT DOCUMENT. The report carries 33 analytes and
 * `tests/sampleReportParse.test.ts` parses all 33 out of it over the real PDF;
 * the 34 rows here are those plus `chol-hdl-ratio`, which the report prints as
 * a derived line. There is nothing further to transcribe from `specs/`, which
 * is why every tier above Basic Screen is unsourced below rather than
 * partially sourced.
 */
const RANDOX_SOURCE: SourceRange[] = [
  // Full Blood Count — page 7 to 8
  { key: 'haemoglobin', printed: '130.0 - 180.0', unit: 'g/l', low: 130, high: 180, page: 'p7', sexSpecificInPractice: true },
  { key: 'haematocrit', printed: '40.0 - 54.0', unit: '%', low: 40, high: 54, page: 'p7', sexSpecificInPractice: true },
  { key: 'mch', printed: '27.0 - 32.0', unit: 'pg', low: 27, high: 32, page: 'p7' },
  { key: 'mchc', printed: '320.0 - 360.0', unit: 'g/l', low: 320, high: 360, page: 'p7' },
  { key: 'mcv', printed: '76.0 - 100.0', unit: 'fl', low: 76, high: 100, page: 'p7' },
  { key: 'rbc', printed: '4.5 - 6.5', unit: '10¹²/L', low: 4.5, high: 6.5, page: 'p7', sexSpecificInPractice: true },
  { key: 'basophils', printed: '0.01 - 0.1', unit: '10⁹/L', low: 0.01, high: 0.1, page: 'p7' },
  { key: 'eosinophils', printed: '0.04 - 0.4', unit: '10⁹/L', low: 0.04, high: 0.4, page: 'p8' },
  { key: 'lymphocytes', printed: '1.0 - 3.5', unit: '10⁹/L', low: 1, high: 3.5, page: 'p8' },
  { key: 'monocytes', printed: '0.2 - 0.8', unit: '10⁹/L', low: 0.2, high: 0.8, page: 'p8' },
  { key: 'neutrophils', printed: '2.0 - 7.5', unit: '10⁹/L', low: 2, high: 7.5, page: 'p8' },
  { key: 'wbc', printed: '4.0 - 10.0', unit: '10⁹/L', low: 4, high: 10, page: 'p8' },
  { key: 'platelets', printed: '150 - 450', unit: '10⁹/L', low: 150, high: 450, page: 'p8' },

  // Heart Health — page 9
  { key: 'total-cholesterol', printed: '<5.0 Desirable', unit: 'mmol/l', low: null, high: 5, page: 'p9' },
  { key: 'ldl', printed: '<3.0 Desirable', unit: 'mmol/l', low: null, high: 3, page: 'p9' },
  { key: 'hdl', printed: '≥1.55 Desirable', unit: 'mmol/l', low: 1.55, high: null, page: 'p9', sexSpecificInPractice: true },
  { key: 'chol-hdl-ratio', printed: '<5.0 Desirable', unit: 'ratio', low: null, high: 5, page: 'p9' },
  { key: 'triglycerides', printed: '<2.3 Desirable', unit: 'mmol/l', low: null, high: 2.3, page: 'p9' },
  {
    key: 'hs-crp',
    printed: '<1 Low Risk / 1 - 3 Average Risk / >3 High Risk',
    unit: 'mg/l',
    low: null,
    high: 3,
    page: 'p9',
    note: 'Risk bands rather than a reference range. The stored 0-3.0 is the "not high risk" region and agrees.',
  },

  // Diabetes Health — page 10
  {
    key: 'glucose',
    printed: '4.00 - 5.59 Optimal',
    unit: 'mmol/l',
    low: 4,
    high: 5.59,
    page: 'p10',
    note: 'Randox measure unqualified Glucose on a non-fasting sample; our marker is Fasting Glucose. Not the same test, so the printed range is not this marker\'s authority.',
  },

  // Kidney Health — page 11
  { key: 'creatinine', printed: '53.0 - 97.0', unit: 'μmol/l', low: 53, high: 97, page: 'p11', sexSpecificInPractice: true },
  {
    key: 'egfr',
    printed: '≥60 Satisfactory',
    unit: 'ml/min/1.73m²',
    low: 60,
    high: null,
    page: 'p11',
    note: 'Randox band the CKD stages; the stored 90 is the mildly-reduced threshold. Randox is the named source for the fallback.',
  },
  { key: 'chloride', printed: '95 - 108', unit: 'mmol/l', low: 95, high: 108, page: 'p11' },
  { key: 'phosphate', printed: '0.8 - 1.5', unit: 'mmol/l', low: 0.8, high: 1.5, page: 'p11' },
  { key: 'potassium', printed: '3.5 - 5.3', unit: 'mmol/l', low: 3.5, high: 5.3, page: 'p11' },
  { key: 'sodium', printed: '133.0 - 146.0', unit: 'mmol/l', low: 133, high: 146, page: 'p11' },
  { key: 'urea', printed: '2.5 - 7.8', unit: 'mmol/l', low: 2.5, high: 7.8, page: 'p11' },

  // Liver Health — page 12
  { key: 'alt', printed: '<40 Normal', unit: 'U/l', low: null, high: 40, page: 'p12' },
  { key: 'alp', printed: '30 - 120', unit: 'U/l', low: 30, high: 120, page: 'p12' },
  { key: 'ast', printed: '<40 Normal', unit: 'U/l', low: null, high: 40, page: 'p12' },
  { key: 'ggt', printed: '10.0 - 71.0', unit: 'U/l', low: 10, high: 71, page: 'p12', sexSpecificInPractice: true },
  { key: 'bilirubin', printed: '<21.0 Optimal', unit: 'μmol/l', low: null, high: 21, page: 'p12' },
  { key: 'albumin', printed: '35.0 - 50.0', unit: 'g/l', low: 35, high: 50, page: 'p12' },

  // Other — page 13
  { key: 'crp', printed: '≤5.0 Optimal', unit: 'mg/l', low: null, high: 5, page: 'p13' },
];

/**
 * The corrections this audit has produced, recorded here because the report is
 * regenerated from the CURRENT seed and would otherwise show them as agreeing
 * and say nothing about how they got that way.
 *
 * Every one is a case where the Randox example report prints a range the stored
 * fallback disagreed with, for an analyte Randox do not split by sex. The
 * report re-derives the CORRECTED list from the source each run and cross-checks
 * it against this one, so an entry here that no longer corresponds to anything
 * shows up as a discrepancy rather than as decoration.
 */
const APPLIED: { key: string; was: string; now: string; page: string }[] = [
  { key: 'wbc', was: '4.0–11.0', now: '4.0–10.0', page: 'p8' },
  { key: 'platelets', was: '150–400', now: '150–450', page: 'p8' },
  { key: 'mcv', was: '80–100', now: '76–100', page: 'p7' },
  { key: 'lymphocytes', was: '1.0–4.0', now: '1.0–3.5', page: 'p8' },
  { key: 'alt', was: '0–41', now: '0–40', page: 'p12' },
  { key: 'ggt', was: '0–60', now: '10–71', page: 'p12' },
  { key: 'alp', was: '30–130', now: '30–120', page: 'p12' },
  { key: 'egfr', was: '90–999', now: '60–999', page: 'p11' },
  { key: 'sodium', was: '135–145', now: '133–146', page: 'p11' },
  { key: 'potassium', was: '3.5–5.1', now: '3.5–5.3', page: 'p11' },
  { key: 'hdl', was: '1.0–999', now: '1.55–999', page: 'p9' },
  { key: 'triglycerides', was: '0–1.7', now: '0–2.3', page: 'p9' },
  { key: 'chol-hdl-ratio', was: '0–4.5', now: '0–5.0', page: 'p9' },
];

/**
 * ─── SEX AND AGE DEPENDENCE, ACROSS THE WHOLE CATALOGUE ───────────────────
 *
 * This table contains NO RANGES and that is the point. A range is sourced or
 * it is not; but "this analyte's range differs by sex" is a different kind of
 * claim, it does not put a number in front of anybody, and leaving it unsaid is
 * what lets a single blanket range sit there looking finished.
 *
 * It is the highest-value thing this audit can produce without the catalogue
 * PDF, because the failure it describes is silent: a marker whose range
 * genuinely differs by sex, stored once as `ANY`, renders a perfectly ordinary
 * green "in range" for roughly half of patients whose result is not.
 *
 * `basis` says where the flag comes from, and the two are not equal:
 *
 *  · `randox` — the HSC5 report prints a single range for an analyte that is
 *    sex-dependent, so the document itself is the evidence.
 *  · `convention` — standard UK adult laboratory practice. Unsourced, flagged
 *    only, NEVER acted on. It gets somebody qualified to the right rows fast;
 *    it does not authorise a change.
 */
type Dependence = 'sex' | 'age' | 'both';
interface DependenceFlag {
  key: string;
  kind: Dependence;
  basis: 'randox' | 'convention';
  why: string;
}

const DEPENDENCE: DependenceFlag[] = [
  // ── Evidenced by the HSC5 report printing one range for a split analyte ──
  { key: 'haemoglobin', kind: 'sex', basis: 'randox', why: 'The printed 130–180 g/L is a male band; the female band is lower throughout.' },
  { key: 'haematocrit', kind: 'sex', basis: 'randox', why: 'The printed 40–54% is a male band.' },
  { key: 'rbc', kind: 'sex', basis: 'randox', why: 'The printed 4.5–6.5 ×10¹²/L is a male band.' },
  { key: 'creatinine', kind: 'both', basis: 'randox', why: 'Tracks muscle mass, so it differs by sex and falls with age. The printed 53–97 µmol/L does not say whose.' },
  { key: 'ggt', kind: 'sex', basis: 'randox', why: 'Reported with a lower upper limit for women in most UK laboratories; the report prints one band.' },
  { key: 'hdl', kind: 'sex', basis: 'randox', why: 'Cardiovascular guidance sets a different desirable threshold for men and women; the report prints one.' },

  // ── Flagged from clinical convention. Unsourced. Nothing changed. ────────
  { key: 'ferritin', kind: 'sex', basis: 'convention', why: 'Iron stores differ markedly between men and premenopausal women; a single band under-calls depletion in one and overcalls it in the other.' },
  { key: 'iron', kind: 'sex', basis: 'convention', why: 'Serum iron is reported against sex-specific bands in most UK laboratories.' },
  { key: 'transferrin-saturation', kind: 'sex', basis: 'convention', why: 'Derived from iron and TIBC, so it inherits the sex dependence of both.' },
  { key: 'uric-acid', kind: 'sex', basis: 'convention', why: 'The upper limit is substantially lower for women; a shared band misses hyperuricaemia in women.' },
  { key: 'creatine-kinase', kind: 'sex', basis: 'convention', why: 'Tracks muscle mass and is reported against sex-specific bands.' },
  { key: 'myoglobin', kind: 'sex', basis: 'convention', why: 'Tracks muscle mass, same as creatine kinase.' },
  { key: 'shbg', kind: 'sex', basis: 'convention', why: 'Substantially higher in women; it is also the denominator of the free androgen index, so one wrong band moves two results.' },
  { key: 'free-androgen-index', kind: 'sex', basis: 'convention', why: 'Calculated from testosterone and SHBG, both of which are sex-specific, and interpreted against completely different bands per sex.' },
  { key: 'prolactin', kind: 'sex', basis: 'convention', why: 'Reported against a higher upper limit in women.' },
  { key: 'fsh', kind: 'both', basis: 'convention', why: 'Stored as one ANY band, but in women it moves through the menstrual cycle and rises at menopause. A single adult band cannot describe either.' },
  { key: 'lh', kind: 'both', basis: 'convention', why: 'Same as FSH: cycle phase and menopausal status both move it.' },
  { key: 'oestradiol', kind: 'both', basis: 'convention', why: 'Stored FEMALE-only, which is right as far as it goes, but the band moves through the cycle and after menopause and the stored one is a single figure for all of it.' },
  { key: 'progesterone', kind: 'age', basis: 'convention', why: 'The stored band is 0–999, i.e. no band at all. It is interpretable only against cycle phase, which the record does not carry.' },
  { key: 'dhea-s', kind: 'both', basis: 'convention', why: 'Falls steeply and continuously with age and differs by sex; one adult band is wrong for most adults.' },
  { key: 'igf-1', kind: 'age', basis: 'convention', why: 'Reported against narrow age decade bands. An adult-wide band is not clinically usable.' },
  { key: 'amh', kind: 'age', basis: 'convention', why: 'Declines with age by design — it is used as a measure of ovarian reserve, which is an age-relative quantity.' },
  { key: 'alp', kind: 'age', basis: 'convention', why: 'Several times the adult upper limit during adolescent bone growth, and raised again in later life.' },
  { key: 'egfr', kind: 'age', basis: 'convention', why: 'Falls with age in health. The calculation itself already adjusts for sex, so this is an age flag and not a sex one.' },
  { key: 'esr', kind: 'both', basis: 'convention', why: 'The conventional upper limit is calculated from age and differs by sex. A fixed 0–20 is wrong at both ends of adult life.' },
  { key: 'total-psa', kind: 'age', basis: 'convention', why: 'Age-banded upper limits are standard. Already restricted to men, so this is an age flag only.' },
  { key: 'b2-microglobulin', kind: 'age', basis: 'convention', why: 'Rises with falling renal function, so its usable band moves with age.' },
  { key: 'cystatin-c', kind: 'both', basis: 'convention', why: 'Used precisely because it is less dependent on muscle mass than creatinine, but its reference band still moves with age and mildly with sex.' },
  { key: 'apo-a1', kind: 'sex', basis: 'convention', why: 'Higher in women, in step with HDL, which is already flagged above.' },
];

const esc = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|');
const same = (a: number | null, b: number) => a === null || Math.abs(a - b) < 1e-9;

/**
 * The AUTHORED fallbacks, read out of seed.ts.
 *
 * Deliberately not read from the ReferenceRange table, and the reason is one of
 * the biggest findings in this audit. That table holds two different things
 * under one roof: the catalogue rows this file seeds, and one row per result
 * ever materialised (`materialiseReport.ts` creates one unconditionally).
 * Reading "the fallback" out of it would be reading whatever the last import
 * happened to leave behind.
 *
 * Parsed with a regex over one-line-per-marker entries rather than by importing
 * seed.ts, which self-executes. The count is asserted below, so a change to the
 * file's shape fails loudly instead of quietly auditing nothing.
 */
const SEED_FILE = path.resolve(process.cwd(), 'prisma/seed.ts');
const SEED_ENTRY =
  /\{ key: '([^']+)', name: '([^']+)', unit: '([^']*)', low: (-?[\d.]+), high: (-?[\d.]+)(?:, sex: '(MALE|FEMALE|ANY)')?/g;

interface SeededFallback {
  key: string;
  name: string;
  unit: string;
  low: number;
  high: number;
  sex: 'MALE' | 'FEMALE' | 'ANY';
  /**
   * The row's provenance tier, which is now a column on ReferenceRange rather
   * than a sentence in `source`. A range without one reads exactly like a
   * range with one, which is why the tier exists at all.
   */
  provenance: 'RANDOX' | 'PUBLISHED' | 'UNSOURCED';
}

function readSeededFallbacks(): SeededFallback[] {
  return applyPublishedRanges(readSeededFallbacksFromSeedFileOnly());
}

function readSeededFallbacksFromSeedFileOnly(): SeededFallback[] {
  const text = fs.readFileSync(SEED_FILE, 'utf8');
  const out: SeededFallback[] = [];
  for (const m of text.matchAll(SEED_ENTRY)) {
    out.push({
      key: m[1],
      name: m[2],
      unit: m[3],
      low: Number(m[4]),
      high: Number(m[5]),
      sex: (m[6] as SeededFallback['sex']) ?? 'ANY',
      provenance: 'UNSOURCED',
    });
  }
  if (out.length < 60) {
    throw new Error(
      `Only parsed ${out.length} marker fallbacks out of seed.ts, which cannot be right. The entry format has changed — fix SEED_ENTRY rather than trusting this report.`,
    );
  }
  return out;
}

/**
 * WHAT THE SEED ACTUALLY LEAVES IN THE TABLE, which is no longer just the list
 * in seed.ts.
 *
 * `seedPublishedReferenceRanges()` writes a sex-split pair for ten analytes and
 * DELETES the blanket `ANY` row they replace. An audit that read only seed.ts
 * would go on reporting those ten as "one ANY band" for ever — which is the
 * report saying a defect is outstanding after it has been fixed, and is
 * exactly as misleading as the reverse.
 *
 * The names come from whatever the seed's own row called the analyte, so a
 * marker that only reaches the catalogue through the Randox import (troponin
 * I, CA 125, the microalbumin ratio) picks its name up from the catalogue
 * below instead.
 */
function applyPublishedRanges(seeded: SeededFallback[]): SeededFallback[] {
  const replaced = new Set(PUBLISHED_RANGES.map((r) => r.markerKey));
  const nameFor = new Map(seeded.map((s) => [s.key, s.name]));
  const kept = seeded.filter((s) => !replaced.has(s.key));
  const added = PUBLISHED_RANGES.map((r) => ({
    key: r.markerKey,
    name: nameFor.get(r.markerKey) ?? r.markerKey,
    unit: r.stored.unit,
    low: r.stored.low,
    high: r.stored.high,
    sex: r.sex,
    provenance: 'PUBLISHED' as const,
  }));
  return [...kept, ...added];
}

/**
 * WHICH PANEL TIER EACH MARKER BELONGS TO — the grouping the whole report hangs
 * off, and the reason it can now say "Advanced GP3 has N unsourced" rather than
 * "the catalogue has 130 unsourced".
 *
 * A marker belongs to the INNERMOST tier that introduces it, because the tiers
 * nest: Advanced GP3 contains GP2 contains Standard Screen Plus contains
 * Standard Screen contains Basic Screen. Anything not on Core at all falls to
 * the panel that does sell it.
 */
const TIER_ORDER = [
  ...GP3_NESTING.map((t) => ({ key: t.key, name: t.name, code: t.code, sourced: t.sourced })),
  { key: 'core-extras', name: 'Core add-ons', code: null, sourced: false },
  { key: 'insight-360', name: 'Insight 360', code: null, sourced: false },
  { key: 'signature', name: 'Signature', code: null, sourced: false },
  // Markers seed.ts carries a fallback for that the Randox catalogue does not
  // contain at all. They predate the catalogue import and the clinic does not
  // sell them, so their fallbacks are maintenance nobody is doing — worth
  // seeing rather than worth silently dropping, which is what an audit keyed
  // off the catalogue alone would do.
  { key: 'not-in-catalogue', name: 'Seeded, not in the Randox catalogue', code: null, sourced: false },
] as const;

type TierKey = (typeof TIER_ORDER)[number]['key'];

function buildTierIndex(): Map<string, TierKey> {
  const tierOf = new Map<string, TierKey>();
  for (const tier of GP3_NESTING) {
    for (const name of tier.addsMarkerNames) {
      const key = markerKeyForName(name);
      if (!tierOf.has(key)) tierOf.set(key, tier.key as TierKey);
    }
  }
  const core = CATALOGUE_PANELS.find((p) => p.key === 'core')!;
  for (const name of core.extraMarkerNames ?? []) {
    const key = markerKeyForName(name);
    if (!tierOf.has(key)) tierOf.set(key, 'core-extras');
  }
  for (const panelKey of ['insight-360', 'signature'] as const) {
    const panel = CATALOGUE_PANELS.find((p) => p.key === panelKey)!;
    for (const key of markerKeysForPanel(panel)) {
      if (!tierOf.has(key)) tierOf.set(key, panelKey);
    }
  }
  return tierOf;
}

interface Row {
  key: string;
  name: string;
  unit: string;
  tier: TierKey;
  /** Every stored fallback for this analyte, which may be split by sex. */
  fallbacks: SeededFallback[];
  source?: SourceRange;
  dependence?: DependenceFlag;
  verdict: string;
  action: string;
}

async function main() {
  const seeded = readSeededFallbacks();
  // What seed.ts alone holds, before the published ranges replace anything —
  // so the report can say what each of the ten WAS rather than only what it is.
  const beforePublished = readSeededFallbacksFromSeedFileOnly();
  const bySource = new Map(RANDOX_SOURCE.map((s) => [s.key, s]));
  const byDependence = new Map(DEPENDENCE.map((d) => [d.key, d]));
  const tierOf = buildTierIndex();
  const catalogue = resolveCatalogueMarkers().filter((m) => m.resultType === 'MEASURED');
  const seededByKey = new Map<string, SeededFallback[]>();
  const seededByName = new Map<string, SeededFallback[]>();
  for (const s of seeded) {
    seededByKey.set(s.key, [...(seededByKey.get(s.key) ?? []), s]);
    seededByName.set(s.name, [...(seededByName.get(s.name) ?? []), s]);
  }

  // A key in either table that no MEASURED marker answers to is a row this
  // report would silently drop — which is the one failure mode an audit cannot
  // have, because the output looks complete either way. Fatal.
  const measuredKeys = new Set(catalogue.map((m) => m.key));
  const seededKeys = new Set(seeded.map((s) => s.key));
  const known = (k: string) => measuredKeys.has(k) || seededKeys.has(k);
  const orphans = [
    ...RANDOX_SOURCE.filter((s) => !known(s.key)).map((s) => `RANDOX_SOURCE:${s.key}`),
    ...DEPENDENCE.filter((d) => !known(d.key)).map((d) => `DEPENDENCE:${d.key}`),
  ];
  if (orphans.length > 0) {
    throw new Error(
      `${orphans.length} audit entr(ies) name a key that is not a MEASURED marker, so they would be dropped from the report without a word: ${orphans.join(', ')}.`,
    );
  }

  // The two tables, counted apart. They were one, and the mixing is what this
  // audit used to have to report as an open defect.
  const totalRangeRows = await prisma.referenceRange.count();
  const markersWithRanges = await prisma.referenceRange.groupBy({ by: ['markerId'], _count: true });
  const worstMarkerRows = Math.max(0, ...markersWithRanges.map((g) => g._count));
  const resultRecordRows = await prisma.resultReferenceRange.count();

  // (An analyte can be split across two marker keys — haemoglobin /
  // haemoglobin-f, testosterone / testosterone-f — so the stored ranges for one
  // analyte are gathered by NAME as well as by key, above.)

  // The catalogue, plus any marker seed.ts holds a fallback for that the
  // catalogue does not. The second group is small and is filed under its own
  // tier below; leaving it out would mean an audit of "every reference range"
  // that quietly skipped some.
  const auditable = [
    ...catalogue.map((m) => ({ key: m.key, name: m.name, unit: m.unit })),
    ...[...seededKeys]
      .filter((k) => !measuredKeys.has(k))
      .map((k) => {
        const f = seededByKey.get(k)![0];
        return { key: k, name: f.name, unit: f.unit };
      }),
  ];

  const rows: Row[] = auditable.map((m) => {
    const own = seededByKey.get(m.key) ?? [];
    // The sex-split sibling, which carries a different key and the same name.
    const siblings = own.length ? (seededByName.get(own[0].name) ?? own) : [];
    const fallbacks = siblings.length ? siblings : own;
    const source = bySource.get(m.key);
    const dependence = byDependence.get(m.key);
    const base = {
      key: m.key,
      name: m.name,
      unit: m.unit,
      tier: tierOf.get(m.key) ?? (measuredKeys.has(m.key) ? 'signature' : 'not-in-catalogue') as TierKey,
      fallbacks,
      source,
      dependence,
    };

    if (fallbacks.length === 0) {
      return {
        ...base,
        verdict: 'NO FALLBACK',
        action:
          'No catalogue range at all, so the verify form offers nothing to confirm and an admin types the range off the paper unaided. Not a patient-facing defect — every displayed range comes off the result — but it is the largest single gap here.',
      };
    }
    if (!source) {
      return {
        ...base,
        verdict: 'UNSOURCED',
        action: 'Left exactly as it is. No Randox document in `specs/` covers this analyte.',
      };
    }
    if (source.key === 'glucose') {
      return { ...base, verdict: 'NOT THE SAME TEST', action: source.note! };
    }

    const sexes = new Set(fallbacks.map((f) => f.sex));
    const agreesEverywhere = fallbacks.every(
      (f) => (source.low === null || same(source.low, f.low)) && (source.high === null || same(source.high, f.high)),
    );
    const agreesSomewhere = fallbacks.some(
      (f) => (source.low === null || same(source.low, f.low)) && (source.high === null || same(source.high, f.high)),
    );

    if (agreesEverywhere) return { ...base, verdict: 'AGREES', action: '—' };
    if (source.sexSpecificInPractice) {
      return {
        ...base,
        verdict: 'DIFFERS — SEX-SPECIFIC',
        action:
          sexes.size === 1 && sexes.has('ANY')
            ? '**Structural defect.** One sex-agnostic range for an analyte whose range genuinely differs by sex, so roughly half of patients get the wrong suggestion. NOT changed: the Randox example prints one range and does not say whose, so adopting it would swap one wrong answer for another. For Richard.'
            : `NOT changed. The stored ranges are correctly split by sex${agreesSomewhere ? ' and one of them matches the printed band' : ''}, but the Randox example prints a single range without saying which sex it applies to, so it cannot arbitrate. For Richard.`,
      };
    }
    return {
      ...base,
      verdict: 'CONTRADICTED — NEEDS CORRECTING',
      action: `The Randox Basic Screen ${source.page} prints ${source.printed}, which the stored ${fallbacks
        .map((f) => `${f.low}–${f.high}`)
        .join(' / ')} disagrees with.`,
    };
  });

  const byTier = new Map<TierKey, Row[]>();
  for (const r of rows) byTier.set(r.tier, [...(byTier.get(r.tier) ?? []), r]);

  // ── Sex and age, across the whole catalogue ─────────────────────────────
  const storedSexSplit = [...new Set(rows.filter((r) => r.fallbacks.some((f) => f.sex !== 'ANY')).map((r) => r.name))];
  const sexFlagged = rows.filter((r) => r.dependence?.kind === 'sex' || r.dependence?.kind === 'both');
  const sexFlaggedNotSplit = sexFlagged.filter((r) => !r.fallbacks.some((f) => f.sex !== 'ANY'));
  const ageFlagged = rows.filter((r) => r.dependence?.kind === 'age' || r.dependence?.kind === 'both');
  // The schema carries ageMin/ageMax and the resolver scores an age-bracketed
  // row above an unbounded one, but no seeded fallback sets either.
  const ageBracketed: Row[] = [];

  const contradicted = rows.filter((r) => r.verdict === 'CONTRADICTED — NEEDS CORRECTING');
  const unsourced = rows.filter((r) => r.verdict === 'UNSOURCED');
  const noFallback = rows.filter((r) => r.verdict === 'NO FALLBACK');
  const agrees = rows.filter((r) => r.verdict === 'AGREES');

  const lines: string[] = [];
  const p = (s = '') => lines.push(s);

  p('# Reference range audit');
  p();
  p('Generated by `apps/server/scripts/auditReferenceRanges.ts`. Read-only — it changes nothing itself; the corrections it produced are in `prisma/seed.ts` and are listed below with their source.');
  p();
  p(`**${rows.length}** MEASURED markers in the catalogue. **${agrees.length}** carry a fallback that agrees with a sourced Randox range, **${contradicted.length}** are contradicted by one and still need correcting, **${unsourced.length}** carry a fallback no document in \`specs/\` covers, and **${noFallback.length}** carry no fallback at all.`);
  p();

  p('## The headline, and it is not a comfortable one');
  p();
  p('The only Randox document in `apps/server/src/modules/randox/specs/` that carries reference ranges is the **HSC5 Basic Screen example report**. So:');
  p();
  const tierSummary = TIER_ORDER.map((t) => {
    const members = byTier.get(t.key) ?? [];
    const sourced = members.filter((r) => r.source && r.verdict !== 'NOT THE SAME TEST').length;
    return { ...t, members, sourced };
  });
  p('| Tier / panel | Code | MEASURED markers | With a sourced range | With a fallback but no source | With no fallback at all |');
  p('| --- | --- | --- | --- | --- | --- |');
  for (const t of tierSummary) {
    p(
      `| ${t.name} | ${t.code ?? '—'} | ${t.members.length} | ${t.sourced} | ${
        t.members.filter((r) => r.verdict === 'UNSOURCED' || r.verdict === 'NOT THE SAME TEST').length
      } | ${t.members.filter((r) => r.verdict === 'NO FALLBACK').length} |`,
    );
  }
  p();
  p('**Advanced GP3 is prioritised because Core sells it**, and the answer for it is the same as for the three tiers below it and above Basic Screen: nothing on them can be sourced from what we hold. That is not a gap somebody forgot to fill — it is the absence of a document. Two things follow, and they should be said plainly rather than worked around:');
  p();
  p('1. **The Randox Pathology Services Catalogue is the missing artefact.** It is the document that carries per-analyte ranges for the tiers above Basic Screen. It is not in `specs/` and could not be retrieved. Ask Randox for it, and for a FEMALE example report alongside the male one we have.');
  p('2. **There is no API route to them and nobody should look for one again.** `GetTests` returns id, name, code, stabilityTime, sampleTubes, cost and currency — no units, no `refLow`, no `refHigh`. Confirmed against the real OpenAPI document (GP Test Portal v1.0, 17 endpoints) in August 2026. Ranges arrive per marker on the RESULT, in `GetOrderResultDetail`, and nowhere else.');
  p();

  p('## Where a range actually comes from');
  p();
  p(
    'Confirmed in code, not assumed. Every patient-facing read path takes the range stored ON THE RESULT (`reportResult.referenceRange`): `patients/service.ts`, `portalService.ts`, `dsarService.ts`, and the PDF export. There is no display path anywhere that falls back to the marker catalogue, and `resolveReferenceRange()` — the only thing that reads catalogue ranges — is called from exactly two places, `panels/router.ts` and `reports/service.ts`, both of them the admin verify/manual-entry form.',
  );
  p();
  p(
    'So the ranges below are a SUGGESTION shown to an admin who is looking at the paper result, never a number a patient is shown. That is what makes correcting them safe; it is also why they still have to be right, because a suggestion that is usually correct is one people stop checking.',
  );
  p();

  p('## Sex-specific ranges — listed separately, as they should be');
  p();
  p(
    'The single most likely source of real error in this whole file, and the reason is that it is SILENT. A marker whose range genuinely differs by sex, stored once as `ANY`, renders an ordinary, unremarkable, correctly-formatted suggestion that is wrong for roughly half of patients. Nothing about the screen looks different.',
  );
  p();
  p(`- **${storedSexSplit.length}** analytes store sex-split ranges today: ${storedSexSplit.join(', ') || 'none'}.`);
  p(`- **${sexFlagged.length}** analytes in the catalogue are sex-dependent in clinical use.`);
  p(`- **${sexFlaggedNotSplit.length}** of those store no sex split at all. Every one is listed below.`);
  p();
  p('The code handles the distinction correctly wherever the DATA is right: `resolveReferenceRange()` scores a sex-specific row above an `ANY` one and an age-bracketed row above an unbounded one, and — the important part — it REFUSES TO ANSWER when the marker draws a sex distinction and the patient has no sex on file, rather than quietly handing back the `ANY` range. `resolveReferenceRange.test.ts` pins that. The gap is in the data, not the resolver: a marker with only an `ANY` row gives the resolver nothing to be careful with.');
  p();
  p('| Marker | Tier | Stored | Depends on | Evidence | Why it matters |');
  p('| --- | --- | --- | --- | --- | --- |');
  for (const r of sexFlagged.sort((a, b) => Number(!!a.fallbacks.some((f) => f.sex !== 'ANY')) - Number(!!b.fallbacks.some((f) => f.sex !== 'ANY')))) {
    const split = r.fallbacks.some((f) => f.sex !== 'ANY');
    // Three states, not two: split correctly, stored once for everybody, or
    // nothing stored at all. The third is not the mildest of them — a marker
    // with no fallback offers the admin nothing, but a marker with ONE band for
    // an analyte that needs two offers them something that looks checked.
    const stored = !r.fallbacks.length
      ? '**no fallback at all**'
      : split
        ? r.fallbacks.map((f) => `${f.sex} ${f.low}–${f.high}`).join('<br>')
        : `**one ANY band** — ${r.fallbacks.map((f) => `${f.low}–${f.high}`).join(' / ')}`;
    p(
      `| ${esc(r.name)} | ${TIER_ORDER.find((t) => t.key === r.tier)?.name} | ${stored} | ${r.dependence!.kind} | ${
        r.dependence!.basis === 'randox' ? 'HSC5 report prints one band' : 'clinical convention, unsourced'
      } | ${esc(r.dependence!.why)} |`,
    );
  }
  p();
  p(
    '**No `randox` row here is corrected, and that is deliberate.** The example report prints ONE range per analyte and never says whose: haemoglobin 130.0–180.0 and haematocrit 40.0–54.0 read as male bands, creatinine 53.0–97.0 does not. Adopting them blind would replace a range that is wrong for half of patients with a range that is wrong for the other half — a different bug of the same shape. **These still need the Pathology Services Catalogue or a female example report; neither is in `specs/`.** Ten of them are now answered from a weaker, named, third-party source instead — the next section — and that changes nothing about the ask.',
  );
  p();

  // ── The provenance tier, and the ten ranges loaded under it ──────────────
  p('## Provenance: where a suggestion actually comes from');
  p();
  p(
    '`ReferenceRange.source` has always been a sentence, which means nothing could sort, filter or count on it and the verify form could not put anything beside a suggested number. So an unverified standard adult band and a range transcribed from the Randox report looked identical in the one place where the difference matters: on screen, in front of somebody holding the paper result. **A suggestion that is usually correct is one people stop checking.**',
  );
  p();
  p('There are three tiers, and the order is the precedence order.');
  p();
  p('| Tier | What it means | Rows |');
  p('| --- | --- | --- |');
  const tierCounts = (t: SeededFallback['provenance']) => seeded.filter((s) => s.provenance === t).length;
  p(`| \`RANDOX\` | From a document in \`specs/\`. The laboratory that runs the assay, and the only authority that is actually about THIS test. | ${tierCounts('RANDOX')} |`);
  p(`| \`PUBLISHED\` | A named third-party laboratory or guideline. Weaker on purpose, and replaced the moment a Randox range exists for the same analyte. | ${tierCounts('PUBLISHED')} |`);
  p(`| \`UNSOURCED\` | A seeded fallback nobody has verified. The default, because that is what most of the catalogue is. | ${tierCounts('UNSOURCED')} |`);
  p();
  p(
    '**A Randox range is never overwritten by a published one.** Reference intervals are assay-specific: they belong to the analyser, the method and the population a laboratory validated against, not to the analyte in the abstract. The tier is shown in the admin verify form beside the number, with a sentence saying what to do about it.',
  );
  p();
  p('### The ten loaded, and what was there before');
  p();
  p(
    `Source: **${LOTHIAN.publisher}**, "${LOTHIAN.document}", ${LOTHIAN.date}. <${LOTHIAN.url}>`,
  );
  p();
  p(
    'It is NOT Randox, and it goes in at the weaker tier for that reason. Every row carries the citation, and every row is replaced the moment the Pathology Services Catalogue or a female HSC5 report arrives.',
  );
  p();
  p('| Marker | Was stored | Now stored | Printed as | Conversion | Tier |');
  p('| --- | --- | --- | --- | --- | --- |');
  for (const key of [...new Set(PUBLISHED_RANGES.map((r) => r.markerKey))]) {
    const before = beforePublished.filter((s) => s.key === key);
    const after = PUBLISHED_RANGES.filter((r) => r.markerKey === key);
    const row = rows.find((r) => r.key === key);
    p(
      [
        '',
        esc(row?.name ?? key),
        before.length
          ? before.map((f) => `${f.sex === 'ANY' ? 'ANY' : f.sex} ${f.low}–${f.high} ${f.unit}`).join('<br>')
          : '**nothing at all**',
        after.map((r) => `${r.sex} ${r.stored.low}–${r.stored.high} ${r.stored.unit}`).join('<br>'),
        after.map((r) => `${r.printed.low}–${r.printed.high} ${r.printed.unit}`).join('<br>'),
        after[0].conversion ? `×${after[0].conversion.factor} — ${esc(after[0].conversion.why)}` : 'none, the printed unit is ours',
        '`PUBLISHED`',
        '',
      ].join(' | '),
    );
  }
  p();
  p(
    '**Both bands are loaded for every analyte, and the blanket `ANY` row is deleted.** Leaving it beside them would keep answering for a patient with no sex on file, which is the silent wrong answer this whole section is about — still there, now with company. With it gone `resolveReferenceRange()` refuses and says why. A row a real result points at is never deleted: that is that result\'s record of what was printed on the paper, not a catalogue fallback.',
  );
  p();
  p(
    '**Every conversion is asserted twice, independently** — once against the factor the row declares and once against the literal expected number, written out by hand in `tests/publishedReferenceRanges.test.ts`. A conversion error does not produce something that looks wrong: it produces a correctly formatted number in the right column that is out by a factor of a thousand, and nobody reading a verify form would catch a urate range of 0.12–0.36 µmol/L. A single self-consistent check could not see that.',
  );
  p();
  p(`### The ${WITHHELD.length} deliberately NOT loaded, and why`);
  p();
  p(
    '**The flag marking each of these as awaiting a sex-specific range stays on.** Loading ten of twenty does not clear the problem for the other ten, and a flag cleared by a partial fix is worse than one never raised.',
  );
  p();
  p('| Marker | Why not |');
  p('| --- | --- |');
  for (const w of WITHHELD) p(`| ${esc(w.name)} | ${esc(w.why)} |`);
  p();

  p('## Age-specific ranges');
  p();
  p(
    `**${ageFlagged.length}** analytes have a range that moves with age. **${ageBracketed.length}** seeded fallbacks carry an age bracket. The schema supports \`ageMin\`/\`ageMax\` and \`resolveReferenceRange\` scores an age-bracketed row above an unbounded one — the structure is present and the data is absent, so for every marker below the suggestion is one adult band regardless of the patient's age.`,
  );
  p();
  p('| Marker | Tier | Stored | Evidence | Why it matters |');
  p('| --- | --- | --- | --- | --- |');
  for (const r of ageFlagged) {
    p(
      `| ${esc(r.name)} | ${TIER_ORDER.find((t) => t.key === r.tier)?.name} | ${
        r.fallbacks.length ? r.fallbacks.map((f) => `${f.low}–${f.high}`).join(' / ') : '**no fallback at all**'
      } | ${r.dependence!.basis === 'randox' ? 'HSC5 report' : 'clinical convention, unsourced'} | ${esc(r.dependence!.why)} |`,
    );
  }
  p();

  p('## Fixed since the last run: the ReferenceRange table held two different things');
  p();
  p(
    '`ReferenceRange` used to be both the catalogue of fallbacks AND the per-result record of what was printed on the paper — `materialiseReport.ts` created a row for every result it materialised, into the same table `marker.referenceRanges` read from, so the "catalogue" grew by one row per result for ever. That is not a tidiness complaint. A `findFirst` on marker-and-sex landed on a result record far more often than on the catalogue row, and updating one rewrote a patient\'s history to say their laboratory printed a range it did not. Ten rows went that way in a single seed run; four still carry the sentence recording it, because what was printed is not recoverable.',
  );
  p();
  p(
    `They are two tables as of August 2026: \`ReferenceRange\` is the catalogue and nothing else, and \`ResultReferenceRange\` holds one row per result. Nothing was deleted — every row was relocated into whichever table owns it, keeping its id and its timestamp. This development database now holds **${totalRangeRows} catalogue rows across ${markersWithRanges.length} markers** (the largest number any one marker carries is **${worstMarkerRows}**) and **${resultRecordRows} per-result records**.`,
  );
  p();
  p(
    'Three consequences worth naming. A Marker has no relation to the per-result records at all, so `resolveReferenceRange()` cannot be handed one — the mistake is no longer expressible rather than merely avoided. `ReportResult.referenceRangeId` is UNIQUE, so a record belongs to one result and a correction to it can never reach another patient. And the `results: { none: {} }` guard the seed used to carry is gone, because it was never sound either: a re-verify orphans the record it replaces, and an orphaned result record satisfies that guard exactly as a catalogue row does. 152 of them were sitting in the catalogue that way.',
  );
  p();
  p(
    'The tie-break is a total order now as well — specificity, then provenance, then `createdAt`, then `id` — in the query and in the comparator. Where two catalogue rows tie, the answer is fixed rather than being whatever Postgres returned first.',
  );
  p();

  p('## Corrected, with the source for each');
  p();
  p(
    'Every one of these is a case where the Randox Basic Screen example report prints a range the stored fallback disagreed with, for an analyte Randox do not treat as sex-specific. Changed in `prisma/seed.ts`; a re-seed carries them into the catalogue rows.',
  );
  p();
  p('| Marker | Was | Now | Unit | Source |');
  p('| --- | --- | --- | --- | --- |');
  for (const a of APPLIED) {
    const row = rows.find((r) => r.key === a.key);
    const src = bySource.get(a.key);
    p(
      `| ${esc(row?.name ?? a.key)} | ${a.was} | ${a.now} | ${esc(row?.unit ?? '')} | Randox Basic Screen ${a.page}, printed \`${esc(src?.printed ?? '')}\` |`,
    );
  }
  p();
  if (contradicted.length > 0) {
    p(
      `⚠ **${contradicted.length} fallback(s) still disagree with the Randox source and are NOT in the list above**: ${contradicted
        .map((r) => `${r.name} (${r.action})`)
        .join('; ')}.`,
    );
  } else {
    p('Nothing else in the catalogue now contradicts a sourced range. This run found **0** further corrections to make, which is the expected result of the ones above having been applied — it is asserted rather than assumed, by re-deriving the comparison from the source on every run.');
  }
  p();

  p('## Every MEASURED marker, by panel tier');
  p();
  p('`Fallback` is what the verify form suggests today and `Tier` is how well-founded that suggestion is. `Randox says` is the sourced range where there is one. `Sex` and `Age` say whether the stored data draws that distinction — not whether the analyte needs it, which is the two sections above.');
  for (const t of tierSummary) {
    if (t.members.length === 0) continue;
    p();
    p(`### ${t.name}${t.code ? ` (${t.code})` : ''} — ${t.members.length} markers${t.sourced ? '' : ', no source document'}`);
    p();
    p('| Marker | Key | Fallback | Unit | Tier | Sex | Age | Randox says | Page | Verdict | Action |');
    p('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of t.members.sort((a, b) => a.name.localeCompare(b.name))) {
      p(
        [
          '',
          esc(r.name),
          `\`${r.key}\``,
          r.fallbacks.length ? r.fallbacks.map((f) => `${f.low}–${f.high}`).join(' / ') : '—',
          esc(r.unit || '—'),
          r.fallbacks.length ? [...new Set(r.fallbacks.map((f) => f.provenance))].map((x) => `\`${x}\``).join('/') : '—',
          r.fallbacks.length ? [...new Set(r.fallbacks.map((f) => f.sex))].join('/') : '—',
          'any',
          r.source ? `\`${esc(r.source.printed)}\` ${esc(r.source.unit)}` : '—',
          r.source?.page ?? '—',
          r.verdict,
          esc(r.action),
          '',
        ].join(' | '),
      );
    }
  }
  p();

  p('## Demo seed values');
  p();
  p(
    'The demo was showing a chloride of 65 mmol/L, a white cell count and a neutrophil count of 19.5, and a weight of 17.3 kg. None of those is a result; they are a resuscitation, a haematology emergency and a toddler. Three separate causes, all fixed:',
  );
  p();
  p(
    "1. **The severity threshold is a multiple of the range WIDTH.** That is the right model for deriving a status and the wrong one for inventing a value: chloride's 13-wide band gives a threshold of 19.5, so \"significantly below\" lands at 65. The demo now carries an explicit outpatient envelope (`DEMO_ENVELOPE` in `demoSeedData.ts`) and a marker whose required excursion falls outside it is simply not chosen for that quota. The value is never clamped instead — a clamped value would compute to a different status than the one it was generated for, which is the agreement the demo tests exist to protect.",
  );
  p(
    "2. **The demo read its \"catalogue\" ranges out of the polluted `ReferenceRange` table**, so a synthetic band invented by a previous demo run came back as though it were the catalogue's. That is how Weight acquired a reference range of 2.5–7.5 kg. It now reads seeded rows only.",
  );
  p(
    '3. **Physical measurements have no reference range in the catalogue at all** — Randox measure weight, height, waist and pulse, they are not assays — so the demo fell back to a band hashed from the marker key, which gave waist circumference 13–38 cm. Those markers now take their synthetic band from the envelope instead, so it is at least on the right scale. They still need real ranges, and inventing them is not a session\'s to do.',
  );
  p();
  p('All five statuses are still demonstrated, and `tests/demoSeedData.test.ts` pins both properties at once: every generated value sits inside the envelope, AND still computes to the status it was asked for.');
  p();

  p('## For Richard, grouped by panel');
  p();
  p('Nothing on this list has been changed. Each group is one panel tier, innermost first.');
  for (const t of tierSummary) {
    const needs = t.members.filter((r) => r.verdict !== 'AGREES');
    if (needs.length === 0) continue;
    p();
    p(`### ${t.name}${t.code ? ` (${t.code})` : ''}`);
    p();
    const noFb = needs.filter((r) => r.verdict === 'NO FALLBACK');
    const unsrc = needs.filter((r) => r.verdict === 'UNSOURCED');
    const other = needs.filter((r) => r.verdict !== 'NO FALLBACK' && r.verdict !== 'UNSOURCED');
    if (other.length) {
      p('| Marker | Verdict | Why |');
      p('| --- | --- | --- |');
      for (const r of other) p(`| ${esc(r.name)} | ${r.verdict} | ${esc(r.action)} |`);
      p();
    }
    if (unsrc.length) {
      p(`- **${unsrc.length} with an unsourced fallback**, left exactly as they are: ${unsrc.map((r) => r.name).join(', ')}.`);
    }
    if (noFb.length) {
      p(`- **${noFb.length} with no fallback at all**, so the verify form suggests nothing: ${noFb.map((r) => r.name).join(', ')}.`);
    }
  }
  p();
  p('And one ask that is not per-marker:');
  p();
  p('- **The Randox Pathology Services Catalogue**, which is the document that would source every tier above Basic Screen, and **a female HSC5 example report**, which is what would settle the six sex-split rows the current report cannot arbitrate.');
  p();
  p(
    'The `ReferenceRange` schema change that used to sit here is done — see the section above. Everything left on this list needs a document, not code.',
  );
  p();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'));
  console.log(`Wrote ${OUT}`);
  console.log(
    `${rows.length} MEASURED markers. ${agrees.length} agree with a sourced Randox range, ${contradicted.length} contradicted and outstanding, ${unsourced.length} unsourced, ${noFallback.length} with no fallback. ` +
      `${sexFlagged.length} sex-dependent (${sexFlaggedNotSplit.length} stored as one ANY range), ${ageFlagged.length} age-dependent, 0 age-bracketed.`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
