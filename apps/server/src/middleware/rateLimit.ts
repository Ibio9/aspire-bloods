import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { PostgresRateLimitStore } from '../lib/postgresRateLimitStore.js';

/**
 * "Please try again later" and "please try again shortly" are the two things
 * a locked-out person can do least with. Every limiter here reports the exact
 * number of seconds left so the client can count it down against the server's
 * own clock — express-rate-limit already knows when the window resets, it just
 * doesn't put it in the body by default.
 */
function lockoutResponder(message: string) {
  // express-rate-limit attaches req.rateLimit at runtime, but its global
  // Request augmentation only applies when the package's types are pulled in
  // ambiently — which this project's tsconfig doesn't do. Narrowing locally
  // is honest about that rather than widening the global Request type for
  // one field used in one file.
  return (req: Request & { rateLimit?: { resetTime?: Date } }, res: Response) => {
    const resetTime = req.rateLimit?.resetTime;
    const retryAfterSeconds = resetTime
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : undefined;
    res.status(429).json({ error: message, retryAfterSeconds });
  };
}

/**
 * The only thing standing between someone and brute-forcing patient records,
 * so it stays — but the old 5-in-15-minutes fired on ordinary human
 * mistyping and locked real patients out of their own results for a quarter
 * of an hour. Ten attempts inside two minutes is still far below any useful
 * guessing rate and is effectively unreachable by hand.
 *
 * Both numbers are env-tunable (LOGIN_RATE_LIMIT_MAX /
 * LOGIN_RATE_LIMIT_WINDOW_SECONDS) so they can be adjusted against real
 * traffic without a deploy.
 */
export const loginRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_SECONDS * 1000,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: lockoutResponder('Too many sign-in attempts from this connection.'),
  store: new PostgresRateLimitStore('login'),
});

/**
 * Clears the failed-attempt count for whoever just signed in successfully.
 * Without this the window is a flat budget: someone who mistypes four times,
 * gets it right on the fifth, then signs in again from the same place a
 * minute later starts that second sign-in already most of the way to a lock.
 * A successful login is proof the attempts were a person, not a guesser.
 *
 * Best-effort by design — the store is a database table, and a failure to
 * clear a counter must never turn a successful login into an error.
 */
export async function resetLoginAttempts(limiter: RateLimitRequestHandler, req: Request): Promise<void> {
  const key = req.ip;
  if (!key) return;
  try {
    await limiter.resetKey(key);
  } catch (e) {
    console.warn('[rateLimit] could not reset login counter', { error: e instanceof Error ? e.message : e });
  }
}

// Registration is open to anyone now, so this is an anti-abuse ceiling on
// how many accounts one address can create — not a gate on who may register.
export const signupRateLimiter = rateLimit({
  windowMs: env.SIGNUP_RATE_LIMIT_WINDOW_SECONDS * 1000,
  limit: env.SIGNUP_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: lockoutResponder('Too many accounts have been created from this connection.'),
  store: new PostgresRateLimitStore('signup'),
});

/**
 * Resend is a send-side action (it makes us dispatch an email/SMS), so it
 * gets its own budget rather than sharing the verify limiter's — otherwise
 * a patient legitimately resending twice would eat the attempts they need
 * to actually enter the code. Deliberately tight: the per-challenge
 * cooldown and reissue cap in auth/service.ts are the primary control, and
 * this is the backstop against someone cycling challenges to force sends.
 */
export const otpResendRateLimiter = rateLimit({
  windowMs: env.OTP_RATE_LIMIT_WINDOW_SECONDS * 1000,
  limit: env.OTP_RESEND_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: lockoutResponder(
    'Too many code requests. Please wait, or call the clinic if you still need help signing in.',
  ),
  store: new PostgresRateLimitStore('otp_resend'),
});

/**
 * Stays tight while login loosens. The search space here is six digits —
 * one in a million per guess — so a generous allowance is a materially
 * different risk from a generous allowance on a password field, and the
 * caller has already proved they hold valid credentials to get this far.
 */
export const otpRateLimiter = rateLimit({
  windowMs: env.OTP_RATE_LIMIT_WINDOW_SECONDS * 1000,
  limit: env.OTP_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: lockoutResponder('Too many verification attempts.'),
  store: new PostgresRateLimitStore('otp'),
});

// Verification links are emailed, so asking for another one is a send-side
// action like OTP resend — same reasoning, its own budget.
export const emailVerificationResendRateLimiter = rateLimit({
  windowMs: env.SIGNUP_RATE_LIMIT_WINDOW_SECONDS * 1000,
  limit: env.SIGNUP_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: lockoutResponder('Too many verification emails requested from this connection.'),
  store: new PostgresRateLimitStore('email_verification_resend'),
});
