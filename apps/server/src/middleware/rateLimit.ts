import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const loginRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// Deliberately stricter than login — unauthenticated account creation is a
// more consequential action to let someone brute-force/script than a login
// attempt against an existing account.
export const signupRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: Math.min(env.LOGIN_RATE_LIMIT_MAX, 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts. Please try again later.' },
});

export const otpRateLimiter = rateLimit({
  windowMs: env.OTP_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.OTP_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again later.' },
});
