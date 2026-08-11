import { RANDOX_DATETIME_EXAMPLE } from '../clients/parse.js';

/**
 * ---------------------------------------------------------------------------
 * THE PAYLOADS THE SPEC DOES NOT PROVIDE AND PRODUCTION CERTAINLY WILL.
 * ---------------------------------------------------------------------------
 *
 * The spec's GetOrderResultDetail example has exactly one result row and every
 * field on it is the literal string "string". It proves the shape and nothing
 * about the content. Every genuinely awkward case a real laboratory feed
 * contains is absent from it, and every one of them has a right answer that
 * differs from "file it as a number":
 *
 *   caveat populated          the result IS reportable and carries a note.
 *                             An unrecognised code voids it — that direction
 *                             is deliberate (see codes.ts).
 *   result "< 5.0"            a LIMIT, not a measurement. It must never
 *                             become 5.0, and it must never become 0.
 *   result "Not detected"     qualitative. A real result with no position on
 *                             a range bar and no point on a trend.
 *   refLow ""                 a one-sided range. Not a two-sided range with a
 *                             zero in it.
 *   unmapped analyte          goes to the exception queue with its exact
 *                             spelling, and NOT onto the patient's screen.
 *   lowHigh disagrees         the lab's own flag contradicts the range they
 *                             sent us. Neither is silently preferred; the
 *                             disagreement is raised for an admin.
 *
 * The last two are the two that must not reach a patient, and the tests in
 * tests/randoxSpecContract.test.ts assert exactly that.
 *
 * NOTHING REAL IS IN HERE. Invented names, invented dates of birth, invented
 * order numbers. The sandbox never sees a real patient.
 */

export const FIXTURE_ORDER_ID = 91;
export const FIXTURE_ORDER_NUMBER = 'GP-THE-00000091';
export const FIXTURE_EXTERNAL_NUMBER = 'GC1123-00000091';

/** A row in the shape GetOrderResultDetail returns them. */
export interface FixtureResultRow {
  orderNumber: string;
  dateOfReceipt: string;
  dateOfReport: string;
  analyte: string;
  group: string;
  result: string;
  units: string;
  refLow: string;
  refHigh: string;
  lowHigh: string;
  sampleType: string;
  caveat: string;
  displayName: string;
}

function row(overrides: Partial<FixtureResultRow>): FixtureResultRow {
  return {
    orderNumber: FIXTURE_ORDER_NUMBER,
    dateOfReceipt: RANDOX_DATETIME_EXAMPLE,
    dateOfReport: RANDOX_DATETIME_EXAMPLE,
    analyte: 'Ferritin',
    group: 'Iron Status',
    result: '120',
    units: 'ng/mL',
    refLow: '30',
    refHigh: '400',
    lowHigh: '',
    sampleType: 'Serum',
    caveat: '',
    displayName: 'Ferritin',
    ...overrides,
  };
}

/** An ordinary in-range numeric result, as the control. */
export const CLEAN_ROW = row({});

/** Reportable, and annotated. The caveat qualifies it; it does not void it. */
export const CAVEAT_ROW = row({
  analyte: 'Sodium',
  displayName: 'Sodium',
  group: 'Kidney Health',
  result: '141',
  units: 'mmol/L',
  refLow: '133',
  refHigh: '146',
  caveat: 'HAEM1',
});

/** A limit, not a measurement. "< 5.0" is not 5.0 and is not 0. */
export const COMPARATOR_ROW = row({
  analyte: 'C-Reactive Protein (CRP)',
  displayName: 'CRP',
  group: 'Inflammation',
  result: '< 5.0',
  units: 'mg/L',
  refLow: '0',
  refHigh: '5',
});

/** Qualitative. A real result with no position on any scale. */
export const QUALITATIVE_ROW = row({
  analyte: 'Helicobacter pylori',
  displayName: 'H. pylori',
  group: 'Gut Health',
  result: 'Not detected',
  units: '',
  refLow: '',
  refHigh: '',
});

/** One-sided: an empty refLow is an absent bound, not a zero. */
export const ONE_SIDED_RANGE_ROW = row({
  analyte: 'Vitamin B12',
  displayName: 'Vitamin B12',
  group: 'Vitamins',
  result: '410',
  units: 'pmol/L',
  refLow: '',
  refHigh: '569',
});

/**
 * An analyte no catalogue marker claims. Must reach the exception queue with
 * this exact spelling on it, and must not reach the patient's screen.
 */
export const UNMAPPED_ANALYTE_ROW = row({
  analyte: 'Randox Proprietary Index 7',
  displayName: 'Proprietary Index 7',
  group: 'Randox Research',
  result: '1.8',
  units: 'index',
  refLow: '0',
  refHigh: '3',
});

/**
 * The lab flags it high; the range they sent says it is comfortably inside.
 * Both are stored as sent, our status is computed as usual, and the
 * disagreement is raised rather than resolved — a mismatch usually means the
 * range on the row is not the range the laboratory actually applied.
 */
export const LAB_STATUS_DISAGREEMENT_ROW = row({
  analyte: 'Total Cholesterol',
  displayName: 'Total Cholesterol',
  group: 'Heart Health',
  result: '4.2',
  units: 'mmol/L',
  refLow: '0',
  refHigh: '5',
  lowHigh: 'H',
});

/** Same name, different sample type. Two different tests, and must stay two. */
export const URINE_GLUCOSE_ROW = row({
  analyte: 'Glucose',
  displayName: 'Glucose',
  group: 'Urinalysis',
  result: 'Negative',
  units: '',
  refLow: '',
  refHigh: '',
  sampleType: 'Urine',
});

export const ALL_EDGE_ROWS: FixtureResultRow[] = [
  CLEAN_ROW,
  CAVEAT_ROW,
  COMPARATOR_ROW,
  QUALITATIVE_ROW,
  ONE_SIDED_RANGE_ROW,
  UNMAPPED_ANALYTE_ROW,
  LAB_STATUS_DISAGREEMENT_ROW,
  URINE_GLUCOSE_ROW,
];

/** A whole GetOrderResultDetail body carrying whichever rows a test wants. */
export function resultDetailWith(rows: FixtureResultRow[]) {
  return {
    orderId: FIXTURE_ORDER_ID,
    orderNumber: FIXTURE_ORDER_NUMBER,
    orderCreatedDate: RANDOX_DATETIME_EXAMPLE,
    sampleCollectionDate: RANDOX_DATETIME_EXAMPLE,
    sampleAccessioningDate: RANDOX_DATETIME_EXAMPLE,
    sampleCancellationDate: null,
    resultsUploadDate: RANDOX_DATETIME_EXAMPLE,
    reportResults: rows,
    patientHeight: 170,
    patientWeight: 68,
    patientWaist: 80,
    patientHip: 95,
    patientPulse: 66,
    patientSystolicBloodPressure: 118,
    patientDiastolicBloodPressure: 76,
    patientIsDiabetic: false,
    patientIsSmoker: false,
    patientKnownVascularDisease: false,
    patientOnMedicationforHypertension: false,
    patientEthnicity: 'White',
  };
}

/**
 * GetOrderStatus, at each of the five documented codes, so a test can walk an
 * order through the whole lifecycle against the mock.
 */
export function statusResponse(statusId: number, orderNumber = FIXTURE_ORDER_NUMBER) {
  const descriptions: Record<number, string> = {
    1: 'Incomplete',
    2: 'Submitted',
    3: 'Pending Results',
    4: 'Complete',
    5: 'Cancelled',
  };
  return {
    orderNumber,
    orderId: FIXTURE_ORDER_ID,
    statusId,
    statusDescription: descriptions[statusId] ?? 'Unknown',
    statusDate: RANDOX_DATETIME_EXAMPLE,
    arrangementType: 'Own Clinic',
    arrangementStatus: 'Samples received',
  };
}

/**
 * GetOrderResultReports returns the original PDF as a BASE64 STRING, not as
 * binary — `reportResults` on that endpoint is a string, and is a different
 * type from the identically-named array on GetOrderResultDetail. A tiny but
 * genuinely valid PDF, so the storage path can be checked end to end rather
 * than against bytes that only look like a file.
 */
export const FIXTURE_PDF_BASE64 = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
  'utf-8',
).toString('base64');

export function reportsResponse(base64 = FIXTURE_PDF_BASE64) {
  return { orderId: FIXTURE_ORDER_ID, orderNumber: FIXTURE_ORDER_NUMBER, reportResults: base64 };
}
