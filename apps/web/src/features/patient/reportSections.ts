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

/** The result type a category filter names, or null where it names a health area. */
export function resultTypeFilter(categoryFilter: string): string | null {
  return categoryFilter.startsWith(RESULT_TYPE_FILTER_PREFIX)
    ? categoryFilter.slice(RESULT_TYPE_FILTER_PREFIX.length)
    : null;
}

/**
 * Whether a section may draw at all under the current category filter.
 *
 * A health area applies to MEASURED markers and to the categorised
 * non-measured sections, each of which has areas of its own; a result-type
 * filter names exactly one section. Either way the answer is "this section, or
 * nothing" rather than "this section, empty", because a section standing there
 * with nothing in it reads as a section that has broken.
 */
export function sectionMatchesType(resultType: string, categoryFilter: string): boolean {
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
