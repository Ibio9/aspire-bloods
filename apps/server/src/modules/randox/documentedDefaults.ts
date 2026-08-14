/**
 * ---------------------------------------------------------------------------
 * THE DOCUMENTED RANDOX VALUES, IN ONE PLACE, WITH NO IMPORTS.
 * ---------------------------------------------------------------------------
 *
 * Every value here is documented and none is a secret: both sandbox base URLs,
 * both B2C client ids, both scopes, the shared ROPC token endpoint, the two
 * booking service ids, and the sandbox test location. They are defaults rather
 * than constants — each is still an environment variable, so sandbox →
 * production is a config change with no deploy — and this file is where the
 * default lives.
 *
 * WHY THEY ARE NOT SIMPLY LITERALS IN `config/env.ts` ANY MORE. Two things read
 * them now: the server's env schema, and `scripts/sandboxPass.ts`, which is
 * deliberately standalone and does not load the server's config at all (it has
 * no database, no JWT secrets and no app URLs — it calls an external API and
 * writes files). Two copies of a value like
 *
 *   https://randoxclinicbooking.onmicrosoft.com/gptestorderportal-external-api/User.Read.All
 *
 * is exactly the shape of the bug this codebase has already had once: that
 * scope was wrong by ONE HYPHEN, transcribed from a PDF paragraph where the
 * hyphen falls on a line break, and a wrong scope means B2C issues no token at
 * all — so every call 401s with a message about the token and never about the
 * scope. A second copy is a second chance to get it wrong, and the wrong one
 * would be the one the sandbox pass sent.
 *
 * NOTHING SECRET GOES IN HERE. No subscription key, no ROPC password, no clinic
 * id. Those have no default by design: their absence is what the boot guard and
 * the sandbox pass refuse on, by name.
 *
 * This file imports nothing, on purpose — anything that needs a documented
 * Randox value can reach it without dragging in zod, the env schema or the
 * database client.
 */

export const RANDOX_DOCUMENTED = {
  /** Sandbox (`stes-`). Production is a one-variable change each. */
  nexusBaseUrl: 'https://stes-gpto-appapi-001-apim.azure-api.net/api/',
  bookingBaseUrl: 'https://stes-cb-platform-apim.azure-api.net/booking-platform-api/',

  /** Azure B2C client ids. From the two STES auth documents. */
  nexusClientId: '791f0001-20d7-4771-b4ab-359b4b9efd21',
  bookingClientId: '0b0399a4-d61f-43fc-a0d0-3311f60cdcb1',

  /**
   * B2C scopes. TRANSCRIBED FROM THE PDF'S LINK TARGET AND FROM THE POSTMAN
   * COLLECTIONS, never from the rendered paragraph — see the note above and
   * `randoxBookingContract.test.ts`, which pins the Nexus hyphen both ways.
   */
  nexusScope: 'https://randoxclinicbooking.onmicrosoft.com/gptestorderportal-external-api/User.Read.All',
  bookingScope: 'https://randoxclinicbooking.onmicrosoft.com/clinic-booking-platform-api/user_impersonation',

  /**
   * One shared ROPC token endpoint. Both auth documents give the same tenant
   * and policy (randoxclinicbooking / B2C_1_apim_ropc_signin1); only the client
   * id and the scope differ per API.
   */
  b2cTokenUrl:
    'https://randoxclinicbooking.b2clogin.com/randoxclinicbooking.onmicrosoft.com/B2C_1_apim_ropc_signin1/oauth2/v2.0/token',

  /**
   * The Clinic Booking ServiceId for third-party in-clinic bookings. Exactly
   * two exist and there is no third (Chris Caulfield, Aug 2026).
   */
  bookingServiceIdUk: 787,
  bookingServiceIdRoi: 788,

  /**
   * LocationId 30, "Clinic Location Crumlin", which Randox confirm has real
   * availability. The Postman collection's own examples use 15, which may have
   * an empty diary — and an empty diary and a broken integration look identical
   * from the outside.
   */
  sandboxTestLocationId: 30,
} as const;

/**
 * ---------------------------------------------------------------------------
 * CLINIC BOOKING'S BiologicalSexId, WHICH HAS NO ENDPOINT AND ONE SENTENCE.
 * ---------------------------------------------------------------------------
 *
 * `CreateRandoxBooking` takes a `BiologicalSexId` and Clinic Booking publishes
 * NO endpoint that lists them. `BiologicalSex/GetBiologicalSex` was called on
 * the strength of the CB auth document's worked example and answered 404; the
 * portal's operation list does not contain it.
 *
 * WHAT IS DOCUMENTED is the operation's own description, in the OpenAPI file:
 *
 *   "Creates a booking with Randox\n\nNote - Biological Sex Id: Male = 1,
 *    Female = 2"
 *
 * So this is a CLINIC BOOKING fact from a Clinic Booking document, and not the
 * Nexus id space borrowed across two gateways — which was the fallback, and is
 * strictly worse. Nexus's own GetBiologicalSex returns the same pair, and that
 * agreement is CORROBORATION rather than the source; the sandbox pass checks it
 * and says so either way.
 *
 * WHAT STAYS ASSUMED, and it is written down because it is the part that could
 * bite. A prose note in a description is not an enumeration:
 *
 *  · There may be values beyond these two. The spec still declares an orphaned
 *    `BiologicalSexResponse` schema (Id / Name / DisplayOrder) that no path
 *    references — an endpoint WITHDRAWN, not one that never existed — so a
 *    longer list is likelier than not, and nothing here can enumerate it.
 *  · Nothing states these ids are stable across deployments.
 *
 * A name that is not in this table is REFUSED rather than mapped to a guess:
 * BiologicalSexId is what decides which reference ranges a laboratory applies,
 * so an invented one is a wrong clinical answer rather than a failed request.
 * On the list for Randox: what is the full list, and is there an endpoint for
 * it now that GetBiologicalSex has gone?
 */
export const RANDOX_DOCUMENTED_BOOKING_BIOLOGICAL_SEX: Readonly<Record<string, number>> = {
  Male: 1,
  Female: 2,
};

/** The documented id for a name, case-insensitively, or null. Never a guess. */
export function bookingBiologicalSexId(name: string): number | null {
  const wanted = name.trim().toLowerCase();
  for (const [documented, id] of Object.entries(RANDOX_DOCUMENTED_BOOKING_BIOLOGICAL_SEX)) {
    if (documented.toLowerCase() === wanted) return id;
  }
  return null;
}

/**
 * How the HTTP transport paces itself and recovers, with no environment
 * involved.
 *
 * These used to be read straight off `env` inside `RandoxHttpClient`, which
 * made the transport — the one piece of this integration that is nothing but
 * "send bytes, read bytes" — depend on the server's whole configuration:
 * database URL, JWT secrets, app URLs and all. They travel on the connection
 * object now (see connection.ts), so the client can be handed a connection by
 * anything, including a script that has no server config at all.
 *
 * The pace is a TENTH of Randox's documented 600/min ceiling, deliberately —
 * see `RANDOX_DOCUMENTED_LIMIT_PER_MINUTE` in http/rateLimiter.ts.
 */
export const RANDOX_TRANSPORT_DEFAULTS = {
  maxRequestsPerMinute: 60,
  retryMaxAttempts: 3,
  retryBaseDelayMs: 500,
  /**
   * CONFIRMED REQUIRED (Aug 2026), so this is a lever and not a hedge: the CB
   * auth document says the bearer goes alongside the subscription key in one
   * sentence. Switchable only so an unexplained 401 can be bisected in one
   * redeploy.
   */
  bearerTokenEnabled: true,
} as const;
