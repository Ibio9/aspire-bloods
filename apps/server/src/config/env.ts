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

  LAB_ADAPTER: z.enum(['RANDOX_PORTAL', 'RANDOX_API']).default('RANDOX_PORTAL'),
  RANDOX_API_BASE_URL: z.string().optional().default(''),
  RANDOX_API_KEY: z.string().optional().default(''),

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
