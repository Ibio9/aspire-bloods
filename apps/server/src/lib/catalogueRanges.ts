/**
 * THE ONLY PLACE THAT WRITES A CATALOGUE REFERENCE RANGE.
 *
 * `ReferenceRange` is the catalogue of fallbacks the verify form suggests. It
 * used to also hold one row per result ever materialised — what a particular
 * patient's laboratory printed on a particular report — and a seeder looking
 * for "the ferritin row for women" landed on one of those far more often than
 * on the catalogue row it meant. Ten rows were overwritten in place that way in
 * a single run, which rewrote patients' history to say their laboratory printed
 * a range it did not; four of them still carry the sentence recording it,
 * because what was printed is not recoverable.
 *
 * The two are separate tables now (see the schema comments on ReferenceRange
 * and ResultReferenceRange), so the mistake is not expressible through the
 * Prisma client at all. This module is the second layer: every catalogue write
 * goes through it, and every write that names an existing row ASSERTS THAT THE
 * ROW IS A CATALOGUE ROW before touching it. That assertion is not a tautology,
 * because ids were preserved across the split — an id copied from an old log,
 * an old script, or a client that has not been redeployed still resolves, and
 * it resolves to a per-result record. The error says so by name instead of the
 * write finding nothing and reporting success.
 *
 * Reads live here too, so the ORDER BY that makes the resolver deterministic is
 * written once. The resolver's comparator is a total order on its own
 * (see compareCatalogRanges); this makes the database agree with it rather than
 * leaving one to silently correct the other.
 */
import type { Prisma, PrismaClient, RangeProvenance, Sex } from '@prisma/client';

/** The real client or a transaction client. Exported so a test double can say what it is standing in for. */
export type CatalogueDb = Pick<PrismaClient, 'referenceRange' | 'resultReferenceRange'> | Prisma.TransactionClient;
type Db = CatalogueDb;

/**
 * The tie-break's last two steps, in the query as well as in the comparator.
 * Specificity and provenance are decided in code because they are a scoring
 * rule rather than a sort; these two are what stop Postgres row order deciding
 * anything.
 */
export const CATALOGUE_RANGE_ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

export class CatalogueRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueRangeError';
  }
}

export interface CatalogueRangeInput {
  markerId: string;
  sex?: Sex;
  ageMin?: number | null;
  ageMax?: number | null;
  unit: string;
  low: number;
  high: number;
  source?: string | null;
  provenance?: RangeProvenance;
  sourceDocument?: string | null;
  sourcePublisher?: string | null;
  sourceDate?: string | null;
  sourceUrl?: string | null;
}

/**
 * Proves an id names a catalogue row before anything writes to it.
 *
 * Two failure modes, said apart, because they mean different things: an id that
 * belongs to a per-result record is somebody about to rewrite a clinical
 * document, and an id that belongs to nothing is a stale reference.
 */
export async function assertCatalogueRange(db: Db, id: string): Promise<void> {
  const catalogue = await db.referenceRange.findUnique({ where: { id }, select: { id: true } });
  if (catalogue) return;

  const resultRecord = await db.resultReferenceRange.findUnique({ where: { id }, select: { id: true } });
  if (resultRecord) {
    throw new CatalogueRangeError(
      `Reference range ${id} is a per-result record — the range one laboratory printed on one report — not a catalogue row. It is not editable from the catalogue, and rewriting it would change what a patient's report says was printed on it.`,
    );
  }
  throw new CatalogueRangeError(`Reference range ${id} is not in the catalogue.`);
}

/** Every catalogue row for one marker, in the resolver's own order. */
export function listCatalogueRanges(db: Db, markerId: string) {
  return db.referenceRange.findMany({ where: { markerId }, orderBy: CATALOGUE_RANGE_ORDER });
}

/**
 * The catalogue row for one marker at one specificity, or null.
 *
 * This is the query the incident was about. It no longer needs a
 * `results: { none: {} }` guard — that guard was also unsound, since a
 * re-verify orphans the record it replaces and an orphaned result record
 * satisfies it exactly as a catalogue row does — because the table it reads
 * holds nothing else.
 */
export function findCatalogueRange(
  db: Db,
  where: { markerId: string; sex: Sex; ageMin?: number | null; ageMax?: number | null },
) {
  return db.referenceRange.findFirst({
    where: {
      markerId: where.markerId,
      sex: where.sex,
      ageMin: where.ageMin ?? null,
      ageMax: where.ageMax ?? null,
    },
    orderBy: CATALOGUE_RANGE_ORDER,
  });
}

export function createCatalogueRange(db: Db, data: CatalogueRangeInput) {
  return db.referenceRange.create({ data });
}

export async function updateCatalogueRange(db: Db, id: string, data: Partial<Omit<CatalogueRangeInput, 'markerId'>>) {
  await assertCatalogueRange(db, id);
  return db.referenceRange.update({ where: { id }, data });
}

export async function deleteCatalogueRange(db: Db, id: string) {
  await assertCatalogueRange(db, id);
  return db.referenceRange.delete({ where: { id } });
}
