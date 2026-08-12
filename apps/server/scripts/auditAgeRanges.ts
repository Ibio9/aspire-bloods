/**
 * The age-band audit.
 *
 *   npm run audit:age-ranges --workspace=apps/server
 *
 * A WORKSHEET, in the same shape as the sex-specific section of
 * `reference-ranges.md`: what is age-dependent, what is stored for it today,
 * how bad the mismatch is, and what to ask for. Read-only, like the other
 * three audits — it writes one markdown file and touches no data.
 *
 * WHAT IT IS FOR. `ReferenceRange.ageMin`/`ageMax` have existed since the
 * schema was written and `resolveReferenceRange()` already prefers a bracketed
 * row over an unbounded one, so the gap here is data rather than capability.
 * The point of the worksheet is to make the gap countable and specific enough
 * to put in an email to Randox, rather than leaving it as "some ranges vary
 * with age".
 *
 * IT NEVER PROPOSES A BAND. Every number in the output is one already in the
 * database. The `why` on each analyte is positional — what the age dependence
 * IS — and never an interval, because a range comes from a named document and
 * this script has none.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/db/client.js';
import {
  AGE_BANDED_RANGES,
  AWAITING_AGE_BAND,
  type AgeBandSeverity,
} from '../prisma/ageBandedReferenceRanges.js';

const OUT = path.resolve(process.cwd(), '../../docs/audits/age-specific-ranges.md');

const SEVERITY_HEADING: Record<AgeBandSeverity, string> = {
  UNUSABLE: 'An adult-wide band is close to meaningless',
  MISLEADING: 'An adult-wide band describes a population the patient may not be in',
  IMPRECISE: 'An adult-wide band is roughly right and measurably wrong',
};

function formatRange(row: { low: number; high: number; unit: string }): string {
  return `${row.low}–${row.high} ${row.unit}`;
}

async function main() {
  const keys = AWAITING_AGE_BAND.map((a) => a.markerKey);
  const markers = await prisma.marker.findMany({
    where: { key: { in: keys } },
    include: { referenceRanges: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
  });
  const byKey = new Map(markers.map((m) => [m.key, m]));

  // Every bracketed row in the WHOLE catalogue, not only on the fourteen — the
  // headline figure has to be a fact about the database rather than about this
  // list, or a band loaded somewhere else would go unreported.
  const bracketed = await prisma.referenceRange.count({
    where: { OR: [{ ageMin: { not: null } }, { ageMax: { not: null } }] },
  });
  const catalogueRows = await prisma.referenceRange.count();

  const lines: string[] = [];
  const now = new Date().toISOString().slice(0, 10);

  lines.push('# Age-specific reference ranges');
  lines.push('');
  lines.push(`Generated ${now} by \`npm run audit:age-ranges --workspace=apps/server\`. Read-only.`);
  lines.push('');
  lines.push('## The state of it');
  lines.push('');
  lines.push(`| | |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Analytes whose interval moves with age | **${AWAITING_AGE_BAND.length}** |`);
  lines.push(`| …of those, carrying an age bracket | **${bracketed === 0 ? '0' : String(bracketed)}** |`);
  lines.push(`| Age-banded rows loaded from a source | **${AGE_BANDED_RANGES.length}** |`);
  lines.push(`| Catalogue reference-range rows in total | ${catalogueRows} |`);
  lines.push('');
  lines.push(
    'The schema supports `ageMin` and `ageMax`, and `resolveReferenceRange()` already scores an age-bracketed row ' +
      'above an unbounded one. The capability is there and the data is not.',
  );
  lines.push('');
  lines.push('## Why none is loaded');
  lines.push('');
  lines.push(
    'A reference range comes from the result, then from a named published document with a citation on the row. ' +
      'Never from a session’s own knowledge, never extrapolated from a related marker. Every document this ' +
      'repository holds has been checked against that rule and none of them carries an age-banded interval:',
  );
  lines.push('');
  lines.push(
    '- `HSC5-Randox-Basic-Screen-Example-Report.pdf` is the only document in the tree with reference ranges in it ' +
      'at all. It prints one interval per analyte and does not say whose — not the age and not the sex.',
  );
  lines.push(
    '- The NHS Lothian document behind the sex-specific ranges is sex-specific by its own title and excludes ' +
      'hormones. It says nothing about age.',
  );
  lines.push(
    '- There is no API route to reference ranges. `GetTests` returns id, name, code, stabilityTime, sampleTubes, ' +
      'cost and currency; nothing in the OpenAPI spec returns an interval outside `GetOrderResultDetail`, which is ' +
      'per result.',
  );
  lines.push('');
  lines.push(
    '**Loading a partially-right set from memory would be the one change here capable of doing harm.** An ' +
      'age-banded row is MORE specific than the blanket one, so the resolver prefers it — a wrong specific answer ' +
      'beats a right general one every time.',
  );
  lines.push('');
  lines.push('## What to ask for');
  lines.push('');
  lines.push(
    '**The Randox Pathology Services Catalogue**, which is already outstanding for the sex-specific gap and for ' +
      'every panel tier above Basic Screen. Ask explicitly for the AGE BRACKETS as well as the sex splits: a ' +
      'catalogue that prints “adult” and nothing else does not close this.',
  );
  lines.push('');

  for (const severity of ['UNUSABLE', 'MISLEADING', 'IMPRECISE'] as AgeBandSeverity[]) {
    const group = AWAITING_AGE_BAND.filter((a) => a.severity === severity).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (group.length === 0) continue;
    lines.push(`## ${SEVERITY_HEADING[severity]} (${group.length})`);
    lines.push('');
    for (const entry of group) {
      const marker = byKey.get(entry.markerKey);
      lines.push(`### ${entry.name}`);
      lines.push('');
      if (!marker) {
        lines.push('- **No marker row** in this database for `' + entry.markerKey + '`.');
      } else {
        const rows = marker.referenceRanges;
        if (rows.length === 0) {
          lines.push('- **Stored today:** no catalogue range at all.');
        } else {
          for (const row of rows) {
            const bracket =
              row.ageMin === null && row.ageMax === null
                ? 'no age bracket'
                : `age ${row.ageMin ?? '–'} to ${row.ageMax ?? '–'}`;
            lines.push(
              `- **Stored today:** ${formatRange(row)} · sex ${row.sex} · ${bracket} · provenance \`${row.provenance}\``,
            );
          }
        }
      }
      lines.push(`- **Why age matters:** ${entry.why}`);
      lines.push('');
    }
  }

  lines.push('## The loader');
  lines.push('');
  lines.push(
    'Rows go in `apps/server/prisma/ageBandedReferenceRanges.ts` as `AGE_BANDED_RANGES`, in the same shape the ' +
      'sex-specific ranges use: the printed form exactly as the document has it, the stored form in our unit, the ' +
      'conversion factor between them as data where they differ, and the citation. ' +
      '`seedAgeBandedReferenceRanges()` in `prisma/seed.ts` writes them through `lib/catalogueRanges.ts`, which ' +
      'asserts the row it is about to touch is a catalogue row and not a patient’s own record, and refuses to ' +
      'overwrite a `RANDOX` range.',
  );
  lines.push('');
  lines.push(
    '**The blanket row is not deleted**, unlike the sex-specific loader’s. A sex split is exhaustive; a set of age ' +
      'brackets is not, and deleting the unbounded band would leave anybody outside the brackets with no ' +
      'suggestion at all.',
  );
  lines.push('');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
  console.log(
    `${AWAITING_AGE_BAND.length} age-dependent analyte(s), ${bracketed} bracketed row(s) in the catalogue, ` +
      `${AGE_BANDED_RANGES.length} sourced.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
