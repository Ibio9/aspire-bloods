/**
 * Wire contracts for the two Randox APIs.
 *
 * NEXUS LAB: verified against specs/nexus-openapi.json ("GP Test Portal",
 * v1.0) plus the four Randox flow/auth PDFs in the same directory. Every
 * shape below is taken from a request/response example in that spec. There
 * are no guesses left on the Nexus side; where the spec itself is silent
 * (see the notes on specific fields) that silence is stated rather than
 * filled in.
 *
 * CLINIC BOOKING: UNVERIFIED. No OpenAPI spec exists for it yet — access is
 * still pending. What IS documented, from the flow PDFs, is the endpoint
 * paths, the call order, that availability is UTC, that a hold lasts 30
 * minutes, and that the Nexus order number goes across as GPExternalNumber.
 * The request and response *bodies* are not documented anywhere we have, so
 * everything under "Clinic Booking" below is marked UNVERIFIED and read
 * through the tolerant helpers in clients/parse.ts.
 */

// ---------------------------------------------------------------------------
// Order status — verified (flow PDF, and the GetOrderStatus example)
// ---------------------------------------------------------------------------

export const RANDOX_ORDER_STATUS_BY_CODE = {
  1: 'INCOMPLETE',
  2: 'SUBMITTED',
  3: 'PENDING_RESULTS',
  4: 'COMPLETE',
  5: 'CANCELLED',
} as const;

export type RandoxOrderStatusName = (typeof RANDOX_ORDER_STATUS_BY_CODE)[keyof typeof RANDOX_ORDER_STATUS_BY_CODE];

/**
 * Never invents a status for an unrecognised code. Returning null leaves the
 * order on whatever status it already had and logs the raw value — guessing
 * "4 = complete" on an unknown code is precisely how an unreportable result
 * would escape.
 */
export function orderStatusFromCode(code: number): RandoxOrderStatusName | null {
  return RANDOX_ORDER_STATUS_BY_CODE[code as keyof typeof RANDOX_ORDER_STATUS_BY_CODE] ?? null;
}

// ---------------------------------------------------------------------------
// Nexus Lab — requests
// ---------------------------------------------------------------------------

/**
 * POST /Order/CreatePendingOrder — the only endpoint in the spec with a
 * declared JSON schema rather than just an example. Required per that
 * schema: FirstName, LastName, DateOfBirth, BiologicalSexId,
 * TestClinicLocationId, IsHealthCheckPanelReport, TestReasons.
 *
 * PanelIds and TestIds are individually optional but the flow documentation
 * requires at least one valid id across the two.
 *
 * Note what is NOT here: there is no field for our own patient reference.
 * See ingestionService.ts for what that means for matching results back to
 * accounts.
 */
export interface CreatePendingOrderRequest {
  FirstName: string;
  LastName: string;
  /** "2001-01-01" — date only, no time (spec example). */
  DateOfBirth: string;
  /** From GET /BiologicalSex/GetBiologicalSex. Randox return id as a string; the request takes an integer. */
  BiologicalSexId: number;
  /** Our clinic's test location id, from GET /Clinic/GetMyClinicDetails. */
  TestClinicLocationId: number;
  PanelIds: number[];
  TestIds: number[];
  /**
   * Requests the patient-facing "scalebar" report instead of the plain
   * laboratory tabular report. GetOrderResultReports returns whichever was
   * produced: the scalebar report if this was true and it generated
   * successfully, the tabular lab report otherwise. Purely about which PDF
   * comes back — it does not change the JSON in GetOrderResultDetail.
   */
  IsHealthCheckPanelReport: boolean;
  /**
   * Asks Randox to calculate a cardiovascular risk score and include it in
   * the report. It is derived from the patient measurements (blood
   * pressure, smoking status, diabetes, ethnicity, lipids), which
   * CreatePendingOrder has no fields for — those are supplied by
   * CreateOrder/UpdateOrder at sample collection. Setting it true on a
   * pending order with no measurements ever supplied should be expected to
   * produce no score; we default it false and leave it configurable.
   */
  IsCvScoreRequired: boolean;
  /** From GET /TestReason/GetTestingReasons. Required, and required non-empty by the flow. */
  TestReasons: { Id: number; Details: string }[];
}

/**
 * POST /Order/UpdatePendingOrder. Takes the full order again, keyed by both
 * identifiers. Anything omitted is treated as a removal (stated explicitly
 * for UpdateOrder; assumed to hold here too, so we always send the
 * complete set).
 */
export interface UpdatePendingOrderRequest extends CreatePendingOrderRequest {
  OrderId: number;
  OrderNumber: string;
}

/** POST /Order/CancelOrder. */
export interface CancelOrderRequest {
  ClinicId: number;
  OrderId: number;
  OrderNumber: string;
  /**
   * From GET /CancellationReason/GetCancellationReasons — an id, not free
   * text. The spec example sends it as a string ("3") even though the
   * reasons endpoint returns ids as strings too, so it is sent as a string.
   */
  CancellationReasonId: string;
}

/** The identifier triple several endpoints take. */
export interface OrderRef {
  orderId: number;
  orderNumber: string;
  clinicId: number;
}

// ---------------------------------------------------------------------------
// Nexus Lab — responses
// ---------------------------------------------------------------------------

/**
 * CreatePendingOrder / UpdatePendingOrder / CreateOrder / UpdateOrder all
 * return the same pair. Note the name: the string reference comes back as
 * `externalNumber`, NOT `orderNumber` — the spec says so in three separate
 * endpoint descriptions ("ExternalNumber ... corresponds to the
 * OrderNumber"). Reading `orderNumber` off this response gets nothing.
 */
export interface CreateOrderResponse {
  orderId: number;
  externalNumber: string;
}

/** POST /Order/GetOrderStatus. */
export interface GetOrderStatusResponse {
  orderNumber: string;
  orderId: number;
  /** 1–5. */
  statusId: number;
  statusDescription: string | null;
  /** ISO with offset. */
  statusDate: string | null;
  /** e.g. "Own Clinic" — how the sample is being collected. */
  arrangementType: string | null;
  /** e.g. "Samples received" — free text, not an enum we can rely on. */
  arrangementStatus: string | null;
}

/**
 * One analyte on a completed order.
 *
 * IMPORTANT — result, refLow and refHigh are all typed `string`.
 *
 * That is not a spec error to be worked around by coercing to number. It is
 * how the data genuinely arrives: the example patient report in specs/
 * contains one-sided ranges ("<5.0 Desirable / ≥5.0 High", "≥60
 * Satisfactory") and qualitative results are reported through the same
 * field as numeric ones. So "< 5.0", "> 40", "Not detected" and "5.85" all
 * come through `result`, and refLow/refHigh are routinely empty or carry a
 * comparator.
 *
 * Nothing in this codebase coerces these. See clients/parseResult.ts.
 *
 * There is NO separate void field. The flow documentation says results
 * "can contain various void codes and result caveat codes" and the spec has
 * exactly one string, `caveat`, to carry them — so void codes arrive there
 * too, indistinguishable by shape from caveats. That is why classification
 * is by configured code map with unknown-means-void, not by which field a
 * code turned up in. See codes.ts.
 */
export interface RandoxReportResultRow {
  orderNumber: string | null;
  /** Europe/London, NOT UTC. See TIMEZONES below. */
  dateOfReceipt: string | null;
  /** Europe/London, NOT UTC. */
  dateOfReport: string | null;
  /** The lab's analyte name. */
  analyte: string | null;
  /** Report section, e.g. "Full Blood Count", "Heart Health". */
  group: string | null;
  /** String. May be numeric, comparator-prefixed, or qualitative text. */
  result: string | null;
  units: string | null;
  /** String. May be empty (one-sided range) or comparator-prefixed. */
  refLow: string | null;
  refHigh: string | null;
  /** Randox's own out-of-range indicator. Advisory; we compute our own. */
  lowHigh: string | null;
  sampleType: string | null;
  /** Void AND caveat codes both arrive here. One string. */
  caveat: string | null;
  /** Patient-facing name, e.g. "Mean Cell Haemoglobin (MCH)". */
  displayName: string | null;
}

/**
 * POST /Order/GetOrderResultDetail.
 *
 * TIMEZONES — from the endpoint's own description, verbatim: "Report
 * Results -> DateOfReceipt & DateOfReport will be returned in Europe/London
 * timezone. All other times will be UTC."
 *
 * So the two per-row dates are wall-clock London and every order-level
 * timestamp here is UTC. They are handled separately and explicitly in
 * clients/parse.ts — treating a London wall-clock time as UTC silently
 * shifts it by an hour for half the year, which for a sample-collection
 * date is the difference between two calendar days at the boundary.
 */
export interface GetOrderResultDetailResponse {
  orderId: number;
  orderNumber: string;
  /** UTC. */
  orderCreatedDate: string | null;
  sampleCollectionDate: string | null;
  sampleAccessioningDate: string | null;
  sampleCancellationDate: string | null;
  resultsUploadDate: string | null;

  reportResults: RandoxReportResultRow[];

  // Patient measurements recorded at collection. Present on the result
  // payload whether or not we supplied them (CreatePendingOrder has no
  // fields for them; CreateOrder/UpdateOrder do).
  patientHeight: number | null;
  patientWeight: number | null;
  patientWaist: number | null;
  patientHip: number | null;
  patientPulse: number | null;
  patientSystolicBloodPressure: number | null;
  patientDiastolicBloodPressure: number | null;
  patientIsDiabetic: boolean | null;
  patientIsSmoker: boolean | null;
  patientKnownVascularDisease: boolean | null;
  patientOnMedicationforHypertension: boolean | null;
  patientEthnicity: string | null;
  /**
   * Biological sex as recorded against the order and echoed back on the
   * result. Optional and loosely typed on purpose: Randox's own examples
   * return biological sex as a STRING id on some endpoints and a name on
   * others (see RandoxLookupItem's comment), and the result-detail schema
   * doesn't pin it down. Read defensively and normalised in
   * ingestionService.ts — an unrecognised value becomes null rather than a
   * guessed sex.
   */
  patientBiologicalSex?: string | number | null;
}

/**
 * POST /Order/GetOrderResultReports.
 *
 * `reportResults` here is a single base64 STRING — the whole PDF — not an
 * array, and not the same shape as the identically-named field on
 * GetOrderResultDetail. That collision is Randox's, not ours.
 */
export interface GetOrderResultReportsResponse {
  orderId: number;
  orderNumber: string;
  reportResults: string | null;
}

// ---------------------------------------------------------------------------
// Nexus Lab — reference data (all GET, all unauthenticated beyond the
// standard bearer + subscription key)
// ---------------------------------------------------------------------------

/**
 * GetBiologicalSex, GetEthnicity, GetTestingReasons and
 * GetCancellationReasons all return a bare array of {id, name} — but the id
 * is a STRING for biological sex and cancellation reasons and a NUMBER for
 * ethnicity and testing reasons, in Randox's own examples. Normalised to
 * string on the way in; converted back at the point each request needs it.
 */
export interface RandoxLookupItem {
  id: string;
  name: string;
}

export interface RandoxTestItem {
  id: string;
  name: string;
  code: string | null;
  stabilityTime: number | null;
  sampleTubes: { id: string; name: string; quantityRequired: number | null }[];
  cost: number | null;
  currency: string | null;
}

export interface RandoxPanel extends RandoxTestItem {
  /** "Custom" | "Global" in the examples; not an enum we can rely on. */
  panelType: string | null;
  specialInstructions: string | null;
  fastingRequired: boolean | null;
  sampleStabilityTime: number | null;
  testItems: { id: string; name: string }[];
}

export interface RandoxClinicLocation {
  id: string;
  name: string;
  code: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  townCity: string | null;
  county: string | null;
  postalCode: string | null;
}

/** GET /Clinic/GetMyClinicDetails — our clinic, plus its test locations. */
export interface RandoxClinicDetails extends RandoxClinicLocation {
  clinicTestLocations: RandoxClinicLocation[];
}

// ---------------------------------------------------------------------------
// Clinic Booking — UNVERIFIED
// ---------------------------------------------------------------------------

/**
 * Everything from here down is UNVERIFIED against any Randox specification.
 * No OpenAPI document for the Clinic Booking API has been provided; access
 * is pending.
 *
 * What IS documented (flow PDFs, and so treated as fact):
 *   - the endpoint paths: /Locations/GetServiceLocations,
 *     /Availability/AvailabilityDetails,
 *     /RandoxBookings/HoldAvailabilityBooking,
 *     /RandoxBookings/CreateRandoxBooking
 *   - the call order, and that a hold lasts 30 minutes
 *   - availability comes back in UTC
 *   - the Nexus order number is sent as GPExternalNumber
 *   - CancelRandoxBooking and RescheduleAppointment exist and are windowed
 *
 * What is NOT documented and is therefore assumed: every property name and
 * the response envelope. These are read through the tolerant helpers in
 * clients/parse.ts, so a name we guessed wrong degrades to "field absent"
 * (handled) rather than a crash. Replace this section, and the tolerant
 * reads in ClinicBookingClient.ts, the moment the real spec arrives.
 */

export interface RandoxServiceLocation {
  id: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  postcode: string | null;
  /** Documented as present, for "closest to" sorting done on our side. */
  latitude: number | null;
  longitude: number | null;
}

export interface RandoxAvailabilitySlot {
  /** UTC — documented. */
  startUtc: string;
  endUtc: string | null;
  slotReference: string;
}

export interface HoldAvailabilityBookingResponse {
  holdReference: string;
  /** Documented as 30 minutes; server value preferred when supplied. */
  expiresAtUtc: string;
}

export interface CreateRandoxBookingRequest {
  holdReference: string;
  serviceLocationId: string;
  /** The Nexus order NUMBER (the string one). Documented field name. */
  gpExternalNumber: string;
  startUtc: string;
}

export interface CreateRandoxBookingResponse {
  bookingReference: string;
  startUtc: string;
  endUtc: string | null;
}
