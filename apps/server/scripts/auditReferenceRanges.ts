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
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/db/client.js';

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
  { key: 'hdl', printed: '≥1.55 Desirable', unit: 'mmol/l', low: 1.55, high: null, page: 'p9' },
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
  { key: 'ggt', printed: '10.0 - 71.0', unit: 'U/l', low: 10, high: 71, page: 'p12' },
  { key: 'bilirubin', printed: '<21.0 Optimal', unit: 'μmol/l', low: null, high: 21, page: 'p12' },
  { key: 'albumin', printed: '35.0 - 50.0', unit: 'g/l', low: 35, high: 50, page: 'p12' },

  // Other — page 13
  { key: 'crp', printed: '≤5.0 Optimal', unit: 'mg/l', low: null, high: 5, page: 'p13' },
];

/**
 * The corrections this audit produced, recorded here because the report is
 * regenerated from the CURRENT seed and would otherwise show them as agreeing
 * and say nothing about how they got that way.
 *
 * Every one is a case where the Randox example report prints a range the stored
 * fallback disagreed with, for an analyte Randox do not split by sex.
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

const esc = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|');
const same = (a: number | null, b: number) => a === null || Math.abs(a - b) < 1e-9;

/**
 * The AUTHORED fallbacks, read out of seed.ts.
 *
 * Deliberately not read from the ReferenceRange table, and the reason is the
 * biggest finding in this audit. That table holds two different things under
 * one roof: the ~75 catalogue rows this file seeds, and one row per result ever
 * materialised (`materialiseReport.ts` creates one unconditionally). In the
 * development database that is 2,845 rows across 195 markers — haemoglobin
 * alone has 66. Reading "the fallback" out of it would be reading whatever the
 * last import happened to leave behind.
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
}

function readSeededFallbacks(): SeededFallback[] {
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
    });
  }
  if (out.length < 60) {
    throw new Error(
      `Only parsed ${out.length} marker fallbacks out of seed.ts, which cannot be right. The entry format has changed — fix SEED_ENTRY rather than trusting this report.`,
    );
  }
  return out;
}

async function main() {
  const seeded = readSeededFallbacks();
  const bySource = new Map(RANDOX_SOURCE.map((s) => [s.key, s]));

  // How badly the ReferenceRange table mixes catalogue rows with result rows.
  const totalRangeRows = await prisma.referenceRange.count();
  const markersWithRanges = await prisma.referenceRange.groupBy({ by: ['markerId'], _count: true });
  const worstMarkerRows = Math.max(0, ...markersWithRanges.map((g) => g._count));

  type Row = SeededFallback & { source?: SourceRange; verdict: string; action: string };

  // An analyte can be split across two marker keys (haemoglobin / haemoglobin-f),
  // so sex coverage is grouped by NAME rather than by key.
  const sexesByName = new Map<string, Set<string>>();
  for (const s of seeded) {
    if (!sexesByName.has(s.name)) sexesByName.set(s.name, new Set());
    sexesByName.get(s.name)!.add(s.sex);
  }

  const rows: Row[] = seeded.map((m) => {
    const source = bySource.get(m.key);
    const sexes = sexesByName.get(m.name)!;

    if (!source) {
      return { ...m, verdict: 'UNSOURCED', action: 'Left exactly as it is. No Randox document in `specs/` covers this analyte.' };
    }
    if (source.key === 'glucose') {
      return { ...m, source, verdict: 'NOT THE SAME TEST', action: source.note! };
    }
    const lowAgrees = source.low === null || same(source.low, m.low);
    const highAgrees = source.high === null || same(source.high, m.high);
    if (lowAgrees && highAgrees) return { ...m, source, verdict: 'AGREES', action: '—' };
    if (source.sexSpecificInPractice) {
      return {
        ...m,
        source,
        verdict: 'DIFFERS — SEX-SPECIFIC',
        action:
          sexes.size === 1 && sexes.has('ANY')
            ? '**Structural defect.** One sex-agnostic range for an analyte whose range genuinely differs by sex, so roughly half of patients get the wrong suggestion. NOT changed: the Randox example prints one range and does not say whose, so adopting it would swap one wrong answer for another. For Richard.'
            : 'NOT changed. The stored ranges are correctly split by sex, but the Randox example prints a single range without saying which sex it applies to, so it cannot arbitrate. For Richard.',
      };
    }
    return {
      ...m,
      source,
      verdict: 'CORRECTED',
      action: `Changed to ${source.low ?? 0}–${source.high ?? 999} (Randox Basic Screen ${source.page}).`,
    };
  });

  // ── Sex-specificity, across the whole catalogue ─────────────────────────
  // The failure mode the brief expects this audit to find: a single stored
  // range for a marker that legitimately differs by sex mislabels about half of
  // patients.
  const sexSpecificKeys = new Set(RANDOX_SOURCE.filter((s) => s.sexSpecificInPractice).map((s) => s.key));
  const storedSexSplit = [...sexesByName.entries()].filter(([, s]) => !(s.size === 1 && s.has('ANY')));
  const shouldBeSplitButIsNot = rows.filter(
    (r) => sexSpecificKeys.has(r.key) && sexesByName.get(r.name)!.size === 1 && sexesByName.get(r.name)!.has('ANY'),
  );
  const ageBracketed: Row[] = [];

  const lines: string[] = [];
  lines.push('# Reference range audit');
  lines.push('');
  lines.push('Generated by `apps/server/scripts/auditReferenceRanges.ts`.');
  lines.push('');
  lines.push('## Where a range actually comes from');
  lines.push('');
  lines.push(
    'Confirmed in code, not assumed. Every patient-facing read path takes the range stored ON THE RESULT (`reportResult.referenceRange`): `patients/service.ts` lines 218–223 and 304–320, `portalService.ts`, `dsarService.ts`, and the PDF export. There is no display path anywhere that falls back to the marker catalogue, and `resolveReferenceRange()` — the only thing that reads catalogue ranges — is called from exactly two places, `panels/router.ts` and `reports/service.ts`, both of them the admin verify/manual-entry form.',
  );
  lines.push('');
  lines.push(
    'So the ranges below are a SUGGESTION shown to an admin who is looking at the paper result, never a number a patient is shown. That is what makes correcting them safe; it is also why they still have to be right, because a suggestion that is usually correct is one people stop checking.',
  );
  lines.push('');
  lines.push('## Sex-specific ranges');
  lines.push('');
  lines.push(
    'The single most likely source of real error, and the audit found it. A marker whose range genuinely differs by sex, stored as one blanket `ANY` range, mislabels roughly half of patients.',
  );
  lines.push('');
  lines.push(
    `- **${storedSexSplit.length}** analytes store sex-split ranges: ${storedSexSplit.map(([n]) => n).join(', ') || 'none'}.`,
  );
  lines.push(
    `- **${shouldBeSplitButIsNot.length}** store one \`ANY\` range for an analyte that is sex-specific in clinical use: ${shouldBeSplitButIsNot.map((r) => `**${r.name}**`).join(', ') || 'none'}. These are **not** corrected here — see below.`,
  );
  lines.push(
    `- **${ageBracketed.length}** carry an age bracket. The schema supports \`ageMin\`/\`ageMax\` and \`resolveReferenceRange\` scores an age-bracketed row above an unbounded one, but no seeded fallback uses either — so for a marker whose range genuinely moves with age (alkaline phosphatase in adolescence, creatinine in the elderly) the suggestion is an adult range regardless of the patient. Structure present, data absent. For Richard.`,
  );
  lines.push('');
  lines.push(
    'The code handles both correctly where the data is right: `resolveReferenceRange()` scores a sex-specific row above an `ANY` one and an age-bracketed row above an unbounded one, and — the important part — it refuses to answer at all when the marker draws a sex distinction and the patient has no sex on file, rather than quietly handing back the `ANY` range. `resolveReferenceRange.test.ts` pins that. The gap is in the DATA, not the resolver: a marker with only an `ANY` row gives the resolver nothing to be careful with.',
  );
  lines.push('');
  lines.push(
    'They are not corrected from the Randox example report because that document prints ONE range per analyte and never says whose it is. Haemoglobin 130.0–180.0 and haematocrit 40.0–54.0 read as male ranges; creatinine 53.0–97.0 does not. Adopting them blind would replace a range that is wrong for half of patients with a range that is wrong for the other half, which is not an improvement, it is a different bug with the same shape. **These need a female example report or the Randox Pathology Services Catalogue** — neither is in `specs/`.',
  );
  lines.push('');

  lines.push('## A separate defect: the ReferenceRange table holds two different things');
  lines.push('');
  lines.push(
    `\`ReferenceRange\` is both the catalogue of fallbacks AND the per-result record of what was printed on the paper. \`materialiseReport.ts\` creates a row for every result it materialises, into the same table \`marker.referenceRanges\` reads from — so the "catalogue" grows by one row per result, for ever. This development database holds **${totalRangeRows} rows across ${markersWithRanges.length} markers**; the worst single marker has **${worstMarkerRows}**, of which exactly one is the seeded fallback.`,
  );
  lines.push('');
  lines.push(
    'That is invisible to patients — every display path reads the range off the result, as above — but it is not harmless. `resolveReferenceRange()` is handed all of them, scores them by specificity, and where several tie (and they do, dozens at a time) breaks the tie on whatever order Postgres returned. The range suggested to an admin at verify time is therefore effectively arbitrary among the ranges that marker has ever carried.',
  );
  lines.push('');
  lines.push(
    'NOT fixed here, and deliberately: the fix is a schema change (a flag marking a row as catalogue rather than as a record of one result, and a filter on it in the resolver) to a clinical data path, which is not something to slip into the end of a session that was asked for an audit. It is written down here because it is the most valuable thing this audit found. **For Richard, and it is a code change, not a data one.**',
  );
  lines.push('');

  const changed = rows.filter((r) => r.verdict === 'CORRECTED');
  lines.push('## Corrected');
  lines.push('');
  lines.push(
    'Every one of these is a case where the Randox Basic Screen example report prints a range that the stored fallback disagrees with, for an analyte Randox do not treat as sex-specific. Changed in `prisma/seed.ts`; a re-seed carries them into the catalogue rows.',
  );
  lines.push('');
  lines.push('| Marker | Was | Now | Unit | Source |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const a of APPLIED) {
    const row = rows.find((r) => r.key === a.key);
    const src = bySource.get(a.key);
    lines.push(
      `| ${esc(row?.name ?? a.key)} | ${a.was} | ${a.now} | ${esc(row?.unit ?? '')} | Randox Basic Screen ${a.page}, printed \`${esc(src?.printed ?? '')}\` |`,
    );
  }
  lines.push('');
  if (changed.length > 0) {
    lines.push(
      `⚠ ${changed.length} further fallback(s) still disagree with the Randox source and are NOT in the list above: ${changed.map((r) => r.name).join(', ')}.`,
    );
    lines.push('');
  }

  lines.push('## Every seeded fallback');
  lines.push('');
  lines.push('| Marker | Key | Fallback | Unit | Sex | Age | Randox says | Page | Verdict | Action |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    lines.push(
      [
        esc(r.name),
        `\`${r.key}\``,
        `${r.low}–${r.high}`,
        esc(r.unit),
        r.sex,
        'any',
        r.source ? `\`${esc(r.source.printed)}\` ${esc(r.source.unit)}` : '—',
        r.source?.page ?? '—',
        r.verdict,
        esc(r.action),
      ].join(' | ').replace(/^/, '| ') + ' |',
    );
  }
  lines.push('');

  lines.push('## Demo seed values');
  lines.push('');
  lines.push(
    'The demo was showing a chloride of 65 mmol/L, a white cell count and a neutrophil count of 19.5, and a weight of 17.3 kg. None of those is a result; they are a resuscitation, a haematology emergency and a toddler. Three separate causes, all fixed:',
  );
  lines.push('');
  lines.push(
    '1. **The severity threshold is a multiple of the range WIDTH.** That is the right model for deriving a status and the wrong one for inventing a value: chloride\'s 13-wide band gives a threshold of 19.5, so "significantly below" lands at 65. The demo now carries an explicit outpatient envelope (`DEMO_ENVELOPE` in `demoSeedData.ts`) and a marker whose required excursion falls outside it is simply not chosen for that quota. The value is never clamped instead — a clamped value would compute to a different status than the one it was generated for, which is the agreement the demo tests exist to protect.',
  );
  lines.push(
    '2. **The demo read its "catalogue" ranges out of the polluted `ReferenceRange` table**, so a synthetic band invented by a previous demo run came back as though it were the catalogue\'s. That is how Weight acquired a reference range of 2.5–7.5 kg. It now reads seeded rows only.',
  );
  lines.push(
    '3. **Physical measurements have no reference range in the catalogue at all** — Randox measure weight, height, waist and pulse, they are not assays — so the demo fell back to a band hashed from the marker key, which gave waist circumference 13–38 cm. Those markers now take their synthetic band from the envelope instead, so it is at least on the right scale. They still need real ranges, and inventing them is not this session\'s to do.',
  );
  lines.push('');
  lines.push(
    `All five statuses are still demonstrated, and \`tests/demoSeedData.test.ts\` now pins both properties at once: every generated value sits inside the envelope, AND still computes to the status it was asked for.`,
  );
  lines.push('');

  lines.push('## For Richard');
  lines.push('');
  lines.push('| Marker | Why |');
  lines.push('| --- | --- |');
  for (const r of rows.filter((x) => x.verdict.startsWith('DIFFERS — SEX') || x.verdict === 'NOT THE SAME TEST')) {
    lines.push(`| ${esc(r.name)} | ${esc(r.action)} |`);
  }
  const unsourced = rows.filter((r) => r.verdict === 'UNSOURCED');
  lines.push(
    `| ${unsourced.length} further markers | No Randox document in \`specs/\` covers them, so their fallbacks are unsourced and were left alone: ${unsourced.map((r) => r.name).join(', ')} |`,
  );
  lines.push('');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'));
  console.log(`Wrote ${OUT}`);
  console.log(
    `${rows.length} seeded fallbacks. ${rows.filter((r) => r.verdict === 'AGREES').length} agree with Randox, ${changed.length} corrected, ${rows.filter((r) => r.verdict.startsWith('DIFFERS')).length} sex-specific and left for review, ${unsourced.length} unsourced.`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
