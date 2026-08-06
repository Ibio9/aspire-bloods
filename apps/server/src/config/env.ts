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
  CLINIC_HOURS: z.string().default('Monday to Friday, 9am – 5pm'),

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

  // NOT KNOWN YET — access pending. No defaults on purpose: a live boot
  // without them fails at startup with a message naming each one.
  RANDOX_NEXUS_SUBSCRIPTION_KEY: z.string().optional().default(''),
  RANDOX_BOOKING_SUBSCRIPTION_KEY: z.string().optional().default(''),
  RANDOX_NEXUS_SCOPE: z.string().optional().default(''),
  RANDOX_BOOKING_SCOPE: z.string().optional().default(''),

  // ROPC token endpoints. One shared value covers the common case (same
  // B2C tenant and policy for both APIs); the per-API overrides exist
  // because we have not been able to confirm that they are in fact the same.
  RANDOX_B2C_TOKEN_URL: z.string().optional().default(''),
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

  // NOT KNOWN YET — Randox have not issued our clinic id. Every
  // CreatePendingOrder carries it.
  RANDOX_CLINIC_ID: z.string().optional().default(''),

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

  LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(5),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().default(15),
  OTP_RATE_LIMIT_MAX: z.coerce.number().default(5),
  OTP_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().default(15),
  // Separate budget from OTP verification: resend causes an outbound
  // email/SMS, and a patient legitimately asking for a second code must
  // not thereby lose the attempts they need to enter it.
  OTP_RESEND_RATE_LIMIT_MAX: z.coerce.number().default(4),
  // Registration is now admin-only (see modules/auth/service.ts signup()) —
  // deliberately stricter and a longer window than login, since legitimate
  // volume is a handful of practice staff, ever.
  SIGNUP_RATE_LIMIT_MAX: z.coerce.number().default(5),
  SIGNUP_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().default(60),
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
