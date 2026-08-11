import type { GetOrderResultDetailResponse, RandoxReportResultRow } from '../types.js';

/**
 * Fixtures written against the REAL Nexus payload shape
 * (specs/nexus-openapi3.json GetOrderResultDetail example) and the real
 * example patient report in the same directory.
 *
 * Two things they exist to exercise that a hand-waved fixture would miss:
 *
 *  1. result, refLow and refHigh are STRINGS. The example report contains
 *     genuine one-sided ranges — Total Cholesterol is "<5.0 Desirable /
 *     ≥5.0 High", eGFR is "≥60 Satisfactory", Triglycerides has only a
 *     "<2.3 Desirable" band — so those shapes are here, not just clean
 *     numeric pairs.
 *  2. there is no void field. Void and caveat codes both arrive in the one
 *     `caveat` string, which is why classification is by configured map
 *     with unknown-means-void.
 *
 * The codes below (RX-VOID-HAEM, RX-CAV-FASTING) are still INVENTED
 * placeholders — Randox's actual code list has not been supplied, and the
 * flow PDF says it comes from their Business Team. They match
 * config/randox/result-codes.example.json so the mock and the classifier
 * agree. Replace both together when the real list arrives.
 */

export const FIXTURE_VOID_CODE = 'RX-VOID-HAEM';
export const FIXTURE_CAVEAT_CODE = 'RX-CAV-FASTING';
/** Deliberately absent from the code map — must be treated as void. */
export const FIXTURE_UNKNOWN_CODE = 'RX-ZZZ-NEVER-SEEN';

/** Matches nothing in the seeded marker catalogue — must be flagged, not dropped. */
export const FIXTURE_UNMAPPED_MARKER = 'Randox Proprietary Index 7';

function row(overrides: Partial<RandoxReportResultRow> & { analyte: string }): RandoxReportResultRow {
  return {
    orderNumber: null,
    // Europe/London on the wire; the client converts before these are used.
    dateOfReceipt: '2026-08-04T09:15:00.000Z',
    dateOfReport: '2026-08-05T11:02:00.000Z',
    group: 'Full Blood Count',
    result: null,
    units: null,
    refLow: null,
    refHigh: null,
    lowHigh: null,
    sampleType: 'Serum',
    caveat: null,
    displayName: overrides.analyte,
    ...overrides,
  };
}

function baseDetail(orderId: number, orderNumber: string): GetOrderResultDetailResponse {
  return {
    orderId,
    orderNumber,
    orderCreatedDate: '2026-08-03T14:00:00.000Z',
    sampleCollectionDate: '2026-08-04T08:15:00.000Z',
    sampleAccessioningDate: '2026-08-04T16:40:00.000Z',
    sampleCancellationDate: null,
    resultsUploadDate: '2026-08-05T11:02:00.000Z',
    reportResults: [],
    // Measurements: present on the payload whether or not we supplied them.
    patientHeight: 178,
    patientWeight: 82,
    patientWaist: 92,
    patientHip: 101,
    patientPulse: 68,
    patientSystolicBloodPressure: 128,
    patientDiastolicBloodPressure: 79,
    patientIsDiabetic: false,
    patientIsSmoker: false,
    patientKnownVascularDisease: false,
    patientOnMedicationforHypertension: false,
    patientEthnicity: 'White',
    patientBiologicalSex: 'Male',
    // Null by default, and deliberately so: the spec's own response example
    // for GetOrderResultDetail carries no patient name or date of birth, so
    // the DEFAULT fixture is the payload we should expect. The mock client
    // overlays real values when a test asks it to (see identityEcho), which
    // is how both halves — "Randox told us who this is" and "Randox told us
    // nothing" — get exercised without pretending either is the normal case.
    patientFirstName: null,
    patientLastName: null,
    patientDateOfBirth: null,
  };
}

/** 1. A normal, complete order. Everything maps, nothing is flagged. */
export function normalCompleteOrder(orderId: number, orderNumber: string): GetOrderResultDetailResponse {
  return {
    ...baseDetail(orderId, orderNumber),
    reportResults: [
      row({ analyte: 'Haemoglobin', result: '147', units: 'g/l', refLow: '130.0', refHigh: '180.0', lowHigh: 'N' }),
      row({
        analyte: 'Platelet Count',
        displayName: 'Platelet Count',
        result: '272',
        units: '10⁹/L',
        refLow: '150',
        refHigh: '450',
        lowHigh: 'N',
      }),
      row({
        analyte: 'Creatinine',
        group: 'Kidney Health',
        result: '79.4',
        units: 'µmol/l',
        refLow: '53.0',
        refHigh: '97.0',
        lowHigh: 'N',
      }),
    ],
  };
}

/** 2. Some results voided — the rest must still be ingested normally. */
export function partiallyVoidedOrder(orderId: number, orderNumber: string): GetOrderResultDetailResponse {
  return {
    ...baseDetail(orderId, orderNumber),
    reportResults: [
      row({ analyte: 'Haemoglobin', result: '147', units: 'g/l', refLow: '130.0', refHigh: '180.0', lowHigh: 'N' }),
      // A void code alongside a perfectly plausible-looking value — the
      // value must never reach a patient regardless of how normal it looks.
      row({
        analyte: 'Potassium',
        group: 'Kidney Health',
        result: '5.03',
        units: 'mmol/l',
        refLow: '3.5',
        refHigh: '5.3',
        lowHigh: 'N',
        caveat: FIXTURE_VOID_CODE,
      }),
      // A caveat: reportable, annotated.
      row({
        analyte: 'Total Cholesterol',
        group: 'Heart Health',
        result: '5.85',
        units: 'mmol/l',
        refLow: '0',
        refHigh: '5.0',
        lowHigh: 'H',
        caveat: FIXTURE_CAVEAT_CODE,
      }),
    ],
  };
}

/**
 * 3. Every result voided. Randox move the order to status 5 themselves in
 * this case (documented in the corporate flow PDF, step 7).
 */
export function fullyVoidedOrder(orderId: number, orderNumber: string): GetOrderResultDetailResponse {
  return {
    ...baseDetail(orderId, orderNumber),
    reportResults: [
      row({ analyte: 'Haemoglobin', result: '147', units: 'g/l', refLow: '130.0', refHigh: '180.0', caveat: FIXTURE_VOID_CODE }),
      row({
        analyte: 'Total Cholesterol',
        group: 'Heart Health',
        result: '5.85',
        units: 'mmol/l',
        refLow: '0',
        refHigh: '5.0',
        caveat: FIXTURE_VOID_CODE,
      }),
    ],
  };
}

/** 4. An unmapped marker, plus an unknown code that must default to void. */
export function unmappedMarkerOrder(orderId: number, orderNumber: string): GetOrderResultDetailResponse {
  return {
    ...baseDetail(orderId, orderNumber),
    reportResults: [
      row({ analyte: 'Haemoglobin', result: '147', units: 'g/l', refLow: '130.0', refHigh: '180.0', lowHigh: 'N' }),
      row({
        analyte: FIXTURE_UNMAPPED_MARKER,
        group: 'Other',
        result: '3.14',
        units: 'index',
        refLow: '1',
        refHigh: '5',
        lowHigh: 'N',
      }),
      row({
        analyte: 'Vitamin D',
        group: 'Other',
        result: '62',
        units: 'nmol/L',
        refLow: '50',
        refHigh: '175',
        caveat: FIXTURE_UNKNOWN_CODE,
      }),
    ],
  };
}

/** 5. Partial delivery — some analytes present on the order, not yet reported. */
export function partialResultOrder(orderId: number, orderNumber: string): GetOrderResultDetailResponse {
  return {
    ...baseDetail(orderId, orderNumber),
    resultsUploadDate: null,
    reportResults: [
      row({ analyte: 'Haemoglobin', result: '147', units: 'g/l', refLow: '130.0', refHigh: '180.0', lowHigh: 'N' }),
      // Empty result string = the lab has the analyte but hasn't reported it.
      row({ analyte: 'Vitamin D', group: 'Other', result: '' }),
      row({ analyte: 'Ferritin', group: 'Other', result: null }),
    ],
  };
}

/**
 * 6. The awkward-but-real shapes, straight off the example patient report:
 * one-sided ranges, a comparator result, a qualitative result, and a
 * lowHigh that disagrees with the range supplied. None of these is an
 * error; all of them have to survive without a number being invented.
 */
export function awkwardValuesOrder(orderId: number, orderNumber: string): GetOrderResultDetailResponse {
  return {
    ...baseDetail(orderId, orderNumber),
    reportResults: [
      // One-sided: the report shows "<5.0 Desirable / ≥5.0 High".
      row({
        analyte: 'Total Cholesterol',
        group: 'Heart Health',
        result: '5.85',
        units: 'mmol/l',
        refLow: '',
        refHigh: '5.0',
        lowHigh: 'H',
      }),
      // eGFR: "≥60 Satisfactory" — a low bound with a comparator, no high.
      row({
        analyte: 'Estimated Glomerular Filtration Rate (eGFR)',
        group: 'Kidney Health',
        result: '97',
        units: 'ml/min/1.73m²',
        refLow: '≥60',
        refHigh: '',
        lowHigh: 'N',
      }),
      // A comparator RESULT. "< 5.0" is a detection limit, not a value.
      row({
        analyte: 'High Sensitivity C-Reactive Protein (hsCRP)',
        group: 'Heart Health',
        result: '< 0.3',
        units: 'mg/l',
        refLow: '0',
        refHigh: '1',
        lowHigh: 'N',
      }),
      // A qualitative result through the same field as the numbers.
      row({ analyte: 'Hepatitis B Surface Antigen', group: 'Other', result: 'Not detected', units: null }),
      // Lab says normal; the range they sent says otherwise. Neither is
      // silently preferred — the disagreement is raised for an admin.
      row({
        analyte: 'Alkaline Phosphatase (ALP)',
        group: 'Liver Health',
        result: '177',
        units: 'U/l',
        refLow: '30',
        refHigh: '120',
        lowHigh: 'N',
      }),
    ],
  };
}

export type FixtureScenario =
  | 'normal'
  | 'partially-voided'
  | 'fully-voided'
  | 'unmapped-marker'
  | 'partial-results'
  | 'awkward-values';

export const FIXTURE_BUILDERS: Record<
  FixtureScenario,
  (orderId: number, orderNumber: string) => GetOrderResultDetailResponse
> = {
  normal: normalCompleteOrder,
  'partially-voided': partiallyVoidedOrder,
  'fully-voided': fullyVoidedOrder,
  'unmapped-marker': unmappedMarkerOrder,
  'partial-results': partialResultOrder,
  'awkward-values': awkwardValuesOrder,
};

/** A tiny but structurally valid PDF, so the stored-file path is exercised. */
export const FIXTURE_PDF_BASE64 = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'utf-8',
).toString('base64');

/** Reference data, shaped exactly as the spec's GET examples return it. */
export const FIXTURE_BIOLOGICAL_SEXES = [
  { id: '1', name: 'Male' },
  { id: '2', name: 'Female' },
];

export const FIXTURE_CANCELLATION_REASONS = [
  { id: '1', name: 'Cancellation By Clinic' },
  { id: '2', name: 'Cancellation By Lab' },
];

export const FIXTURE_ETHNICITIES = [
  { id: '1', name: 'White' },
  { id: '2', name: 'Asian - Bangladeshi' },
  { id: '3', name: 'Asian - Indian' },
];

export const FIXTURE_TESTING_REASONS = [
  { id: '1', name: "To investigate the cause of the patient’s symptoms" },
  { id: '2', name: 'To confirm a suspected diagnosis' },
];
