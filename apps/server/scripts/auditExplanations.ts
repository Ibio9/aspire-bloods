/**
 * The marker-explanation audit.
 *
 *   npm run audit:explanations --workspace=apps/server
 *
 * ─── WHY THIS EXISTS BEFORE ANY REWRITING DOES ────────────────────────────
 *
 * There are roughly 350 patient-facing marker explanations in this database and
 * NOT ONE of them has been signed off by a clinician. They were written by an
 * assistant. The correct response to "some of them look wrong" is therefore not
 * to write better ones — adding unreviewed clinical text on top of unreviewed
 * clinical text does not improve the situation, it just moves it — but to
 * produce a list somebody qualified can work through.
 *
 * So this script only ever READS. It writes one markdown report to
 * docs/audits/marker-explanations.md and changes nothing in the database. The
 * punctuation-only corrections that ARE safe to make without review are applied
 * elsewhere, by the seed's own house-style sweep (see lib/houseStyle.ts), which
 * is constrained so that no word can change.
 *
 * ─── WHAT IT LOOKS FOR ────────────────────────────────────────────────────
 *
 *  · DUPLICATES. Two markers carrying the same words. Some are legitimate — the
 *    same analyte appears in the catalogue under two names, and both entries
 *    describing it identically is correct. Others are authoring errors, where a
 *    sentence about one analyte has been pasted onto another. The script cannot
 *    tell those apart and does not try: it groups them and says which kind each
 *    looks like from the marker names, and a person decides.
 *  · WRONG ANALYTE. A heuristic only, and a deliberately crude one: if the
 *    explanation names a DIFFERENT marker in the catalogue and never mentions
 *    its own, that is worth a human look. It produces false positives (a
 *    sentence about ferritin legitimately mentions iron) and they are cheaper
 *    than a miss.
 *  · UNITS IN PROSE. An explanation that states a unit or a number is making a
 *    claim about a range, and ranges live on the result, not in the copy.
 *  · NON-DIAGNOSTIC VOCABULARY. The product's hard rule: nothing is good, bad,
 *    healthy, unhealthy, normal, abnormal, concerning or dangerous, and nothing
 *    tells anybody to do anything. A breach here is a copy defect rather than a
 *    clinical judgement, so these are listed as safe to fix.
 *  · THIN OR TEMPLATED. Very short entries, and entries whose opening is shared
 *    with many others, which is what a filled-in template looks like.
 *  · REVIEW STATE. Which are DRAFT, which claim to be reviewed, and by whom.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/db/client.js';
import { VOCABULARY_CORRECTIONS } from '../src/lib/houseStyle.js';

const OUT = path.resolve(process.cwd(), '../../docs/audits/marker-explanations.md');

/**
 * Words the product must never use ABOUT A RESULT OR A LEVEL.
 *
 * The qualifier is the whole rule and the first version of this check ignored
 * it, which made the report useless: a bare /healthy/ flagged "good dietary
 * sources" and "poor absorption" alongside the genuine breaches, and 17
 * entries needed reading to find 6 that mattered. A food can be a good source
 * of zinc and absorption can be poor; what the rule forbids is calling a
 * RESULT good, bad, healthy or normal. So the word only counts when it sits
 * next to one of the nouns below.
 */
const BANNED = [
  'healthy',
  'unhealthy',
  'good',
  'bad',
  'normal',
  'abnormal',
  'concerning',
  'worrying',
  'dangerous',
  'risky',
  'poor',
  'excellent',
  'ideal',
];
const ABOUT_A_RESULT = '(levels?|results?|values?|readings?|ranges?|counts?)';
/** An instruction to the reader. Forbidden regardless of what it is about. */
const IMPERATIVES = ['you should', 'you must', 'you need to', 'make sure you', 'aim for', 'be sure to'];

/** A number with a unit after it, or a bare unit, inside prose. */
const UNIT_IN_PROSE =
  /\b\d+(\.\d+)?\s?(mmol\/L|µmol\/L|umol\/L|mg\/L|µg\/L|ug\/L|ng\/L|ng\/mL|g\/L|IU\/L|U\/L|mIU\/L|pmol\/L|nmol\/L|fL|pg|%|10\^\d+\/L)\b/i;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Dice coefficient over word bigrams. Cheap, and good enough to group near-identical prose. */
function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const w = s.split(' ').filter(Boolean);
    const out = new Set<string>();
    for (let i = 0; i < w.length - 1; i += 1) out.add(`${w[i]} ${w[i + 1]}`);
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return a === b ? 1 : 0;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared += 1;
  return (2 * shared) / (ga.size + gb.size);
}

const esc = (s: string | null | undefined) => (s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');

async function main() {
  const rows = await prisma.markerExplanation.findMany({
    include: {
      marker: {
        include: {
          panels: { include: { panel: { select: { name: true } } } },
          categories: { include: { category: { select: { name: true } } } },
        },
      },
      // reviewedById is a bare FK on the model; the user is fetched separately below.
    },
    orderBy: { marker: { name: 'asc' } },
  });

  const reviewerIds = [...new Set(rows.map((r) => r.reviewedById).filter((x): x is string => !!x))];
  const reviewers = reviewerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, email: true, staffProfile: { select: { firstName: true, lastName: true } } },
      })
    : [];
  const reviewerName = new Map(
    reviewers.map((u) => [
      u.id,
      u.staffProfile ? `${u.staffProfile.firstName} ${u.staffProfile.lastName}` : u.email,
    ]),
  );

  const markerNames = rows.map((r) => ({ id: r.markerId, name: r.marker.name, norm: norm(r.marker.name) }));

  type Entry = (typeof rows)[number] & {
    body: string;
    normBody: string;
    /** The body with this marker's own name removed — see the grouping note below. */
    stripped?: string;
    chars: number;
    group?: number;
    flags: string[];
  };

  const entries: Entry[] = rows.map((r) => {
    const body = [r.whatItIs, r.highMeans, r.lowMeans, r.lifestyleContext].filter(Boolean).join(' ');
    return { ...r, body, normBody: norm(body), chars: body.length, flags: [] };
  });

  // ── Template families, then duplicates ──────────────────────────────────
  //
  // The order matters, and getting it wrong makes the whole report useless.
  // The 207 food-sensitivity items share one sentence with the food's name
  // substituted into it, so a naive similarity pass puts all 207 in a single
  // "duplicate group" — which is technically true, entirely unactionable, and
  // buries the two or three groups somebody actually needs to look at.
  //
  // A TEMPLATE FAMILY is copy that is identical once each entry's own marker
  // name is removed from it. That is a deliberate pattern, not an error, and it
  // is reported as one line saying how many share it.
  //
  // A DUPLICATE is copy that is still near-identical AFTER that removal, i.e.
  // two markers whose explanations do not distinguish them at all. That is
  // either the same analyte under two names (fine, and named as such) or a
  // sentence pasted onto the wrong marker (not fine).
  const withoutOwnName = (e: Entry) => {
    let s = e.normBody;
    for (const w of norm(e.marker.name).split(' ')) {
      if (w.length > 2) s = s.split(w).join(' ');
    }
    return s.replace(/\s+/g, ' ').trim();
  };
  for (const e of entries) e.stripped = withoutOwnName(e);

  const families = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.stripped!;
    families.set(key, [...(families.get(key) ?? []), e]);
  }
  const templateFamilies = [...families.entries()].filter(([, m]) => m.length > 2);
  const inTemplate = new Set(templateFamilies.flatMap(([, m]) => m.map((x) => x.id)));
  for (const [, members] of templateFamilies) for (const m of members) m.flags.push('TEMPLATE-FAMILY');

  let nextGroup = 1;
  const candidates = entries.filter((e) => !inTemplate.has(e.id));
  for (let i = 0; i < candidates.length; i += 1) {
    if (candidates[i].group) continue;
    let assigned = false;
    for (let j = i + 1; j < candidates.length; j += 1) {
      if (candidates[j].group) continue;
      const s = similarity(candidates[i].stripped!, candidates[j].stripped!);
      if (s < 0.85) continue;
      if (!assigned) {
        candidates[i].group = nextGroup;
        assigned = true;
      }
      candidates[j].group = nextGroup;
    }
    if (assigned) nextGroup += 1;
  }

  // ── Per-entry flags ─────────────────────────────────────────────────────
  const openings = new Map<string, number>();
  for (const e of entries) {
    const opening = e.normBody.split(' ').slice(0, 6).join(' ');
    openings.set(opening, (openings.get(opening) ?? 0) + 1);
  }

  for (const e of entries) {
    if (e.chars < 90) e.flags.push('SHORT');
    const opening = e.normBody.split(' ').slice(0, 6).join(' ');
    if ((openings.get(opening) ?? 0) > 3) e.flags.push('TEMPLATED');

    // Already corrected by the fixed table? Then say so rather than flagging it
    // as outstanding — running this script after a seed should show the list
    // shrinking, and a flag that never clears is a flag nobody reads.
    const autoFixable = VOCABULARY_CORRECTIONS.filter(([from]) => e.body.includes(from)).map(([from]) => from);
    if (autoFixable.length) e.flags.push(`VOCABULARY-AUTOFIX(${autoFixable.join('; ')})`);

    const banned = BANNED.filter((w) =>
      new RegExp(`\\b${w}\\s+${ABOUT_A_RESULT}\\b|\\b${ABOUT_A_RESULT}\\s+(are|is|were|was)\\s+${w}\\b`, 'i').test(e.body),
    );
    const imperatives = IMPERATIVES.filter((p) => e.body.toLowerCase().includes(p));
    if (banned.length || imperatives.length) {
      e.flags.push(`VOCABULARY(${[...banned, ...imperatives].join(', ')})`);
    }

    if (UNIT_IN_PROSE.test(e.body)) e.flags.push('UNITS-IN-PROSE');

    // Does the copy name a different marker and never its own?
    const own = markerNames.find((m) => m.id === e.markerId)!;
    const ownWords = own.norm.split(' ').filter((w) => w.length > 3);
    const mentionsOwn = ownWords.some((w) => e.normBody.includes(w));
    const others = markerNames
      .filter((m) => m.id !== e.markerId && m.norm.length > 8)
      .filter((m) => e.normBody.includes(` ${m.norm} `))
      .map((m) => m.name);
    if (!mentionsOwn && others.length) e.flags.push(`CROSS-REFERENCES(${others.slice(0, 2).join('; ')})`);
  }

  // ── Report ──────────────────────────────────────────────────────────────
  const groups = new Map<number, Entry[]>();
  for (const e of entries) if (e.group) groups.set(e.group, [...(groups.get(e.group) ?? []), e]);

  const flagged = entries.filter((e) => e.flags.length);
  const reviewed = entries.filter((e) => e.reviewStatus !== 'DRAFT');

  // A review attributed to a seeded demo account is not a review. That
  // distinction is the single most important line in this report.
  const SEEDED_REVIEWERS = ['Chloe Clinician'];
  const seededReviews = reviewed.filter((e) =>
    SEEDED_REVIEWERS.includes(reviewerName.get(e.reviewedById ?? '') ?? ''),
  );
  const realReviews = reviewed.length - seededReviews.length;

  const lines: string[] = [];
  lines.push('# Marker explanation audit');
  lines.push('');
  lines.push(
    'Generated by `apps/server/scripts/auditExplanations.ts` against the seeded development database. **Read-only** — the script is run before anything is changed and changes nothing itself. The full per-marker table is `marker-explanations.csv` beside this file; this document is the analysis.',
  );
  lines.push('');
  lines.push('## The headline');
  lines.push('');
  lines.push(`- **${entries.length}** markers carry an explanation.`);
  lines.push(
    `- **${realReviews}** have been read and signed off by a real clinician.` +
      (seededReviews.length
        ? ` ${reviewed.length} rows carry a review record, but ${seededReviews.length} of them name **${SEEDED_REVIEWERS.join(', ')}** — the fictional staff account \`prisma/seed.ts\` creates for the demo. A review attributed to a seeded account is not a review, and those ${seededReviews.length} markers should be treated exactly like the DRAFT ones.`
        : ''),
  );
  lines.push(
    `- **${templateFamilies.length}** template families (one sentence reused across many markers with the marker's own name substituted in), covering ${[...inTemplate].length} markers. This is a pattern, not a defect.`,
  );
  lines.push(
    `- **${groups.size}** genuine duplicate groups — copy still near-identical after each marker's own name is removed, so nothing in it distinguishes the two markers.`,
  );
  lines.push(`- **${flagged.length}** entries carry at least one flag.`);
  lines.push('');
  lines.push('## What this report does and does not do');
  lines.push('');
  lines.push(
    'Nothing here is a rewrite, and that is the point. Roughly 350 of these explanations were written by an assistant and none has been through a clinician. Replacing text that looks wrong with more text nobody has reviewed does not reduce the risk, it relabels it. So:',
  );
  lines.push('');
  lines.push(
    '- **Clinical defects are flagged and listed, never rewritten.** Wrong analyte, wrong direction of effect, a reference range stated in prose. These go on the list for Richard at the foot of this file.',
  );
  lines.push(
    '- **Copy defects are fixed directly**, because they cannot change what a sentence means: punctuation, dashes, apostrophes, capitalisation, trailing whitespace, and language that breaches the non-diagnostic vocabulary rule. The mechanism is the seed\'s house-style sweep (`src/lib/houseStyle.ts`), which is constrained so that no word can be added, removed or reordered, and every reviewed row it touches gets an audit entry.',
  );
  lines.push('');

  lines.push('## Genuine duplicates');
  lines.push('');
  if (groups.size === 0) {
    lines.push('None.');
  } else {
    lines.push(
      'Copy that still fails to distinguish two markers once each marker\'s own name is removed from it. Legitimate where they are the same analyte under two names; an authoring error otherwise. The verdict column is a guess from the names and needs a human.',
    );
    lines.push('');
    lines.push('| Group | Markers | Verdict | Text |');
    lines.push('| --- | --- | --- | --- |');
    for (const [g, members] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const names = members.map((m) => m.marker.name);
      const sameAnalyte = names.some(
        (n, i) => i > 0 && (norm(n).includes(norm(names[0])) || norm(names[0]).includes(norm(n))),
      );
      lines.push(
        `| ${g} | ${names.map((n) => `\`${n}\``).join(', ')} | ${sameAnalyte ? 'Same analyte under two names — leave as it is' : '**REVIEW** — different analytes sharing one description'} | ${esc(members[0].body).slice(0, 200)}… |`,
      );
    }
  }
  lines.push('');

  lines.push('## Template families');
  lines.push('');
  lines.push(
    'One sentence, reused with the marker\'s name substituted. Correct for the food-sensitivity and microbiome sections, where 207 items would otherwise need 207 individually-authored sentences saying the same true thing — and where the honest sentence really is the same one. Listed so nobody mistakes it for 207 duplicates.',
  );
  lines.push('');
  lines.push('| Markers | Result type | Example |');
  lines.push('| --- | --- | --- |');
  for (const [, members] of templateFamilies.sort((a, b) => b[1].length - a[1].length)) {
    lines.push(
      `| ${members.length} | ${[...new Set(members.map((m) => m.marker.resultType))].join(', ')} | ${esc(members[0].marker.name)}: ${esc(members[0].body).slice(0, 170)}… |`,
    );
  }
  lines.push('');

  lines.push('## Flagged entries');
  lines.push('');
  lines.push('Flag meanings:');
  lines.push('');
  lines.push(
    '- `VOCABULARY-AUTOFIX(...)` — an exact phrase in the correction table (`VOCABULARY_CORRECTIONS`, lib/houseStyle.ts). Already corrected in the seed source; the stored row is corrected on the next seed run. Listed so the change is visible, not because it is outstanding.',
  );
  lines.push(
    '- `VOCABULARY(...)` — a banned word describing a result, level or count, or an instruction to the reader. **Not** every appearance of the word: "good dietary sources" and "poor absorption" are not breaches, and flagging them buried the ones that were. **For review** — the substitution is a wording decision.',
  );
  lines.push('- `UNITS-IN-PROSE` — states a number or a unit, which is a claim about a range. Ranges live on the result. **For review.**');
  lines.push(
    "- `CROSS-REFERENCES(...)` — the copy names another catalogue marker and never its own. Usually legitimate: a marker is often best explained by its neighbours, and repeating its own name in its own description is worse copy, not better. Occasionally it is a sentence pasted onto the wrong marker. **Listed for a skim, not treated as a defect** — the heuristic is noisy and saying so is more useful than pretending it is not.",
  );
  lines.push('- `SHORT` — under 90 characters. Not wrong, but thin.');
  lines.push('- `TEMPLATED` / `TEMPLATE-FAMILY` — shares its opening or its whole body with others.');
  lines.push('');
  if (flagged.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Marker | Code | Type | Panels | Flags | Chars | Review record |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const e of flagged.filter((f) => !f.flags.every((x) => x === 'TEMPLATE-FAMILY'))) {
      const who = reviewerName.get(e.reviewedById ?? '');
      lines.push(
        `| ${esc(e.marker.name)} | ${e.marker.randoxCode ?? '—'} | ${e.marker.resultType} | ${esc(
          e.marker.panels.map((p) => p.panel.name).join(', ') || '—',
        )} | ${esc(e.flags.join('<br>'))} | ${e.chars} | ${
          e.reviewStatus === 'DRAFT'
            ? 'none'
            : `${e.reviewStatus} — ${who}${who && SEEDED_REVIEWERS.includes(who) ? ' (seeded demo account, not a real review)' : ''}`
        } |`,
      );
    }
  }
  lines.push('');

  lines.push('## Fixed without review');
  lines.push('');
  lines.push(
    'Punctuation, in the seed source and, on the next seed run, in stored copy: spaced em dashes replaced with a full stop or a comma, straight apostrophes curled, en dashes joining two words hyphenated (`acid–base` → `acid-base`). No word changes; `houseStyle.test.ts` asserts that property directly.',
  );
  lines.push('');
  lines.push('And these phrase substitutions, from the fixed table in `lib/houseStyle.ts`:');
  lines.push('');
  lines.push('| Was | Is now | Why |');
  lines.push('| --- | --- | --- |');
  for (const [from, to] of VOCABULARY_CORRECTIONS) {
    lines.push(`| ${esc(from)} | ${esc(to)} | Restates the same fact in the product's own vocabulary |`);
  }
  lines.push('');
  lines.push(
    'Nothing else was changed. In particular `"good" cholesterol` and `"bad" cholesterol` were LEFT ALONE: those are the colloquial names for HDL and LDL, they are already in quotation marks marking them as such, and replacing a term patients recognise is a copy decision with clinical consequences rather than a style correction.',
  );
  lines.push('');

  lines.push('## For Richard');
  lines.push('');
  lines.push('Everything on this list needs clinical wording that a session cannot write.');
  lines.push('');
  const needsClinician = (f: string) =>
    f.startsWith('VOCABULARY(') || f === 'UNITS-IN-PROSE' || f === 'SHORT';
  const forRichard = flagged.filter((e) => e.flags.some(needsClinician));
  lines.push('| Marker | Why | Current text |');
  lines.push('| --- | --- | --- |');
  for (const e of forRichard) {
    lines.push(
      `| ${esc(e.marker.name)} | ${esc(e.flags.filter(needsClinician).join('; '))} | ${esc(e.body).slice(0, 220)} |`,
    );
  }
  for (const [g, members] of groups.entries()) {
    const names = members.map((m) => m.marker.name);
    const sameAnalyte = names.some(
      (n, i) => i > 0 && (norm(n).includes(norm(names[0])) || norm(names[0]).includes(norm(n))),
    );
    if (sameAnalyte) continue;
    lines.push(
      `| ${names.map((n) => esc(n)).join(' + ')} | Duplicate group ${g}: two different analytes share one description, so neither is described | ${esc(members[0].body).slice(0, 220)} |`,
    );
  }
  lines.push('');
  lines.push(
    `Beyond this list: all ${entries.length} explanations need a clinician's eye before any of them can honestly be described as reviewed, and the ${seededReviews.length} rows currently marked PUBLISHED by a seeded account are the most misleading of them, because the product reports them as checked.`,
  );
  lines.push('');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'));

  // The full table, as a spreadsheet rather than as 443 rows of markdown.
  const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const csv = [
    [
      'marker',
      'key',
      'randoxCode',
      'resultType',
      'panels',
      'healthAreas',
      'duplicateGroup',
      'templateFamily',
      'reviewStatus',
      'reviewedBy',
      'chars',
      'flags',
      'whatItIs',
      'highMeans',
      'lowMeans',
      'lifestyleContext',
    ].join(','),
    ...entries.map((e) =>
      [
        e.marker.name,
        e.marker.key,
        e.marker.randoxCode ?? '',
        e.marker.resultType,
        e.marker.panels.map((p) => p.panel.name).join('; '),
        e.marker.categories.map((c) => c.category.name).join('; '),
        e.group ?? '',
        e.flags.includes('TEMPLATE-FAMILY') ? 'yes' : '',
        e.reviewStatus,
        reviewerName.get(e.reviewedById ?? '') ?? '',
        e.chars,
        e.flags.join('; '),
        e.whatItIs,
        e.highMeans ?? '',
        e.lowMeans ?? '',
        e.lifestyleContext ?? '',
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT.replace(/\.md$/, '.csv'), csv);

  console.log(`Wrote ${OUT} and ${OUT.replace(/\.md$/, '.csv')}`);
  console.log(
    `${entries.length} explanations, ${templateFamilies.length} template families, ${groups.size} duplicate groups, ${flagged.length} flagged, ${realReviews} genuinely clinician-reviewed.`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
