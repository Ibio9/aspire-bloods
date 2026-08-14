import { isEvaluated, type MarkerStatusInput } from '@aspire-bloods/shared';
import type { ReportDetailData } from './useReportDetail';

/**
 * WHAT IS ON A REPORT, AS A LIST OF PLACES TO GO.
 *
 * A Signature report is 433 results and 249 of them are BELOW the marker grid —
 * genetic indicators, 207 food sensitivities, the microbiome panel. Nothing on
 * the first screen said so. A patient who scrolled to the end of the measured
 * markers and stopped had seen a little over a third of what they paid for, and
 * had no reason to think otherwise: the page looked finished.
 *
 * These ids are the anchor targets for the section index (`SectionIndex`) and
 * for the reveal-on-search behaviour below, and each one is a real `id` on a
 * real `<section>` — so a chip is an ordinary link that works before hydration
 * and a URL like `/reports/:id#sensitivity` opens the right part of the page.
 */
export const REPORT_SECTION_IDS = {
  measured: 'measured-results',
  measurements: 'personal-measurements',
  genetic: 'genetic',
  composition: 'composition',
  qualitative: 'qualitative',
  sensitivity: 'sensitivity',
} as const;

export interface ReportSection {
  id: string;
  /**
   * Short, and a substring of the heading it lands on. A chip reading
   * "Genetic" that scrolls to a heading reading "Genetic indicators" is one
   * thing named twice; a chip reading something the heading does not contain is
   * two things, and the reader has to work out that they are the same.
   */
  label: string;
  count: number;
}

/**
 * Every section this report actually has, in the order they render.
 *
 * ONLY THE ONES THAT ARE THERE. A chip for a section a report does not contain
 * is a link that scrolls nowhere, and the conditions are already written once
 * each in the components themselves — so they are read from the same data here
 * rather than restated. The one that is easy to get wrong is personal
 * measurements: manual entry and PDF upload carry none, so that section renders
 * nothing at all on those reports.
 */
export function reportSections(data: ReportDetailData): ReportSection[] {
  const { byType, report } = data;
  const entries: [string, string, number][] = [
    [REPORT_SECTION_IDS.measured, 'Measured', byType.measured.length],
    [REPORT_SECTION_IDS.measurements, 'Measurements', report?.personalMeasurements?.length ?? 0],
    [REPORT_SECTION_IDS.genetic, 'Genetic', byType.genetic.length],
    [REPORT_SECTION_IDS.composition, 'Gut microbiome', byType.composition.length],
    [REPORT_SECTION_IDS.qualitative, 'Findings', byType.qualitative.length],
    [REPORT_SECTION_IDS.sensitivity, 'Food sensitivity', byType.sensitivity.length],
  ];
  return entries.filter(([, , count]) => count > 0).map(([id, label, count]) => ({ id, label, count }));
}

/**
 * THE RESULT TYPES, AS A FILTER GROUP.
 *
 * The health-area picker became "Category" and holds these above the areas, so
 * narrowing to Food sensitivity is the same act as narrowing to Kidney health.
 * The prefix is what keeps the two vocabularies apart in one flat value space:
 * a health area's key comes from the catalogue and could in principle be
 * anything, and `categoryFilter` is a single string on the page's filter state.
 */
export const RESULT_TYPE_FILTER_PREFIX = 'type:';

export const RESULT_TYPE_FILTERS = [
  { value: `${RESULT_TYPE_FILTER_PREFIX}MEASURED`, label: 'Measured markers', resultType: 'MEASURED' },
  { value: `${RESULT_TYPE_FILTER_PREFIX}GENETIC`, label: 'Genetic indicators', resultType: 'GENETIC' },
  { value: `${RESULT_TYPE_FILTER_PREFIX}COMPOSITION`, label: 'Gut microbiome', resultType: 'COMPOSITION' },
  { value: `${RESULT_TYPE_FILTER_PREFIX}QUALITATIVE`, label: 'Findings and readings', resultType: 'QUALITATIVE' },
  { value: `${RESULT_TYPE_FILTER_PREFIX}SENSITIVITY`, label: 'Food sensitivity', resultType: 'SENSITIVITY' },
] as const;

/** The result type a category filter names, or null where it names something else. */
export function resultTypeFilter(categoryFilter: string): string | null {
  return categoryFilter.startsWith(RESULT_TYPE_FILTER_PREFIX)
    ? categoryFilter.slice(RESULT_TYPE_FILTER_PREFIX.length)
    : null;
}

/**
 * ===========================================================================
 *  THE THIRD VOCABULARY IN THE CATEGORY PICKER: HAS THIS BEEN COMPARED TO A
 *  RANGE AT ALL? (Aug 2026)
 * ===========================================================================
 *
 * Some markers in the measured grid carry no reference range and never will.
 * The nine dipstick and antibody results that keep an empty unit on purpose,
 * and every physical measurement — weight, waist, the waist/hip ratio, pulse,
 * both blood pressures — because a weight is not high or low, it is a weight.
 * They render as untinted cards reading "Not compared to a range", which is
 * correct and is the whole point: they are real results and they belong on the
 * page.
 *
 * What was missing is that a reader could not do anything about them. Somebody
 * reading their measured results scrolls past a block of cards saying nothing,
 * and somebody who wants to see just their blood pressure and their weight had
 * no way to ask.
 *
 * TWO OPTIONS AND THEY ARE EXACT COMPLEMENTS, because the useful thing is
 * being able to go either way and a single "hide these" checkbox cannot be a
 * chip in the filter row. Both name themselves in full, so the chip is
 * self-describing wherever it is carried:
 *
 *     Not compared to a range     only those
 *     Compared to a range         everything else
 *
 * "Not compared to a range" is the sentence already printed on the cards
 * themselves (NO_STATUS_LABEL in packages/shared), so the filter and the thing
 * it filters are named the same way. Never "qualitative", never a result-type
 * name: this cuts ACROSS the result types and a patient does not have that
 * word.
 *
 * IT LIVES IN THE SAME VALUE SPACE AS THE OTHER TWO, which is why it is in this
 * file rather than beside the status filters. `categoryFilter` is one string on
 * the page's filter state carrying three vocabularies — a health area from the
 * catalogue, a result type, and now this — and the prefixes are what stop a
 * catalogue key ever colliding with one of ours. Three prefixed lists in one
 * file cannot drift apart; three in three files can.
 *
 * IT NARROWS THE MEASURED GRID AND NOT THE OTHER SECTIONS. Food sensitivities,
 * genetic indicators and the microbiome have no reference range either, and
 * they are not what this asks about: each is its own section with its own
 * framing and its own entry in the picker above. The complaint this answers is
 * about the grid a patient reads their blood results in.
 */
export const RANGE_FILTER_PREFIX = 'range:';

export const RANGE_FILTERS = [
  { value: `${RANGE_FILTER_PREFIX}without`, label: 'Not compared to a range' },
  { value: `${RANGE_FILTER_PREFIX}with`, label: 'Compared to a range' },
] as const;

/**
 * What this filter wants, or null where it is not a range filter at all.
 *
 * `true` = only results with a position on a range. `false` = only results
 * without one. Deliberately a tri-state rather than a boolean with a default,
 * because "not a range filter" and "wants the unranged ones" are different
 * answers and a boolean would collapse them into the same falsy value.
 */
export function rangeFilterWantsRanged(categoryFilter: string): boolean | null {
  if (!categoryFilter.startsWith(RANGE_FILTER_PREFIX)) return null;
  return categoryFilter.slice(RANGE_FILTER_PREFIX.length) === 'with';
}

/**
 * Whether one result survives the range filter.
 *
 * `isEvaluated` is the same predicate the counts strip, the tints, the chevrons
 * and the range bars all use — so "not compared to a range" means exactly what
 * the card says, rather than a second definition that could drift from it.
 */
export function matchesRangeFilter(
  row: { value: number | null; valueText?: string | null; status: MarkerStatusInput },
  categoryFilter: string,
): boolean {
  const wantsRanged = rangeFilterWantsRanged(categoryFilter);
  if (wantsRanged === null) return true;
  return isEvaluated(row) === wantsRanged;
}

/**
 * Whether a section made entirely of results with no range may draw — the
 * personal measurements block, which is every one of them.
 *
 * Under "Compared to a range" it is hidden: a reader who has just asked to see
 * only the results with a comparison on them should not scroll past nine that
 * have none. Under "Not compared to a range" it is exactly what they asked for.
 */
export function unrangedSectionShown(categoryFilter: string): boolean {
  return rangeFilterWantsRanged(categoryFilter) !== true;
}

/**
 * Whether a section may draw at all under the current category filter.
 *
 * A health area applies to MEASURED markers and to the categorised
 * non-measured sections, each of which has areas of its own; a result-type
 * filter names exactly one section. Either way the answer is "this section, or
 * nothing" rather than "this section, empty", because a section standing there
 * with nothing in it reads as a section that has broken.
 *
 * A RANGE FILTER NAMES THE MEASURED GRID, same as a result type names one
 * section. Everything below the grid has no reference range by construction, so
 * letting "Not compared to a range" through to them would answer the question
 * with 207 food sensitivities — which is not what anybody asking it means, and
 * is already its own entry in the picker.
 */
export function sectionMatchesType(resultType: string, categoryFilter: string): boolean {
  if (rangeFilterWantsRanged(categoryFilter) !== null) return resultType === 'MEASURED';
  const wanted = resultTypeFilter(categoryFilter);
  return wanted === null || wanted === resultType;
}

/** How many results of one type an open report holds, for deciding what to offer. */
export function reportSectionCount(data: ReportDetailData, resultType: string): number {
  switch (resultType) {
    case 'MEASURED':
      return data.byType.measured.length + (data.report?.personalMeasurements?.length ?? 0);
    case 'GENETIC':
      return data.byType.genetic.length;
    case 'COMPOSITION':
      return data.byType.composition.length;
    case 'QUALITATIVE':
      return data.byType.qualitative.length;
    case 'SENSITIVITY':
      return data.byType.sensitivity.length;
    default:
      return 0;
  }
}
