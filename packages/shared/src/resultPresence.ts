import type { MarkerStatus } from './types.js';

/**
 * Absence of a result is its own state. It is not a status, and it is
 * emphatically not IN_RANGE.
 *
 * This file exists because the product told patients the opposite. A result
 * row whose value could not be placed against its reference range was written
 * to the database as IN_RANGE — "not flagged" was quietly spelled the same way
 * as "in range" — and every read path downstream then presented a marker that
 * had never been measured as a marker that had been measured and was fine.
 * That is a statement about someone's health that nobody made, and it is the
 * one class of error a results portal cannot be allowed to produce.
 *
 * The correction is structural rather than cosmetic:
 *
 *  · `MarkerStatus` still has exactly five members and three hues. Nothing has
 *    been added to it, because "no data" is not a sixth traffic light — it is
 *    the absence of the traffic light.
 *  · A result with no position on a reference range therefore carries `null`
 *    where a status would be, everywhere: the column, the DTO, the props.
 *    There is no value of `MarkerStatus` that can be defaulted to.
 *  · A result with no VALUE at all is not written, not sent and not rendered.
 *    See the product rule: a marker with no result renders nowhere — never a
 *    placeholder, never an empty row.
 */

/** What a status looks like once "it might not have one" is honest on the type. */
export type MarkerStatusOrNone = MarkerStatus | null;

/**
 * The words used wherever a marker has to appear but has nothing measured.
 * Descriptive and non-evaluative, in the same register as the band labels: it
 * says what the record contains, not what it means.
 */
export const NO_RESULT_LABEL = 'No result recorded';

/**
 * And where a result exists but has no position on a numeric range — a
 * qualitative outcome ("Not detected"), or a detection limit that straddles
 * the range. The value is real and is shown; only the comparison is missing.
 */
export const NO_STATUS_LABEL = 'Not compared to a range';

/** The two fields every result-shaped payload carries. Exactly one is ever set. */
export interface ResultValueFields {
  value: number | null;
  valueText?: string | null;
}

/**
 * Whether there is anything to show at all.
 *
 * A row failing this has no number and no lab text — nothing was measured, or
 * nothing came back. It must not reach a patient screen in any form, so every
 * read path filters on this rather than each screen inventing its own guard.
 */
export function hasResultValue(r: ResultValueFields): boolean {
  if (typeof r.value === 'number' && Number.isFinite(r.value)) return true;
  return typeof r.valueText === 'string' && r.valueText.trim() !== '';
}

/**
 * Whether this result can carry a status, a tint, a shape mark, a range bar or
 * a point on a chart. All six are the same question, so they ask it once.
 */
export function isEvaluated(r: ResultValueFields & { status: MarkerStatusOrNone }): boolean {
  return r.status !== null && hasResultValue(r);
}

/**
 * Only the results that belong in a count.
 *
 * The counts strip, the per-health-area bars and the report summary all report
 * on the same population: measured results that were actually compared against
 * a range. A no-data row inside those counts is the original bug wearing a
 * different hat — it would land in "in range" by subtraction even once the
 * status itself is null.
 */
export function countable<T extends ResultValueFields & { status: MarkerStatusOrNone }>(
  rows: T[],
): (T & { status: MarkerStatus })[] {
  return rows.filter((r): r is T & { status: MarkerStatus } => isEvaluated(r));
}
