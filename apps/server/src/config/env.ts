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
  RANDOX_API_BASE_URL: z.string().optional().default(''),
  RANDOX_API_KEY: z.string().optional().default(''),
  // How often the API adapter polls Randox for new/updated results, when
  // LAB_ADAPTER=RANDOX_API. Cron expression.
  RANDOX_POLL_CRON: z.string().default('*/15 * * * *'),

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
