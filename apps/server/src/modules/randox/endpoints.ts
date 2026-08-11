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
 * WHAT THE SPEC SAYS ABOUT AUTHENTICATION, WHICH IS LESS THAN WE ASSUMED.
 * ---------------------------------------------------------------------------
 *
 * `securitySchemes` contains exactly two entries, and they are the same
 * subscription key twice over:
 *
 *   apiKeyHeader  Ocp-Apim-Subscription-Key, in the header
 *   apiKeyQuery   subscription-key, in the query string
 *
 * There is NO OAuth scheme, no bearer scheme and no reference to Azure B2C
 * anywhere in the document. The auth PDFs Danial sent describe a B2C ROPC
 * password grant, so a bearer is probably still required at the gateway — but
 * "probably" is the accurate word and the spec does not corroborate it.
 *
 * So: the subscription key goes on every request unconditionally, and the
 * bearer is independently switchable (RANDOX_BEARER_TOKEN_ENABLED, default
 * on). A 401 logs which combination was actually sent, so the first live call
 * diagnoses itself instead of becoming a morning of guessing.
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
