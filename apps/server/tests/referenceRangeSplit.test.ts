import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import {
  assertCatalogueRange,
  CatalogueRangeError,
  createCatalogueRange,
  deleteCatalogueRange,
  findCatalogueRange,
  updateCatalogueRange,
  type CatalogueDb,
} from '../src/lib/catalogueRanges.js';
import { resolveReferenceRange, type CatalogRange } from '../src/lib/resolveReferenceRange.js';
import { createFakePrisma } from './support/fakePrisma.js';

/**
 * THE CATALOGUE AND THE PER-RESULT RECORD ARE TWO THINGS.
 *
 * They were one table, and it was not a tidiness complaint: a seeder's
 * `findFirst` on marker-and-sex lands on a record of what one patient's
 * laboratory printed far more often than on the catalogue row it meant — 3,080
 * of the former against 89 of the latter at the split — so correcting a
 * fallback rewrote patients' history to say their laboratory printed a range it
 * did not. Ten rows went that way in a single run.
 *
 * The separation is not something a reader can see. That is exactly why it
 * needs tests: everything looks right either way, right up until a range on
 * somebody's report changes underneath them.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../src');
const SERVER = path.resolve(here, '..');

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function rel(file: string): string {
  return path.relative(SERVER, file).replace(/\\/g, '/');
}

describe('the two tables are separate in the schema', () => {
  const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));

  it('gives a result its own range record, not a catalogue row', () => {
    const field = models.get('ReportResult')!.fields.find((f) => f.name === 'referenceRange');
    expect(field?.type).toBe('ResultReferenceRange');
  });

  it('leaves the catalogue with no way to reach a result at all', () => {
    // The relation is what made the mistake expressible. Without it,
    // `prisma.referenceRange` cannot read, write or even count a result's
    // record, and `results: { none: {} }` is not a query anybody can write.
    const relations = models
      .get('ReferenceRange')!
      .fields.filter((f) => f.kind === 'object')
      .map((f) => f.type);
    expect(relations).toEqual(['Marker']);
  });

  it('gives a marker the catalogue, and the per-result records separately', () => {
    const marker = models.get('Marker')!;
    const catalogue = marker.fields.find((f) => f.name === 'referenceRanges');
    const records = marker.fields.find((f) => f.name === 'resultRanges');
    expect(catalogue?.type).toBe('ReferenceRange');
    expect(records?.type).toBe('ResultReferenceRange');
  });

  it('binds one record to one result, in the database and not merely in the code', () => {
    // "verifyReport creates one per result and never shares them" was true of
    // the implementation and not a fact about the data. A shared record is a
    // correction to one patient's report reaching another's.
    const field = models.get('ReportResult')!.fields.find((f) => f.name === 'referenceRangeId');
    expect(field?.isUnique).toBe(true);
  });

  it('keeps a per-result record out of the citation business', () => {
    // A result record's authority is "the laboratory printed this, on this
    // report". There is no document to cite and no column to put one in.
    const names = models.get('ResultReferenceRange')!.fields.map((f) => f.name);
    expect(names).not.toContain('sourceDocument');
    expect(names).not.toContain('sourceUrl');
    // provenance survives, because four rows carry a repair note and are
    // marked UNSOURCED deliberately — that marking is the record of an
    // incident and must not be dropped by tidying.
    expect(names).toContain('provenance');
  });
});

describe('only the catalogue module writes a catalogue row', () => {
  const WRITE = /\breferenceRange\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;

  it('has no direct catalogue write anywhere else in src, prisma or scripts', () => {
    const files = [
      ...tsFilesUnder(SRC),
      ...tsFilesUnder(path.join(SERVER, 'prisma')).filter((f) => !f.includes('migrations')),
      ...tsFilesUnder(path.join(SERVER, 'scripts')),
    ];
    const writers = files
      .filter((f) => {
        // `resultReferenceRange.create` contains `referenceRange.create`, and
        // that is a different table entirely — anchor on the word boundary.
        const text = fs.readFileSync(f, 'utf8').replace(/\bresultReferenceRange\./g, 'RESULT_TABLE.');
        return WRITE.test(text);
      })
      .map(rel)
      .sort();
    expect(writers).toEqual(['src/lib/catalogueRanges.ts']);
  });

  it('writes a per-result record only where a result is being made', () => {
    const files = [...tsFilesUnder(SRC), ...tsFilesUnder(path.join(SERVER, 'prisma')).filter((f) => !f.includes('migrations'))];
    const writers = files
      .filter((f) => /\bresultReferenceRange\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(fs.readFileSync(f, 'utf8')))
      .map(rel)
      .sort();
    expect(writers).toEqual([
      // The demo teardown, which deletes the demo patient's own records.
      'src/modules/admin/demoSeedService.ts',
      // Automated ingestion.
      'src/modules/reports/materialiseReport.ts',
      // Verify and re-verify.
      'src/modules/reports/service.ts',
    ]);
  });
});

describe('a seeder cannot write to a result record', () => {
  /** A catalogue row and a per-result record that share nothing but a marker. */
  async function seeded() {
    const fake = createFakePrisma();
    await fake.referenceRange.create({
      data: { id: 'cat-1', markerId: 'ferritin', sex: 'FEMALE', ageMin: null, ageMax: null, unit: 'µg/L', low: 30, high: 400, provenance: 'UNSOURCED' },
    });
    await fake.resultReferenceRange.create({
      data: { id: 'res-1', markerId: 'ferritin', sex: 'FEMALE', ageMin: null, ageMax: null, unit: 'µg/L', low: 13, high: 150, provenance: 'UNSOURCED', source: 'Randox Portal, verified 2026-01-01 (report r1)' },
    });
    return { fake, db: fake as unknown as CatalogueDb };
  }

  it('refuses an update aimed at a per-result record, and says which it is', async () => {
    const { fake, db } = await seeded();
    // Ids were preserved across the split, so an id copied from an old log, an
    // old script or a client that has not been redeployed still resolves — and
    // resolves to a clinical document.
    await expect(updateCatalogueRange(db, 'res-1', { low: 30, high: 400 })).rejects.toThrow(CatalogueRangeError);
    await expect(updateCatalogueRange(db, 'res-1', { low: 30, high: 400 })).rejects.toThrow(/per-result record/);

    expect(await fake.resultReferenceRange.findUnique({ where: { id: 'res-1' } })).toMatchObject({ low: 13, high: 150 });
  });

  it('refuses a delete aimed at one too', async () => {
    const { fake, db } = await seeded();
    await expect(deleteCatalogueRange(db, 'res-1')).rejects.toThrow(CatalogueRangeError);
    expect(await fake.resultReferenceRange.findUnique({ where: { id: 'res-1' } })).not.toBeNull();
  });

  it('says something different about an id that names nothing', async () => {
    const { db } = await seeded();
    await expect(assertCatalogueRange(db, 'no-such-row')).rejects.toThrow(/not in the catalogue/);
  });

  it('still updates a genuine catalogue row', async () => {
    const { fake, db } = await seeded();
    await updateCatalogueRange(db, 'cat-1', { low: 13, high: 150, provenance: 'PUBLISHED' });
    expect(await fake.referenceRange.findUnique({ where: { id: 'cat-1' } })).toMatchObject({ low: 13, high: 150 });
  });

  it('finds the catalogue row for a marker and sex without seeing the record', async () => {
    // The exact query the incident was about. It used to need
    // `results: { none: {} }` — which was also unsound, because a re-verify
    // orphans the record it replaces and an orphaned record satisfies it
    // exactly as a catalogue row does. 152 rows were sitting in the catalogue
    // that way. It needs nothing now: the table holds nothing else.
    const { db } = await seeded();
    const found = await findCatalogueRange(db, { markerId: 'ferritin', sex: 'FEMALE' });
    expect(found?.id).toBe('cat-1');
  });

  it('creates a catalogue row in the catalogue table and nowhere near the records', async () => {
    const { fake, db } = await seeded();
    await createCatalogueRange(db, { markerId: 'iron', sex: 'ANY', unit: 'µmol/L', low: 10, high: 30 });
    expect(fake.referenceRange.rows).toHaveLength(2);
    expect(fake.resultReferenceRange.rows).toHaveLength(1);
  });
});

describe('the same inputs always give the same suggestion', () => {
  const base = (over: Partial<CatalogRange>): CatalogRange => ({
    id: 'x',
    sex: 'ANY',
    ageMin: null,
    ageMax: null,
    unit: 'µg/L',
    low: 30,
    high: 400,
    provenance: 'UNSOURCED',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  /** Every ordering of a small list — the shapes a database is free to return. */
  function permutations<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items];
    return items.flatMap((item, i) =>
      permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
    );
  }

  it('does not depend on the order the rows arrived in', () => {
    // Four rows that tie on specificity AND on provenance, which is the case
    // the old comparator left to Postgres: it returned 0 for every pair, so
    // the winner was whichever the query happened to put first, and two
    // identical requests could get two different answers.
    const rows = [
      base({ id: 'd', createdAt: '2026-03-01T00:00:00.000Z', low: 4 }),
      base({ id: 'b', createdAt: '2026-01-01T00:00:00.000Z', low: 2 }),
      base({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z', low: 1 }),
      base({ id: 'c', createdAt: null, low: 3 }),
    ];
    const answers = new Set(
      permutations(rows).map((order) => {
        const resolved = resolveReferenceRange(order, 'FEMALE', 40);
        return resolved.status === 'resolved' ? resolved.range.id : 'unavailable';
      }),
    );
    // Oldest first, and `a` before `b` on the same timestamp.
    expect([...answers]).toEqual(['a']);
  });

  it('puts a row with no timestamp last rather than first', () => {
    const undated = base({ id: 'aaa', createdAt: null });
    const dated = base({ id: 'zzz', createdAt: '2026-06-01T00:00:00.000Z' });
    for (const order of permutations([undated, dated])) {
      const resolved = resolveReferenceRange(order, 'FEMALE', 40);
      expect(resolved.status === 'resolved' && resolved.range.id).toBe('zzz');
    }
  });

  it('never lets the tie-break outrank specificity or provenance', () => {
    // The new steps are last, and they stay last: a sex-specific band still
    // beats a blanket one however old either is, and a Randox row still beats
    // an unsourced one of the same specificity.
    const blanketNewest = base({ id: 'aaa', sex: 'ANY', provenance: 'RANDOX', createdAt: '2020-01-01T00:00:00.000Z' });
    const specific = base({ id: 'zzz', sex: 'FEMALE', provenance: 'UNSOURCED', createdAt: '2026-12-01T00:00:00.000Z' });
    for (const order of permutations([blanketNewest, specific])) {
      const resolved = resolveReferenceRange(order, 'FEMALE', 40);
      expect(resolved.status === 'resolved' && resolved.range.id).toBe('zzz');
    }

    const randox = base({ id: 'zzz', provenance: 'RANDOX', createdAt: '2026-12-01T00:00:00.000Z' });
    const unsourced = base({ id: 'aaa', provenance: 'UNSOURCED', createdAt: '2020-01-01T00:00:00.000Z' });
    for (const order of permutations([randox, unsourced])) {
      const resolved = resolveReferenceRange(order, 'FEMALE', 40);
      expect(resolved.status === 'resolved' && resolved.range.id).toBe('zzz');
    }
  });
});
