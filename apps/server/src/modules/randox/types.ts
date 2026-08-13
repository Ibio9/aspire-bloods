/**
 * Wire contracts for the two Randox APIs.
 *
 * NEXUS LAB: verified against specs/nexus-openapi3.json ("GP Test Portal",
 * v1.0) plus the four Randox flow/auth PDFs in the same directory. Every
 * shape below is taken from a request/response example in that spec. There
 * are no guesses left on the Nexus side; where the spec itself is silent
 * (see the notes on specific fields) that silence is stated rather than
 * filled in.
 *
 * CLINIC BOOKING: REQUESTS VERIFIED, RESPONSES NOT. The Postman collection in
 * specs/ gives every request body literally — paths, verbs, field names,
 * value types — and gives no response examples at all. So everything sent is
 * built to the collection and everything received is still read through the
 * tolerant helpers in clients/parse.ts. The long note above that section has
 * the detail, including the two facts that only the flow PDF states.
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
  /**
   * From GET /TestReason/GetTestingReasons. REQUIRED, and required non-empty
   * by the spec's own schema — it is one of the seven entries in
   * CreatePendingOrderRequest.required. Every order needs at least one reason,
   * which is why placeOrder() and amendOrder() both refuse to build a request
   * without one rather than sending an empty array and finding out from a 400.
   *
   * INTEGER HERE, STRING ON CreateOrder. The spec's own two examples type this
   * same field differently — `"Id": 1` in the CreatePendingOrder example and
   * `"Id": "1"` in the CreateOrder one. Each request type therefore carries
   * the form ITS OWN example uses, and asRandoxInt / asRandoxIdString in
   * clients/parse.ts convert between them, so neither is a guess.
   */
  TestReasons: { Id: number; Details: string }[];
}

/**
 * POST /Order/CreateOrder — the FULL form, where CreatePendingOrder is the
 * minimal one.
 *
 * The difference is not a detail: CreatePendingOrder takes a flat patient with
 * no ethnicity, no measurements and no sample collection; CreateOrder nests
 * the patient and adds Height, Weight, Waist, Hip, Pulse, the two blood
 * pressures, Diabetic, Smoker, KnownVascularDisease, OnMedForHypertension and
 * EthnicityId, plus a SampleCollection block.
 *
 * NOTE THE TYPE FLIP on TestReasons[].Id — a string here, an integer on
 * CreatePendingOrder, in Randox's own examples. Sent as the endpoint's own
 * example types it.
 */
export interface CreateOrderRequest {
  Patient: {
    FirstName: string;
    LastName: string;
    /** "2001-01-01" — date only. */
    DateOfBirth: string;
    BiologicalSexId: number;
    TestClinicLocationId: number;
    IsHealthCheckPanelReport: boolean;
    IsCvScoreRequired: boolean;
    /** From GET /Ethnicity/GetEthnicity, whose ids come back as INTEGERS. */
    EthnicityId?: number;
    Height?: number;
    Weight?: number;
    Waist?: number;
    Hip?: number;
    Pulse?: number;
    SystolicBloodPressure?: number;
    DiastolicBloodPressure?: number;
    Diabetic?: boolean;
    Smoker?: boolean;
    KnownVascularDisease?: boolean;
    OnMedForHypertension?: boolean;
  };
  PanelIds: number[];
  TestIds: number[];
  /** Id as a STRING on this endpoint. See the note on CreatePendingOrderRequest. */
  TestReasons: { Id: string; Details: string }[];
  SampleCollection?: {
    /** The .NET round-trip form, e.g. "2025-04-19T03:20:00.0000000+00:00". */
    SampleCollectionDate: string;
    SampleCollectionComment?: string;
    SampleLaboratoryId: number;
    SampleTubes: { Id: number; QuantityRequired: number }[];
  };
}

/**
 * POST /Order/UpdatePendingOrder. Takes the full order again, keyed by both
 * identifiers. Anything omitted is treated as a removal (stated explicitly
 * for UpdateOrder; assumed to hold here too, so we always send the
 * complete set).
 *
 * The spec's example types TestReasons[].Id as a STRING here, unlike
 * CreatePendingOrder. Inherited as a number and converted at the call site —
 * see clients/NexusLabClient.ts.
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

  /**
   * IDENTITY, WHEN RANDOX SUPPLY IT — and the spec's own response example
   * does not.
   *
   * These three are read defensively under every plausible spelling
   * (patientFirstName / firstName / FirstName, and so on) precisely because
   * the schema is silent about them. They exist for one job: corroborating
   * an automatic link. A result is attached to an account on the order
   * reference we created it under, and if Randox echo a name and a date of
   * birth back they must agree with the account on that order or the result
   * goes to the exception queue instead.
   *
   * Absence is a first-class outcome, never an error and never treated as
   * agreement — see modules/randox/identityCheck.ts. The moment Randox start
   * returning them, they are checked, with no code change.
   */
  patientFirstName?: string | null;
  patientLastName?: string | null;
  /** Date only in the CreatePendingOrder request; assumed the same here. */
  patientDateOfBirth?: string | null;
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

/**
 * GET /TestItem/GetTests — id, name, code, stabilityTime, sampleTubes.
 *
 * TWO ABSENCES WORTH STATING, because both have been assumed present before:
 *
 *  · NO REFERENCE RANGES. There are no units, refLow or refHigh fields on
 *    this endpoint and there never have been. A marker's range arrives on the
 *    RESULT, per row, in GetOrderResultDetail — which is what product rule 2
 *    ("reference ranges live on the result, not the marker") already says.
 *    The fallback ranges in markerCatalogue.ts cannot be sourced from this
 *    API and come from the Pathology Services Catalogue PDFs.
 *
 *  · NO COST OR CURRENCY. The wire carries both; this type does not, because
 *    clients/NexusLabClient.ts strips them at the transport boundary. This
 *    product shows a patient no prices, and a field that is not in the type
 *    cannot be rendered by accident.
 */
export interface RandoxTestItem {
  id: string;
  name: string;
  code: string | null;
  stabilityTime: number | null;
  sampleTubes: { id: string; name: string; quantityRequired: number | null }[];
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

/**
 * GET /Clinic/GetClinicStaff — the eighth GET endpoint in the spec.
 *
 * `active` is documented as a boolean and one of the spec's own two examples
 * returns the string "Kent" for it, which is the clearest single illustration
 * of the rule that every scalar this API produces should be read as a string
 * and coerced. Read tolerantly; nothing on the order path depends on it.
 */
export interface RandoxClinicStaffMember {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  active: boolean;
  role: string | null;
}

/** GET /Clinic/GetMyClinicDetails — our clinic, plus its test locations. */
export interface RandoxClinicDetails extends RandoxClinicLocation {
  clinicTestLocations: RandoxClinicLocation[];
}

// ---------------------------------------------------------------------------
// Clinic Booking — REQUESTS VERIFIED, RESPONSES NOT
// ---------------------------------------------------------------------------

/**
 * ---------------------------------------------------------------------------
 * WHAT THE POSTMAN COLLECTION SETTLES, AND WHAT IT LEAVES OPEN (Aug 2026).
 * ---------------------------------------------------------------------------
 *
 * specs/"Clinic Booking Platform Testing APIs.postman_collection.json" is the
 * real collection from the developer portal. It gives, for all five booking
 * calls: the path, the verb, and a complete request body with real field names
 * and real values. It gives NO response examples at all — the `response` array
 * on every item is empty.
 *
 * That asymmetry is the shape of this section and is worth stating plainly,
 * because it is easy to read "we have the collection now" as "the API is
 * documented now":
 *
 *   OUTBOUND  verified, literal, and built exactly as the collection spells it
 *             — including a misspelling and two different date formats for one
 *             field, both of which are Randox's and neither of which is ours
 *             to correct.
 *   INBOUND   still assumed. Every response below is read through the tolerant
 *             helpers in clients/parse.ts under several plausible spellings, so
 *             a name guessed wrong degrades to "field absent" (handled) rather
 *             than a crash.
 *
 * ALSO STILL DOCUMENTED ONLY IN THE FLOW PDF, and treated as fact: availability
 * is UTC, a hold lasts 30 minutes, and the Nexus order number goes across as
 * GPExternalNumber.
 *
 * AND ONE ENDPOINT WENT MISSING. RescheduleAppointment is NOT in the
 * collection. It was in this section as a documented path; it never came from
 * a document we still hold, and the one machine-readable list of this API's
 * endpoints does not have it. See ClinicBookingClient.rescheduleAppointment.
 */

/**
 * THE SERVICE ID, WHICH IS NOT OPTIONAL AND IS NOT DISCOVERABLE.
 *
 * Third-party in-clinic bookings have exactly two: 787 for the UK, 788 for the
 * Republic of Ireland (Chris Caulfield, Aug 2026 — not in any document). Three
 * of the five calls take one and nothing the API returns tells you which to
 * use, so it is configuration: RANDOX_BOOKING_REGION picks, and
 * `bookingServiceId()` in config.ts is the only place it is read.
 */
export type RandoxBookingRegion = 'UK' | 'ROI';

/**
 * TYPES ARE INCONSISTENT ACROSS THE COLLECTION, EXACTLY AS THEY ARE ON NEXUS.
 * ServiceId is 787 on GetServiceLocations and HoldAvailabilityBooking, and
 * "787" on AvailabilityDetails and CreateRandoxBooking. LocationId is 15 on
 * AvailabilityDetails and "15" on the other two. The rule is unchanged and is
 * the only one that works: ACCEPT BOTH IN, SEND WHATEVER THAT ENDPOINT'S OWN
 * EXAMPLE USES. Each wire type below therefore states the form its own
 * endpoint wants, and the client converts at the boundary.
 */

/** POST /Locations/GetServiceLocations. ServiceId as a NUMBER. */
export interface GetServiceLocationsWireRequest {
  ServiceId: number;
}

/** POST /Availability/AvailabilityDetails. ServiceId STRING, LocationId NUMBER. */
export interface AvailabilityDetailsWireRequest {
  ServiceId: string;
  LocationId: number;
  /** "2025-09-10T00:00:00.000Z". There is no SearchTo — see the client. */
  SearchFrom: string;
}

/**
 * POST /RandoxBookings/HoldAvailabilityBooking. ServiceId NUMBER, LocationId
 * STRING, and the date day-first.
 *
 * `AppointmentSlotTIme` IS SPELLED THAT WAY ON THE WIRE. Capital I in the
 * middle of "Time", in both this call and CreateRandoxBooking. It is Randox's
 * field name, so it is what we send; correcting it would produce a request
 * with no slot time in it, which is a 400 at best and a booking at an
 * unspecified time at worst. It is spelled correctly nowhere else in this
 * codebase — the conversion happens here, at the wire, and only here.
 */
export interface HoldAvailabilityBookingWireRequest {
  ServiceId: number;
  LocationId: string;
  AppointmentSlotId: string;
  /** "16/10/2025" — day-first, per THIS endpoint's example. */
  AppointmentSlotDate: string;
  /** "09:30", UTC. Randox's spelling. */
  AppointmentSlotTIme: string;
}

/**
 * POST /RandoxBookings/CreateRandoxBooking. ServiceId and LocationId both
 * STRINGS here, and the date is an ISO instant at midnight Z rather than the
 * day-first form the hold takes.
 */
export interface CreateRandoxBookingWireRequest {
  BookingId: number;
  ServiceId: string;
  LocationId: string;
  AppointmentId: number;
  AppointmentSlotId: string;
  /** "2025-10-16T00:00:00Z" — ISO, midnight, per THIS endpoint's example. */
  AppointmentSlotDate: string;
  /** "09:30", UTC. Randox's spelling, again. */
  AppointmentSlotTIme: string;
  FirstName: string;
  LastName: string;
  /** "1990-01-01T00:00:00" — no zone designator in their example. */
  DateOfBirth: string;
  BiologicalSexId: number;
  EmailAddress: string;
  ConfirmEmailAddress: string;
  ContactNumber: string;
  AddressLine1: string;
  AddressLine2: string;
  TownCity: string;
  PostalCode: string;
  CountryId: number;
  CommunicationPreferenceEmail: boolean;
  CommunicationPreferenceSMS: boolean;
  CommunicationPreferenceTelephone: boolean;
  /** THE NEXUS ORDER NUMBER. The whole reason the two APIs join up. */
  GPExternalNumber: string;
}

/**
 * POST /RandoxBookings/CancelRandoxBooking.
 *
 * ONE FIELD, AND IT IS NOT THE ONE WE WERE SENDING. The collection cancels by
 * `RandoxBookingOrderId` — a Randox-side integer (32285 in their example) —
 * and not by any string reference of ours and not by GPExternalNumber. So the
 * id has to be captured from CreateRandoxBooking's response and stored, which
 * is what RandoxAppointment.randoxBookingOrderId is for. Without it a booking
 * can be made and never cancelled.
 */
export interface CancelRandoxBookingWireRequest {
  RandoxBookingOrderId: number;
}

// --- What we hand upward (responses: assumed shapes, tolerantly read) -------

export interface RandoxServiceLocation {
  id: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  postcode: string | null;
  /** For "closest to" sorting done on our side. */
  latitude: number | null;
  longitude: number | null;
}

export interface RandoxAvailabilitySlot {
  /** UTC — documented on the flow diagram, "all UTC". */
  startUtc: string;
  endUtc: string | null;
  /** Randox's AppointmentSlotId, e.g. "72164:72164::1760607000:". */
  slotReference: string;
  /**
   * The same instant as UK local wall clock, computed once at the boundary.
   *
   * Carried BESIDE the instant rather than instead of it, and named so the two
   * cannot be confused. A consumer that renders `startUtc` with a plain
   * `toLocaleTimeString` gets the READER's zone, which is right only by
   * accident and wrong for anyone booking from abroad; a consumer that renders
   * this gets the clinic's. See londonWallClock() in clients/parse.ts.
   */
  local: { date: string; time: string; timeZone: 'Europe/London' };
}

export interface HoldAvailabilityBookingResponse {
  holdReference: string;
  /** Documented as 30 minutes; a server-supplied expiry is preferred. */
  expiresAtUtc: string;
  /**
   * CreateRandoxBooking sends BookingId and AppointmentId, and the hold is the
   * only call before it that could have produced either. Read defensively and
   * nullable BY TYPE, because that is an inference from where the fields
   * appear in the flow and not something any document states — the client
   * refuses to build a booking with them missing rather than sending a zero.
   */
  bookingId: number | null;
  appointmentId: number | null;
}

/** What the booking service hands the client. Wire shapes are built from it. */
export interface CreateRandoxBookingRequest {
  holdReference: string;
  bookingId: number;
  appointmentId: number;
  serviceLocationId: string;
  slotReference: string;
  /** UTC instant. Split into Randox's date and time fields at the wire. */
  startUtc: string;
  /** The Nexus order NUMBER. Sent as GPExternalNumber. */
  gpExternalNumber: string;
  patient: {
    firstName: string;
    lastName: string;
    /** "yyyy-mm-dd". Widened to their datetime form at the wire. */
    dateOfBirth: string;
    biologicalSexId: number;
    email: string;
    contactNumber: string;
    addressLine1: string;
    addressLine2: string;
    townCity: string;
    postalCode: string;
    countryId: number;
  };
}

export interface CreateRandoxBookingResponse {
  bookingReference: string;
  /**
   * The id CancelRandoxBooking takes. Nullable because it is read out of a
   * response nobody has documented — a cancel with nothing to send is refused
   * with a message saying so, rather than sent as 0.
   */
  randoxBookingOrderId: number | null;
  startUtc: string;
  endUtc: string | null;
}
