import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { PostgresRateLimitStore } from '../lib/postgresRateLimitStore.js';

export const loginRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
  store: new PostgresRateLimitStore('login'),
});

// Registration is admin-only (ADMIN_EMAILS-gated, see auth/service.ts) —
// hard-limited on a longer window than login, since legitimate volume is a
// handful of practice staff registering once, ever.
export const signupRateLimiter = rateLimit({
  windowMs: env.SIGNUP_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.SIGNUP_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
  store: new PostgresRateLimitStore('signup'),
});

export const otpRateLimiter = rateLimit({
  windowMs: env.OTP_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.OTP_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again later.' },
  store: new PostgresRateLimitStore('otp'),
});
