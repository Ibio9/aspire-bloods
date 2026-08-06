import type { GetOrderResultDetailResponse, RandoxResultItem } from '../types.js';

/**
 * Fixtures covering the five scenarios that actually matter, written
 * against the documented contracts rather than against our own ingestion
 * code — so a change to ingestion is tested, not tautologically confirmed.
 *
 * The codes used here (RX-VOID-HAEM, RX-CAV-FASTING, …) are INVENTED
 * placeholders. We do not have Randox's real code list. They exist to
 * exercise the classification paths and they live in
 * config/randox/result-codes.example.json so the mock and the classifier
 * agree. The moment the real list arrives, it replaces the config file and
 * these fixture codes should be updated to real ones.
 */

export const FIXTURE_VOID_CODE = 'RX-VOID-HAEM';
export const FIXTURE_CAVEAT_CODE = 'RX-CAV-FASTING';
/** Deliberately absent from the code map — must be treated as void. */
export const FIXTURE_UNKNOWN_CODE = 'RX-ZZZ-NEVER-SEEN';

/** Matches nothing in the seeded marker catalogue — must be flagged, not dropped. */
export const FIXTURE_UNMAPPED_MARKER = 'Randox Proprietary Index 7';

function item(overrides: Partial<RandoxResultItem> & { testName: string }): RandoxResultItem {
  return {
    testCode: null,
    value: null,
    textValue: null,
    unit: null,
    referenceLow: null,
    referenceHigh: null,
    abnormalFlag: null,
    voidCodes: [],
    caveatCodes: [],
    pending: false,
    ...overrides,
  };
}

function baseDetail(orderNumber: string, patientRef: string): GetOrderResultDetailResponse {
  return {
    orderNumber,
    externalPatientReference: patientRef,
    randoxPanelId: 'RDX-PANEL-CORE',
    sampleCollectedAt: '2026-08-04T08:15:00.000Z',
    reportedAt: '2026-08-05T11:02:00.000Z',
    voidCodes: [],
    caveatCodes: [],
    results: [],
  };
}

/** 1. A normal, complete order. Everything maps, nothing is flagged. */
export function normalCompleteOrder(orderNumber: string, patientRef: string): GetOrderResultDetailResponse {
  return {
    ...baseDetail(orderNumber, patientRef),
    results: [
      item({ testName: 'Haemoglobin', testCode: 'HB', value: 145, unit: 'g/L', referenceLow: 130, referenceHigh: 170 }),
      item({ testName: 'Total Cholesterol', testCode: 'CHOL', value: 5.9, unit: 'mmol/L', referenceLow: 0, referenceHigh: 5, abnormalFlag: 'H' }),
      item({ testName: 'Vitamin D', testCode: 'VITD', value: 62, unit: 'nmol/L', referenceLow: 50, referenceHigh: 175 }),
    ],
  };
}

/** 2. Some results voided — the rest must still be ingested normally. */
export function partiallyVoidedOrder(orderNumber: string, patientRef: string): GetOrderResultDetailResponse {
  return {
    ...baseDetail(orderNumber, patientRef),
    results: [
      item({ testName: 'Haemoglobin', testCode: 'HB', value: 145, unit: 'g/L', referenceLow: 130, referenceHigh: 170 }),
      // A void code alongside a perfectly plausible-looking value — the
      // value must never reach a patient regardless of how normal it looks.
      item({
        testName: 'Potassium',
        testCode: 'K',
        value: 4.2,
        unit: 'mmol/L',
        referenceLow: 3.5,
        referenceHigh: 5.3,
        voidCodes: [FIXTURE_VOID_CODE],
      }),
      // A caveat: reportable, annotated.
      item({
        testName: 'Total Cholesterol',
        testCode: 'CHOL',
        value: 5.9,
        unit: 'mmol/L',
        referenceLow: 0,
        referenceHigh: 5,
        caveatCodes: [FIXTURE_CAVEAT_CODE],
      }),
    ],
  };
}

/** 3. Every result voided — the order as a whole becomes status 5. */
export function fullyVoidedOrder(orderNumber: string, patientRef: string): GetOrderResultDetailResponse {
  return {
    ...baseDetail(orderNumber, patientRef),
    // Order-level void: applies to every analyte on the order.
    voidCodes: [FIXTURE_VOID_CODE],
    results: [
      item({ testName: 'Haemoglobin', testCode: 'HB', value: 145, unit: 'g/L', referenceLow: 130, referenceHigh: 170 }),
      item({ testName: 'Total Cholesterol', testCode: 'CHOL', value: 5.9, unit: 'mmol/L', referenceLow: 0, referenceHigh: 5 }),
    ],
  };
}

/** 4. An unmapped marker, plus an unknown code that must default to void. */
export function unmappedMarkerOrder(orderNumber: string, patientRef: string): GetOrderResultDetailResponse {
  return {
    ...baseDetail(orderNumber, patientRef),
    results: [
      item({ testName: 'Haemoglobin', testCode: 'HB', value: 145, unit: 'g/L', referenceLow: 130, referenceHigh: 170 }),
      item({
        testName: FIXTURE_UNMAPPED_MARKER,
        testCode: 'RPI7',
        value: 3.14,
        unit: 'index',
        referenceLow: 1,
        referenceHigh: 5,
      }),
      item({
        testName: 'Vitamin D',
        testCode: 'VITD',
        value: 62,
        unit: 'nmol/L',
        referenceLow: 50,
        referenceHigh: 175,
        caveatCodes: [FIXTURE_UNKNOWN_CODE],
      }),
    ],
  };
}

/** 5. Partial delivery — some analytes still processing. */
export function partialResultOrder(orderNumber: string, patientRef: string): GetOrderResultDetailResponse {
  return {
    ...baseDetail(orderNumber, patientRef),
    reportedAt: null,
    results: [
      item({ testName: 'Haemoglobin', testCode: 'HB', value: 145, unit: 'g/L', referenceLow: 130, referenceHigh: 170 }),
      item({ testName: 'Vitamin D', testCode: 'VITD', pending: true }),
      item({ testName: 'Ferritin', testCode: 'FERR', pending: true }),
    ],
  };
}

export type FixtureScenario =
  | 'normal'
  | 'partially-voided'
  | 'fully-voided'
  | 'unmapped-marker'
  | 'partial-results';

export const FIXTURE_BUILDERS: Record<
  FixtureScenario,
  (orderNumber: string, patientRef: string) => GetOrderResultDetailResponse
> = {
  normal: normalCompleteOrder,
  'partially-voided': partiallyVoidedOrder,
  'fully-voided': fullyVoidedOrder,
  'unmapped-marker': unmappedMarkerOrder,
  'partial-results': partialResultOrder,
};

/** A tiny but structurally valid PDF, so the stored-file path is exercised. */
export const FIXTURE_PDF_BASE64 = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'utf-8',
).toString('base64');
