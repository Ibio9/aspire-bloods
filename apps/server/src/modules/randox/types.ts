/**
 * Wire contracts for the two Randox APIs.
 *
 * SOURCE OF THESE SHAPES — read before changing anything here. The
 * documentation PDFs referenced in the build brief were not present in the
 * repository, so these interfaces are modelled from the written brief:
 * endpoint names, the auth mechanism, the order lifecycle, the numeric
 * status codes, and the fields explicitly called out (Order Number,
 * GPExternalNumber, UTC availability, base64 PDF reports, void/caveat
 * codes, reference ranges and high/low indicators on the result detail).
 *
 * Everything NOT named in the brief — exact JSON property casing, envelope
 * shape, pagination — is a documented guess. Each guess is marked GUESS
 * below. The wire layer is deliberately tolerant: `pick()` in
 * clients/parse.ts reads several plausible spellings of each field rather
 * than one, so a casing mismatch degrades to "field absent" (which is
 * handled) instead of a crash. When the real specs land, correct the
 * shapes here and delete the tolerant readers — nothing above this layer
 * needs to change.
 */

// ---------------------------------------------------------------------------
// Order status
// ---------------------------------------------------------------------------

/** Documented in the brief: 1 incomplete … 5 cancelled. Not a guess. */
export const RANDOX_ORDER_STATUS_BY_CODE = {
  1: 'INCOMPLETE',
  2: 'SUBMITTED',
  3: 'PENDING_RESULTS',
  4: 'COMPLETE',
  5: 'CANCELLED',
} as const;

export type RandoxOrderStatusName = (typeof RANDOX_ORDER_STATUS_BY_CODE)[keyof typeof RANDOX_ORDER_STATUS_BY_CODE];

/**
 * Never invents a status for an unrecognised code. Returning null leaves
 * the order on whatever status it already had and logs the raw code —
 * guessing "4 = complete" on an unknown value is precisely how an
 * unreleased or unreportable result would escape.
 */
export function orderStatusFromCode(code: number): RandoxOrderStatusName | null {
  return RANDOX_ORDER_STATUS_BY_CODE[code as keyof typeof RANDOX_ORDER_STATUS_BY_CODE] ?? null;
}

// ---------------------------------------------------------------------------
// Nexus Lab
// ---------------------------------------------------------------------------

export interface CreatePendingOrderRequest {
  /** RANDOX_CLINIC_ID. Not known yet — configuration, never hardcoded. */
  clinicId: string;
  /** At least one of panelIds/testIds must be non-empty (brief). */
  panelIds: string[];
  testIds: string[];
  patient: RandoxPatientPayload;
  /** Our own patient id, echoed back on results — how we match a delivery. */
  externalPatientReference: string;
  collectionMethod: string;
}

export interface RandoxPatientPayload {
  firstName: string;
  lastName: string;
  /** ISO yyyy-mm-dd. */
  dateOfBirth: string;
  /** 'Male' | 'Female' | 'Unknown' — GUESS at the accepted vocabulary. */
  sex: string;
  email: string | null;
  phoneNumber: string | null;
  addressLine1: string | null;
  postcode: string | null;
}

export interface CreatePendingOrderResponse {
  /** The reference for everything downstream. Documented. */
  orderNumber: string;
  statusCode: number | null;
}

export interface UpdatePendingOrderRequest {
  orderNumber: string;
  panelIds?: string[];
  testIds?: string[];
  patient?: Partial<RandoxPatientPayload>;
}

export interface GetOrderStatusResponse {
  orderNumber: string;
  /** 1–5. Documented. */
  statusCode: number;
  /** GUESS: free-text mirror of statusCode, if supplied at all. */
  statusDescription: string | null;
}

/**
 * One analyte on a completed order. `voidCodes`/`caveatCodes` are
 * documented as existing; their VALUES are the list we don't have yet, so
 * nothing in this codebase interprets a specific code literal — see
 * codes.ts, which resolves them against configuration and defaults
 * unrecognised ones to void.
 */
export interface RandoxResultItem {
  /** Randox's analyte code, e.g. their internal test id. */
  testCode: string | null;
  /** Randox's marker name — mapped onto our catalogue by name. */
  testName: string;
  /** Null for a qualitative or unreported analyte. */
  value: number | null;
  /** Non-numeric result text ("Not detected"), when there is one. */
  textValue: string | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  /** Randox's own out-of-range flag. Advisory only — we recompute. */
  abnormalFlag: 'H' | 'L' | 'N' | null;
  voidCodes: string[];
  caveatCodes: string[];
  /** True when this analyte is still being processed (partial delivery). */
  pending: boolean;
}

export interface GetOrderResultDetailResponse {
  orderNumber: string;
  /** Our own patient id as submitted at order time. */
  externalPatientReference: string | null;
  /** Randox's panel identifier — mapped to a catalogue Panel via config. */
  randoxPanelId: string | null;
  /** ISO datetime. */
  sampleCollectedAt: string | null;
  reportedAt: string | null;
  /** Order-level codes, applied to every analyte on the order. */
  voidCodes: string[];
  caveatCodes: string[];
  results: RandoxResultItem[];
}

export interface RandoxResultReport {
  filename: string;
  /** base64. Documented. */
  contentBase64: string;
  mimeType: string;
}

// ---------------------------------------------------------------------------
// Clinic Booking
// ---------------------------------------------------------------------------

export interface RandoxServiceLocation {
  id: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  postcode: string | null;
}

export interface RandoxAvailabilitySlot {
  /** ISO 8601 with an explicit Z — Randox return UTC (documented). */
  startUtc: string;
  endUtc: string | null;
  /** Opaque token identifying the slot to HoldAvailabilityBooking. */
  slotReference: string;
}

export interface HoldAvailabilityBookingResponse {
  holdReference: string;
  /** Documented: the hold lasts 30 minutes. Server-supplied where given. */
  expiresAtUtc: string;
}

export interface CreateRandoxBookingRequest {
  holdReference: string;
  serviceLocationId: string;
  /** The Nexus Order Number. Documented field name. */
  gpExternalNumber: string;
  startUtc: string;
}

export interface CreateRandoxBookingResponse {
  bookingReference: string;
  startUtc: string;
  endUtc: string | null;
}
