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
 * THE CLINIC BOOKING ENDPOINTS, FROM THE POSTMAN COLLECTION.
 * ---------------------------------------------------------------------------
 *
 * Transcribed from specs/"Clinic Booking Platform Testing APIs.postman_collection.json"
 * and the CB STES auth document beside it. There is still no OpenAPI document
 * for this API — the collection gives REQUEST bodies and verbs and no response
 * examples at all, so what is verified here is exactly what goes OUT and
 * nothing about what comes back. That asymmetry is honoured throughout:
 * requests are built to the collection literally, responses are still read
 * through the tolerant helpers in clients/parse.ts.
 *
 * THE SAME ONE-SENTENCE RULE HOLDS HERE AS ON NEXUS: takes a body, POST; takes
 * nothing, GET. All five booking calls take a body and all five are POST;
 * GetBiologicalSex takes nothing and is the GET the auth document uses as its
 * worked example.
 *
 * The base URL is a DIFFERENT HOST from Nexus
 * (stes-cb-platform-apim.azure-api.net/booking-platform-api), with its own
 * subscription key, its own B2C client id and its own scope — which is why
 * "per API" is a structural property of the connection config and of the rate
 * limiter rather than a convention.
 */
export const CLINIC_BOOKING_ENDPOINTS = {
  // The one GET. The auth document's worked example.
  getBiologicalSex: { path: 'BiologicalSex/GetBiologicalSex', verb: 'GET' },

  // The five POSTs, in the order the flow diagram walks them.
  getServiceLocations: { path: 'Locations/GetServiceLocations', verb: 'POST' },
  availabilityDetails: { path: 'Availability/AvailabilityDetails', verb: 'POST' },
  holdAvailabilityBooking: { path: 'RandoxBookings/HoldAvailabilityBooking', verb: 'POST' },
  createRandoxBooking: { path: 'RandoxBookings/CreateRandoxBooking', verb: 'POST' },
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
      `"${normalised}" is not one of the ${BOOKING_BY_PATH.size} Clinic Booking endpoints in the Postman collection. ` +
        'Add it to CLINIC_BOOKING_ENDPOINTS with the verb the collection gives it rather than calling it with a guessed one.',
    );
  }
  return verb;
}

export function bookingEndpoint(name: ClinicBookingEndpointName): { path: string; verb: RandoxVerb } {
  return CLINIC_BOOKING_ENDPOINTS[name];
}

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
 * THE ERROR BODY HAS TWO SHAPES, AND THE 401 IS THE ODD ONE.
 * ---------------------------------------------------------------------------
 *
 *   200 / 400 / 500   {"statusCode": "...", "message": "..."}
 *   401               {"status": "401",     "message": "..."}
 *
 * One key differs on exactly the response you meet first with a new
 * subscription key, so reading only `statusCode` produces "Randox returned an
 * error with no code" on the one error that has the most to tell you.
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

export function parseRandoxErrorBody(text: string | null): RandoxErrorBody {
  if (!text || text.trim() === '') return { code: null, message: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { code: null, message: null };
  }
  if (typeof parsed !== 'object' || parsed === null) return { code: null, message: null };
  const record = parsed as Record<string, unknown>;
  // Both spellings, and both casings of each — the spec is lower-camel
  // throughout but nothing in it promises that of an error path.
  const rawCode = record.statusCode ?? record.StatusCode ?? record.status ?? record.Status;
  const rawMessage = record.message ?? record.Message;
  return {
    code: rawCode == null ? null : String(rawCode),
    message: typeof rawMessage === 'string' ? rawMessage : rawMessage == null ? null : String(rawMessage),
  };
}
