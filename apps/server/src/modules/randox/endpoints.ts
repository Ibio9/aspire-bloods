/**
 * ---------------------------------------------------------------------------
 * THE SEVENTEEN NEXUS ENDPOINTS, AND WHICH VERB EACH ONE TAKES.
 * ---------------------------------------------------------------------------
 *
 * Transcribed from specs/nexus-openapi3.json — "GP Test Portal" v1.0, server
 * https://stes-gpto-appapi-001-apim.azure-api.net/api. THAT FILE IS THE SOURCE
 * OF TRUTH, ahead of the flow and auth PDFs beside it and ahead of anything
 * anyone has said in an email.
 *
 * THE RULE IS ONE SENTENCE: takes a body, POST; takes nothing, GET.
 *
 * It is written down because the integration was built on the opposite belief
 * — "every endpoint is POST, including the Get* ones" — which came from verbal
 * guidance rather than from the spec. Eight of these are GET with no
 * parameters and no body, and calling them with POST is not a subtle failure:
 * it is eight endpoints answering 404 or 405, which presents as "the catalogue
 * refresh silently does nothing".
 *
 * The nine POSTs are all under /Order, and all nine genuinely take a body —
 * including GetOrderStatus, GetOrderResultDetail and GetOrderResultReports,
 * which are Get* by name and POST by verb because they take an order
 * identifier in a body rather than in a path or a query. That half of the old
 * belief was right, and it is the half that made the other half plausible.
 *
 * Nothing in this file is derived at runtime. A path not listed here is a path
 * nobody has checked against the spec, which is why `randoxEndpoint()` throws
 * on one rather than guessing a verb for it.
 */

export type RandoxVerb = 'GET' | 'POST';

/**
 * Every path is relative to the server URL and carries no leading slash, which
 * is the form RandoxHttpClient.buildUrl expects.
 */
export const NEXUS_ENDPOINTS = {
  // --- The eight GETs. No parameters, no body. ------------------------------
  getBiologicalSex: { path: 'BiologicalSex/GetBiologicalSex', verb: 'GET' },
  getCancellationReasons: { path: 'CancellationReason/GetCancellationReasons', verb: 'GET' },
  getEthnicity: { path: 'Ethnicity/GetEthnicity', verb: 'GET' },
  getClinicStaff: { path: 'Clinic/GetClinicStaff', verb: 'GET' },
  getMyClinicDetails: { path: 'Clinic/GetMyClinicDetails', verb: 'GET' },
  getPanels: { path: 'TestPanel/GetPanels', verb: 'GET' },
  getTestingReasons: { path: 'TestReason/GetTestingReasons', verb: 'GET' },
  getTests: { path: 'TestItem/GetTests', verb: 'GET' },

  // --- The nine POSTs. All under /Order, all take a body. -------------------
  getOrderStatus: { path: 'Order/GetOrderStatus', verb: 'POST' },
  getOrderResultDetail: { path: 'Order/GetOrderResultDetail', verb: 'POST' },
  getOrderResultReports: { path: 'Order/GetOrderResultReports', verb: 'POST' },
  createPendingOrder: { path: 'Order/CreatePendingOrder', verb: 'POST' },
  createOrder: { path: 'Order/CreateOrder', verb: 'POST' },
  updatePendingOrder: { path: 'Order/UpdatePendingOrder', verb: 'POST' },
  updateOrder: { path: 'Order/UpdateOrder', verb: 'POST' },
  cancelOrder: { path: 'Order/CancelOrder', verb: 'POST' },
  updateConsultationNote: { path: 'Order/UpdateConsultationNote', verb: 'POST' },
} as const satisfies Record<string, { path: string; verb: RandoxVerb }>;

export type NexusEndpointName = keyof typeof NEXUS_ENDPOINTS;

/** The eight that take nothing, in spec order. Used by the reference-data sync. */
export const NEXUS_GET_PATHS: readonly string[] = Object.values(NEXUS_ENDPOINTS)
  .filter((e) => e.verb === 'GET')
  .map((e) => e.path);

export const NEXUS_POST_PATHS: readonly string[] = Object.values(NEXUS_ENDPOINTS)
  .filter((e) => e.verb === 'POST')
  .map((e) => e.path);

const BY_PATH = new Map<string, RandoxVerb>(Object.values(NEXUS_ENDPOINTS).map((e) => [e.path, e.verb]));

/**
 * The declared verb for a path.
 *
 * Throws rather than defaulting. A path this table has never heard of is a
 * path nobody has read off the spec, and answering "GET, probably" for it is
 * exactly the kind of guess this file exists to end.
 */
export function verbForPath(path: string): RandoxVerb {
  const normalised = path.replace(/^\/+/, '');
  const verb = BY_PATH.get(normalised);
  if (!verb) {
    throw new Error(
      `"${normalised}" is not one of the 17 endpoints declared in specs/nexus-openapi3.json. ` +
        'Add it to NEXUS_ENDPOINTS with the verb the spec gives it rather than calling it with a guessed one.',
    );
  }
  return verb;
}

export function nexusEndpoint(name: NexusEndpointName): { path: string; verb: RandoxVerb } {
  return NEXUS_ENDPOINTS[name];
}

/**
 * ---------------------------------------------------------------------------
 * THE SEVEN CLINIC BOOKING ENDPOINTS, FROM ITS OWN OpenAPI DOCUMENT.
 * ---------------------------------------------------------------------------
 *
 * specs/clinic-booking-openapi3.json — "Clinic Booking" v1.0, server
 * https://stes-cb-platform-apim.azure-api.net, every path under
 * /booking-platform-api. Downloaded from the developer portal's API-definition
 * dropdown (Aug 2026), and it settles three things the Postman collection could
 * not, because a TESTING collection lists what somebody wanted to test and a
 * definition lists what exists.
 *
 * ONE GET AND SIX POSTS. Same one-sentence rule as Nexus: takes a body, POST;
 * takes nothing, GET.
 *
 * ── 1. GetBiologicalSex IS NOT ONE OF THEM, AND IT 404'd ───────────────────
 *
 * It was in this table as the one GET, on the strength of the CB STES auth
 * document's worked example. The sandbox pass called it and Randox answered
 *
 *   404 {"statusCode": 404, "message": "Resource not found"}
 *
 * and the portal's own operation list does not contain it. The auth document is
 * stale on that point. What survives is a ghost: `BiologicalSexResponse`
 * (Id/Name/DisplayOrder) is still declared in the spec's `components.schemas`
 * with no path referencing it — an endpoint that was withdrawn rather than one
 * that never existed, which is worth knowing because it means the id list is
 * unenumerable rather than absent. See RANDOX_DOCUMENTED.bookingBiologicalSexIds
 * for what is documented instead and what stays assumed.
 *
 * GET GetServiceRegions is the replacement CHEAP PROBE: no body, no order, no
 * side effect, and it fails for exactly the same reasons a bad key or a bad
 * scope fails. A probe that 404s proves nothing about the credentials.
 *
 * ── 2. RescheduleAppointment IS SPECIFIED NOW, PATH, VERB AND BODY ─────────
 *
 * POST RandoxBookings/RescheduleAppointment, four required fields
 * (appointmentId, serviceId, locationId, newAppointmentSlotId) and a response
 * schema. It has been through all three states in this file and the sequence is
 * the lesson: FICTIONAL (wrongly — absence from a testing collection is not
 * absence from an API), then NAMED ONLY (right, from the flow PDF), and now
 * SPECIFIED. It moves out of NAMED_BUT_UNSPECIFIED_ENDPOINTS below.
 *
 * ── 3. GetServiceRegions IS IN NO DOCUMENT WE HELD BEFORE THIS ONE ─────────
 *
 * Not in the collection, not in the flow PDF, not in either auth document.
 * Which is the general point: the collection was never a list of this API.
 *
 * ── WHAT THE SPEC DOES *NOT* OUTRANK: THE REQUEST EXAMPLES ────────────────
 *
 * On Nexus the OpenAPI file is the source of truth outright. Here it is the
 * source of truth for the SURFACE and not for the bodies, because its examples
 * are demonstrably older than the collection's:
 *
 *   · the hold example sends `"ServiceId": "488"` and `"LocationId": "42"`,
 *     and 488 is not a service id — there are exactly two in the world, 787 and
 *     788, and no third (Chris Caulfield);
 *   · both slot examples put a DATE in the time field
 *     (`"appointmentSlotTime": "2024-04-11"`), which is not a format, it is a
 *     mistake;
 *   · the create example has no `GPExternalNumber`, the field the flow diagram
 *     requires in as many words and the only thing joining a booking to a
 *     laboratory order.
 *
 * The collection's example is self-consistent to the second: its slot id
 * "72164:72164::1760607000:" decodes to exactly the date and time it then
 * sends. So SURFACE from the definition, BODIES from the collection where both
 * describe an endpoint, and the definition alone where it is the only source.
 * `mock/bookingSpecServer.ts` reads both and enforces where they AGREE.
 *
 * ── AND THE "MISSPELLING" WAS ONLY EVER A CASE DIFFERENCE ─────────────────
 *
 * `AppointmentSlotTIme` and `appointmentSlotTime` differ in one character's
 * CASE and nothing else. This file and three others carried a warning that
 * correcting the capital I would "produce a request with no slot time in it";
 * that was a guess dressed as a fact. The two documents disagree on case for
 * EVERY field of EVERY shared endpoint — the spec is camelCase on
 * create/cancel and PascalCase on hold/availability/locations, the collection
 * PascalCase throughout — which is what ASP.NET Core's default
 * case-insensitive model binding looks like from the outside. Nothing here is
 * changed on the strength of that inference: we still send the collection's
 * spelling, because it is the coherent example and because there is no reason
 * to alter a request the moment before testing it. What is retired is the
 * anxiety, and the mock no longer treats a case variant as a 400.
 *
 * The base URL is a DIFFERENT HOST from Nexus, with its own subscription key,
 * its own B2C client id and its own scope — which is why "per API" is a
 * structural property of the connection config and of the rate limiter rather
 * than a convention.
 */
export const CLINIC_BOOKING_ENDPOINTS = {
  // The one GET. Takes nothing, returns the service regions — and is the
  // cheapest proof that the booking key and scope work.
  getServiceRegions: { path: 'RandoxServices/GetServiceRegions', verb: 'GET' },

  // The six POSTs, in the order the flow diagram walks them.
  getServiceLocations: { path: 'Locations/GetServiceLocations', verb: 'POST' },
  availabilityDetails: { path: 'Availability/AvailabilityDetails', verb: 'POST' },
  holdAvailabilityBooking: { path: 'RandoxBookings/HoldAvailabilityBooking', verb: 'POST' },
  createRandoxBooking: { path: 'RandoxBookings/CreateRandoxBooking', verb: 'POST' },
  rescheduleAppointment: { path: 'RandoxBookings/RescheduleAppointment', verb: 'POST' },
  cancelRandoxBooking: { path: 'RandoxBookings/CancelRandoxBooking', verb: 'POST' },
} as const satisfies Record<string, { path: string; verb: RandoxVerb }>;

export type ClinicBookingEndpointName = keyof typeof CLINIC_BOOKING_ENDPOINTS;

const BOOKING_BY_PATH = new Map<string, RandoxVerb>(
  Object.values(CLINIC_BOOKING_ENDPOINTS).map((e) => [e.path, e.verb]),
);

/** As verbForPath, for the booking API. Throws rather than guessing. */
export function bookingVerbForPath(path: string): RandoxVerb {
  const normalised = path.replace(/^\/+/, '');
  const verb = BOOKING_BY_PATH.get(normalised);
  if (!verb) {
    throw new Error(
      `"${normalised}" is not one of the ${BOOKING_BY_PATH.size} Clinic Booking endpoints in ` +
        'specs/clinic-booking-openapi3.json. Add it to CLINIC_BOOKING_ENDPOINTS with the verb the spec gives it ' +
        'rather than calling it with a guessed one.',
    );
  }
  return verb;
}

export function bookingEndpoint(name: ClinicBookingEndpointName): { path: string; verb: RandoxVerb } {
  return CLINIC_BOOKING_ENDPOINTS[name];
}

/**
 * ---------------------------------------------------------------------------
 * ENDPOINTS RANDOX DOCUMENT IN PROSE AND IN NO MACHINE-READABLE FORM.
 * ---------------------------------------------------------------------------
 *
 * A THIRD STATE, and it needs its own name because collapsing it into either
 * neighbour has now caused a mistake in each direction.
 *
 *   SPECIFIED    a path, a verb and a body — the two tables above.
 *   NAMED ONLY   named in a Randox document, with no request shape anywhere.
 *   FICTIONAL    nobody has written it down. Never call one.
 *
 * `RescheduleAppointment` HAS NOW BEEN THROUGH ALL THREE, IN ORDER, AND THE
 * SEQUENCE IS THE WHOLE ARGUMENT FOR THE MIDDLE STATE EXISTING.
 *
 *   FICTIONAL   — wrong. It was demoted here because it is absent from the
 *                 Postman collection, from the API-overview flow diagram and
 *                 from both auth documents. Every one of those checks was
 *                 correct and the inference was not: a TESTING collection does
 *                 not claim to be exhaustive.
 *   NAMED ONLY  — right, from page 3 of
 *                 specs/20241028-Corporate-Customer-API-Flow.pdf (1-Nov-24):
 *                 "there is a window of opportunity for the clinic booking
 *                 record to be rescheduled to a different clinic location, date
 *                 and time." Named, with no request shape anywhere. That PDF's
 *                 text is not mechanically greppable — its fonts carry no
 *                 usable ToUnicode — which is how a document in this very
 *                 directory got read as silent.
 *   SPECIFIED   — now. specs/clinic-booking-openapi3.json gives the path, the
 *                 verb, four REQUIRED fields and a response schema, so it is in
 *                 CLINIC_BOOKING_ENDPOINTS above and the client calls it.
 *
 * Had it been left at FICTIONAL, the arrival of the spec would have been read
 * as "a new endpoint appeared" rather than "the one Randox told us about in
 * 2024 finally got written down".
 *
 * `GetOrderStatusDetails` is what is left, on page 2 of the same document: the
 * home-dispatch tracking and kit URNs, usable once an order reaches status 2.
 * It is absent from the Nexus OpenAPI file's seventeen. Nothing in this product
 * calls it — home dispatch is not a route we offer — and it is recorded here so
 * that "it is not in the spec" is never again read as "it does not exist".
 */
export const NAMED_BUT_UNSPECIFIED_ENDPOINTS = [
  {
    api: 'Nexus' as const,
    name: 'GetOrderStatusDetails',
    source: 'specs/20241028-Corporate-Customer-API-Flow.pdf, page 2 (Last Updated 1-Nov-24)',
    quote:
      'GetOrderStatusDetails — once the Nexus status moves to status 2 then this end point can be used to get the dispatch tracking information in addition to the kit URNs (unique reference numbers) for each dispatched kit.',
    missing: 'Absent from nexus-openapi3.json. Home dispatch only; nothing here orders by that route.',
  },
] as const;

/**
 * ---------------------------------------------------------------------------
 * AUTHENTICATION: BOTH CREDENTIALS, ON EVERY REQUEST. SETTLED (Aug 2026).
 * ---------------------------------------------------------------------------
 *
 * The Nexus OpenAPI document's `securitySchemes` contains exactly two entries
 * and they are the same subscription key twice over:
 *
 *   apiKeyHeader  Ocp-Apim-Subscription-Key, in the header
 *   apiKeyQuery   subscription-key, in the query string
 *
 * There is no OAuth scheme, no bearer scheme and no reference to Azure B2C
 * anywhere in that document, and for a while this file said the bearer was
 * therefore "probably" required — the honest word at the time.
 *
 * THE CB STES AUTH DOCUMENT SETTLES IT, in one sentence: "Authorisation will be
 * the bearer token and in the header section include the following key:
 * Ocp-Apim-Subscription-Key." Both, together, on every request. Its Postman
 * screenshot shows exactly that pair of headers, and both Postman collections
 * carry a collection-level bearer alongside a per-request subscription key.
 *
 * So the spec's silence was a gap in the spec and not evidence of absence: an
 * APIM `securitySchemes` block describes what the GATEWAY checks, and the
 * bearer is checked by the B2C policy in front of it. Nothing about that is
 * inferable from the OpenAPI file, which is why it took a second document.
 *
 * RANDOX_BEARER_TOKEN_ENABLED stays, and is now a LEVER rather than a HEDGE:
 * it exists so a 401 can be diagnosed in one redeploy, not because the answer
 * is in doubt. Turning it off is a diagnostic step, never a configuration.
 *
 * THE HEADER FORM, NEVER THE QUERY FORM. A subscription key in a query string
 * is a credential in every access log, proxy log and browser history between
 * here and Randox. The query variant is documented above only so nobody adds
 * it later thinking it was overlooked.
 */
export const SUBSCRIPTION_KEY_HEADER = 'Ocp-Apim-Subscription-Key';

/**
 * ---------------------------------------------------------------------------
 * THE ERROR BODY HAS FOUR SHAPES. TWO ARE DOCUMENTED AND TWO WERE OBSERVED.
 * ---------------------------------------------------------------------------
 *
 *   200 / 400 / 500   {"statusCode": "...", "message": "..."}
 *   401               {"status": "401",     "message": "..."}
 *   VALIDATION        RFC 9110 ProblemDetails — see below
 *   CLINIC BOOKING    a BARE JSON STRING — see below
 *
 * The first two are what the spec documents. One key differs on exactly the
 * response you meet first with a new subscription key, so reading only
 * `statusCode` produces "Randox returned an error with no code" on the one
 * error that has the most to tell you.
 *
 * THE THIRD IS UNDOCUMENTED AND WAS OBSERVED (Aug 2026), on the first real
 * CreatePendingOrder against the sandbox. ASP.NET Core's model-validation
 * response, not the hand-written envelope the spec shows:
 *
 *   {"errors":{"Request":["No panels or test items provided"]},
 *    "type":"https://tools.ietf.org/html/rfc9110#section-15.5.1",
 *    "title":"One or more validation errors occurred.",
 *    "status":400,
 *    "traceId":"00-0e521a42…"}
 *
 * There is NO `message` anywhere in it. The parser read `status` for the code,
 * found no `message`, and returned null — so `RandoxApiError` was thrown as
 * "…failed with HTTP 400" and **the one sentence naming the broken field was
 * dropped on the floor**. That is the worst possible thing to lose from a 400:
 * the whole difference between "a request was refused" and "a request was
 * refused because PanelIds was empty".
 *
 * So `errors` is flattened into the message, field by field, and `title` is
 * used when it is the only prose there is. The order matters — `message` still
 * wins where Randox sent one, because that is the documented field.
 *
 * THE FOURTH IS CLINIC BOOKING'S, AND IT IS NOT AN OBJECT AT ALL (observed Aug
 * 2026). A failed CreateRandoxBooking answers 400 with the body
 *
 *   "Randox Booking failure, invalid appointment id."
 *
 * — a bare JSON string, quotes and all. Not an envelope, not ProblemDetails, no
 * `statusCode` and no `message` to read. This function required an OBJECT and
 * returned `{code: null, message: null}` for it, so the log said "failed with
 * HTTP 400" and **threw away a sentence that names the exact field that was
 * wrong**. That is the identical failure the ProblemDetails case was written to
 * fix, arriving in a new shape from the other API, and it is why the parse now
 * ends at "whatever prose there is" rather than at "an object I recognise".
 *
 * A body that is not JSON AT ALL still parses to nothing, which is unchanged
 * and deliberate — an unparseable body is a gateway's HTML page far more often
 * than a sentence from Randox, and `RandoxApiError` keeps the raw body
 * regardless, so what is given up there is a summary line and never the
 * evidence. The message is capped all the same, in case a valid JSON string
 * ever arrives carrying a stack trace.
 *
 * Also worth stating: `statusCode` is DOCUMENTED as an integer and RETURNED as
 * a string in every example in the file. The same is true of ids across the
 * API — biological sex ids come back as strings, ethnicity ids as integers,
 * CancellationReasonId is a string, and TestReasons[].Id is an integer in the
 * CreatePendingOrder example and a string in the CreateOrder one. Treat every
 * scalar this API produces as a string and coerce at the boundary.
 */
export interface RandoxErrorBody {
  code: string | null;
  message: string | null;
}

/**
 * "Request: No panels or test items provided" from a ProblemDetails `errors`
 * map. Field names are kept: a validation message without the field it is
 * about is half a sentence, and this API's field names are exactly what a
 * reader needs (PanelIds, TestReasons, TestClinicLocationId).
 */
function flattenValidationErrors(errors: unknown): string | null {
  if (typeof errors !== 'object' || errors === null || Array.isArray(errors)) return null;
  const parts: string[] = [];
  for (const [field, value] of Object.entries(errors as Record<string, unknown>)) {
    const messages = (Array.isArray(value) ? value : [value])
      .filter((m) => m != null)
      .map((m) => String(m).trim())
      .filter((m) => m !== '');
    if (messages.length === 0) continue;
    // ASP.NET uses an empty key for errors that belong to no single field.
    parts.push(field.trim() === '' ? messages.join('; ') : `${field}: ${messages.join('; ')}`);
  }
  return parts.length === 0 ? null : parts.join(' | ');
}

/**
 * A body that carries prose and no structure. Capped, because the alternative
 * to a bare sentence is a gateway's HTML error page and a log line nobody reads.
 */
const MAX_BARE_MESSAGE = 300;

function bareMessage(value: string): RandoxErrorBody {
  const trimmed = value.trim();
  if (trimmed === '') return { code: null, message: null };
  return {
    code: null,
    message: trimmed.length > MAX_BARE_MESSAGE ? `${trimmed.slice(0, MAX_BARE_MESSAGE)}…` : trimmed,
  };
}

export function parseRandoxErrorBody(text: string | null): RandoxErrorBody {
  if (!text || text.trim() === '') return { code: null, message: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON at all. Still nothing, deliberately, and unchanged: an
    // unparseable body is a gateway's HTML page far more often than it is a
    // sentence from Randox, and `RandoxApiError` carries the RAW body anyway —
    // so what is given up here is a summary line, never the evidence.
    return { code: null, message: null };
  }
  // Clinic Booking's shape: the whole body is one sentence.
  if (typeof parsed === 'string') return bareMessage(parsed);
  if (typeof parsed !== 'object' || parsed === null) return { code: null, message: null };
  const record = parsed as Record<string, unknown>;
  // Both spellings, and both casings of each — the spec is lower-camel
  // throughout but nothing in it promises that of an error path.
  const rawCode = record.statusCode ?? record.StatusCode ?? record.status ?? record.Status;
  const rawMessage = record.message ?? record.Message;

  const documented =
    typeof rawMessage === 'string' ? rawMessage : rawMessage == null ? null : String(rawMessage);
  const validation = flattenValidationErrors(record.errors ?? record.Errors);
  const title = typeof record.title === 'string' ? record.title : null;

  // The documented field first; then the validation detail, which is the only
  // thing that names the field; then the title, which is generic but is prose.
  // Where both a message and validation detail exist, both are kept — they are
  // different information and a 400 has room for two clauses.
  const message =
    documented && validation
      ? `${documented} (${validation})`
      : (documented ?? validation ?? title);

  return {
    code: rawCode == null ? null : String(rawCode),
    message,
  };
}
