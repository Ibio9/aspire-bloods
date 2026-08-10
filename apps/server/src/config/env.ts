import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_BASE_URL: z.string().url(),
  API_BASE_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  TRUSTED_DEVICE_TTL_DAYS: z.coerce.number().default(30),
  COOKIE_DOMAIN: z.string().default('localhost'),
  CSRF_SECRET: z.string().min(32),

  ENCRYPTION_KEY: z.string().min(1),

  FILE_SIGNING_SECRET: z.string().min(32),
  FILE_URL_TTL_MINUTES: z.coerce.number().default(10),
  STORAGE_ROOT: z.string().default('./storage'),

  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Aspire Clinic <no-reply@aspireshield.com>'),

  SMS_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),
  TWILIO_FROM_NUMBER: z.string().optional().default(''),

  ESCALATION_EMAIL: z.string().default('clinical-team@aspireshield.com'),
  ESCALATION_SMS_NUMBER: z.string().optional().default(''),

  // Shown to patients in the portal's persistent "contact the clinic" panel.
  // CLINIC_PHONE has no default on purpose — see modules/content/clinicContact.ts.
  CLINIC_PHONE: z.string().optional().default(''),
  CLINIC_HOURS: z.string().default('Monday to Friday, 9am–5pm'),

  LAB_ADAPTER: z.enum(['RANDOX_PORTAL', 'RANDOX_API']).default('RANDOX_PORTAL'),

  // --- Randox API integration ---------------------------------------------
  // Master switch. False means nothing Randox-related runs: no polling job,
  // no ordering endpoints, no config validation. LAB_ADAPTER is a separate,
  // older switch about which adapter handles *results*; this one is about
  // whether we talk to Randox's APIs at all.
  RANDOX_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  // 'mock' runs the entire order → book → poll → ingest flow against
  // in-process fixtures, which is how this is developed and tested while
  // sandbox access is pending. Refused in production (see config.ts).
  RANDOX_TRANSPORT: z.enum(['mock', 'live']).default('mock'),

  // Sandbox base URLs (stes-). Production is a one-variable change each.
  RANDOX_NEXUS_BASE_URL: z.string().default('https://stes-gpto-appapi-001-apim.azure-api.net/api/'),
  RANDOX_BOOKING_BASE_URL: z.string().default('https://stes-cb-platform-apim.azure-api.net/booking-platform-api/'),

  // Azure B2C client ids. Documented, not secret — defaulted so a
  // misconfiguration can't silently point at the wrong application, but
  // still overridable if Randox issue us different ones for production.
  RANDOX_NEXUS_CLIENT_ID: z.string().default('791f0001-20d7-4771-b4ab-359b4b9efd21'),
  RANDOX_BOOKING_CLIENT_ID: z.string().default('0b0399a4-d61f-43fc-a0d0-3311f60cdcb1'),

  // NOT ISSUED YET — subscription keys come from the Randox developer
  // portal. No defaults: a live boot without them fails at startup with a
  // message naming each one.
  RANDOX_NEXUS_SUBSCRIPTION_KEY: z.string().optional().default(''),
  RANDOX_BOOKING_SUBSCRIPTION_KEY: z.string().optional().default(''),

  // Scopes, verified from the Randox STES auth documents in
  // modules/randox/specs/. Defaulted rather than blank: a wrong scope fails
  // as an opaque B2C rejection, and these are documented values, not
  // secrets. Still overridable if production differs.
  RANDOX_NEXUS_SCOPE: z
    .string()
    .default('https://randoxclinicbooking.onmicrosoft.com/gptestorderportal-externalapi/User.Read.All'),
  RANDOX_BOOKING_SCOPE: z
    .string()
    .default('https://randoxclinicbooking.onmicrosoft.com/clinic-booking-platform-api/user_impersonation'),

  // ROPC token endpoint. Both auth documents give the SAME tenant and
  // policy (randoxclinicbooking / B2C_1_apim_ropc_signin1); only client id
  // and scope differ per API, so one shared default is correct. The per-API
  // overrides remain for a production tenant that splits them.
  RANDOX_B2C_TOKEN_URL: z
    .string()
    .default(
      'https://randoxclinicbooking.b2clogin.com/randoxclinicbooking.onmicrosoft.com/B2C_1_apim_ropc_signin1/oauth2/v2.0/token',
    ),
  RANDOX_NEXUS_TOKEN_URL: z.string().optional().default(''),
  RANDOX_BOOKING_TOKEN_URL: z.string().optional().default(''),

  // ROPC is a password grant, so it needs a service account. Shared pair
  // with per-API overrides, same reasoning as the token URLs.
  RANDOX_USERNAME: z.string().optional().default(''),
  RANDOX_PASSWORD: z.string().optional().default(''),
  RANDOX_NEXUS_USERNAME: z.string().optional().default(''),
  RANDOX_NEXUS_PASSWORD: z.string().optional().default(''),
  RANDOX_BOOKING_USERNAME: z.string().optional().default(''),
  RANDOX_BOOKING_PASSWORD: z.string().optional().default(''),

  // NOT ISSUED YET — our clinic id. It is an INTEGER on the wire
  // (GetMyClinicDetails returns `id: 146`), kept as a string here so "not
  // set" stays distinguishable from 0. Two distinct ids are involved: the
  // clinicId that CancelOrder and both result endpoints take, and the
  // TestClinicLocationId that CreatePendingOrder takes. They are the same
  // for a single-site clinic and differ once a clinic has several test
  // locations, so both are configurable. Both are readable from
  // GET /Clinic/GetMyClinicDetails once access exists.
  RANDOX_CLINIC_ID: z.string().optional().default(''),
  /** Defaults to RANDOX_CLINIC_ID when unset. */
  RANDOX_TEST_CLINIC_LOCATION_ID: z.string().optional().default(''),

  // The two CreatePendingOrder report flags. Both documented, neither
  // secret. IsHealthCheckPanelReport=true asks for the patient-facing
  // "scalebar" report rather than the tabular laboratory one — that is the
  // format of the example report in specs/, and the one we would show a
  // patient. IsCvScoreRequired asks for a cardiovascular risk score, which
  // is derived from measurements CreatePendingOrder cannot carry, so it is
  // off until that flow exists.
  RANDOX_HEALTH_CHECK_PANEL_REPORT: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  RANDOX_CV_SCORE_REQUIRED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // NOT AGREED YET — the testing reason sent on every order. The
  // CreatePendingOrder schema requires a non-empty TestReasons array; valid
  // ids come from GET /TestReason/GetTestingReasons.
  RANDOX_DEFAULT_TEST_REASON_ID: z.string().optional().default(''),
  RANDOX_DEFAULT_TEST_REASON_DETAILS: z.string().default('Private health screening requested by the patient.'),
  // NOT AGREED YET — the cancellation reason id CancelOrder takes. From
  // GET /CancellationReason/GetCancellationReasons; the documented example
  // list is {1: Cancellation By Clinic, 2: Cancellation By Lab}.
  RANDOX_DEFAULT_CANCELLATION_REASON_ID: z.string().optional().default(''),

  // How long cached Randox reference data is trusted before being refetched.
  RANDOX_REFERENCE_DATA_TTL_MINUTES: z.coerce.number().default(720),

  // Which HTTP verb the seven reference-data endpoints take.
  //
  // The checked-in OpenAPI document declares them GET and declares every
  // /Order/* endpoint POST (including the Get* ones). Randox's own
  // integration guidance has been given verbally as "everything is POST".
  // Rather than bet on either, 'auto' sends the verb the spec declares and,
  // if the gateway answers 404/405/501 — the three ways an API says "not
  // that verb" — repeats the call as POST with an empty body and remembers
  // which one worked for the life of the process. 'get' and 'post' pin it
  // explicitly once we know, with no code change.
  RANDOX_REFERENCE_DATA_METHOD: z.enum(['auto', 'get', 'post']).default('auto'),

  // Client-side pacing on outbound Randox calls, per API. A poll sweep makes
  // two or three calls per order in a tight loop; spacing them is what keeps
  // us under the gateway's limiter rather than discovering it. 0 disables.
  RANDOX_MAX_REQUESTS_PER_MINUTE: z.coerce.number().default(60),
  // Transient failures only (429, 5xx, timeout, dropped connection). Never
  // applied to CreatePendingOrder — a retried create is a duplicate order.
  RANDOX_RETRY_MAX_ATTEMPTS: z.coerce.number().min(1).max(10).default(3),
  RANDOX_RETRY_BASE_DELAY_MS: z.coerce.number().default(500),

  // Which sample collection routes we may offer. Empty by default because
  // we have not confirmed what we're contractually entitled to; an order
  // requesting a method that isn't listed here is refused before it's sent.
  RANDOX_COLLECTION_METHODS: z.string().optional().default(''),

  // File-backed config. Defaults point at the checked-in .example files so
  // a dev machine always boots; production with RANDOX_TRANSPORT=live
  // refuses to start while still pointing at them.
  RANDOX_CODE_MAP_FILE: z.string().default('./config/randox/result-codes.example.json'),
  RANDOX_ID_MAP_FILE: z.string().default('./config/randox/id-map.example.json'),

  // Randox ask for one poll per outstanding order per hour, staggered by
  // order creation time. The cron here is how often the *sweeper* wakes up
  // to look for orders that are due — each individual order is still only
  // polled once per RANDOX_POLL_INTERVAL_MINUTES.
  RANDOX_POLL_CRON: z.string().default('*/5 * * * *'),
  RANDOX_POLL_INTERVAL_MINUTES: z.coerce.number().default(60),
  // Cap on orders polled per sweep, so a large backlog is spread over
  // several sweeps rather than hammering Randox in one burst.
  RANDOX_POLL_BATCH_SIZE: z.coerce.number().default(25),
  // After this many consecutive failures an order stops being polled and
  // waits for an admin — it is not retried forever.
  RANDOX_POLL_MAX_FAILURES: z.coerce.number().default(12),

  // PDF extraction: optional. Empty means every PDF upload falls back to
  // the regex extractor and says so in the admin UI — this must never be a
  // hard failure, since the regex path is fully functional on its own.
  ANTHROPIC_API_KEY: z.string().optional().default(''),

  // Explicit opt-in only — DO NOT set true anywhere internet-reachable.
  // Deliberately not derived from NODE_ENV: a misconfigured staging
  // deploy with NODE_ENV=development would otherwise leak live 2FA codes.
  EXPOSE_DEV_OTP_CODE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // Comma-separated list of admin emails — the ONLY way to grant the
  // ADMIN role (see lib/adminAccess.ts). Required in production.
  ADMIN_EMAILS: z.string().optional().default(''),

  // How long a self-signup verification CODE stays good for. Minutes, not
  // hours: this is a six-digit code with a million-wide search space, and a
  // day-long window on that entropy is a standing invitation. It only has to
  // survive someone switching to their inbox and back. Bounded so a
  // well-meaning config change can't quietly turn it back into a day.
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().min(5).max(60).default(20),

  // Password reset links are shorter-lived still, and expressed in minutes
  // rather than hours: unlike a verification link, this one can take over an
  // account, so its window is the time it takes to open an inbox and no more.
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().default(60),

  // --- Lockout ---
  // Both limits are in SECONDS, not minutes, because the login window is
  // now short enough that minutes can't express it. The lockout exists to
  // stop someone brute-forcing patient records; it is not there to punish
  // a person who mistyped their own password twice. At 10-in-2-minutes it
  // should be invisible in normal use, and the counter is cleared outright
  // on any successful sign-in (see modules/auth/router.ts).
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(10),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(120),
  // Deliberately NOT loosened alongside login. A password has an enormous
  // search space; a six-digit code has a million, and an attacker who has
  // already reached this step holds a valid password. Tight stays tight.
  OTP_RATE_LIMIT_MAX: z.coerce.number().default(5),
  OTP_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(900),
  // Separate budget from OTP verification: resend causes an outbound
  // email/SMS, and a patient legitimately asking for a second code must
  // not thereby lose the attempts they need to enter it.
  OTP_RESEND_RATE_LIMIT_MAX: z.coerce.number().default(4),
  // Registration is open to anyone (see modules/auth/service.ts signup()),
  // so this is an anti-abuse ceiling on account creation from one address,
  // not a gate on who may register.
  SIGNUP_RATE_LIMIT_MAX: z.coerce.number().default(10),
  SIGNUP_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(3600),
  // The tightest send budget in the app, and the only limiter here whose
  // ceiling used to be a literal in middleware/rateLimit.ts rather than a
  // setting. Same production default as before — five per hour — but
  // configurable like its five siblings, because five per hour from one IP is
  // below what the e2e suite legitimately does in a single run, which made
  // that run unrepeatable for the next 45 minutes and the suite flaky in a
  // way that looked like a product fault.
  PASSWORD_RESET_RATE_LIMIT_MAX: z.coerce.number().default(5),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration — see fieldErrors above');
  }
  return parsed.data;
}

export const env = loadEnv();
