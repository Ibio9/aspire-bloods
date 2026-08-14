import { RANDOX_TRANSPORT_DEFAULTS } from './documentedDefaults.js';

/**
 * ---------------------------------------------------------------------------
 * WHAT ONE RANDOX API CONNECTION IS. NO ENVIRONMENT, NO SERVER CONFIG.
 * ---------------------------------------------------------------------------
 *
 * This interface used to live in `config.ts`, which imports `config/env.ts`,
 * which requires a database URL, three signing secrets and two app URLs before
 * it will parse. That was fine for the two callers inside the server and wrong
 * for the third: `scripts/sandboxPass.ts` calls an external API and writes
 * files, and had to satisfy the whole server's configuration to do it.
 *
 * So the SHAPE lives here, with no imports beyond the documented defaults, and
 * `config.ts` is one of the things that BUILDS one — from env, as before. The
 * sandbox pass builds another, from the Randox credentials alone. Both hand it
 * to the same `RandoxHttpClient`, which is the point: the script exercises the
 * real transport, real auth, real pacing and real retry, so what it captures is
 * a record of what this integration actually sends.
 */

/**
 * Pacing and recovery, per connection.
 *
 * On the connection rather than read from `env` inside the client, because
 * "how fast may I call" and "how many times may I retry" are properties of the
 * API being called. A caller that has no env can still state them, and a caller
 * that has one still reads them from there.
 */
export interface RandoxTransportSettings {
  /** Client-side floor between requests, per API. A ceiling is not a target. */
  maxRequestsPerMinute: number;
  /** Transient failures only (429, 5xx, timeout). Never a create. */
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
  /** Send an Azure B2C bearer alongside the subscription key. Documented as required. */
  bearerTokenEnabled: boolean;
}

export const DEFAULT_TRANSPORT_SETTINGS: RandoxTransportSettings = { ...RANDOX_TRANSPORT_DEFAULTS };

export interface RandoxApiConnection {
  /** Human name used in errors, logs and as the rate limiter's key. */
  label: string;
  baseUrl: string;
  clientId: string;
  scope: string;
  subscriptionKey: string;
  tokenUrl: string;
  username: string;
  password: string;
  /**
   * Required rather than optional-with-a-fallback. An omitted block would
   * silently pace and retry at values nobody chose, on a connection to a third
   * party with a documented rate limit — a compile error is the cheaper way to
   * find that out.
   */
  transport: RandoxTransportSettings;
}
