import { B2CTokenClient } from '../auth/B2CTokenClient.js';
import { RandoxApiError, RandoxWindowExpiredError, looksLikeWindowExpired } from '../errors.js';
import { env } from '../../../config/env.js';
import type { RandoxApiConnection } from '../config.js';
import { RequestRateLimiter, sleep } from './rateLimiter.js';

export interface RandoxRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /**
   * Operations with a limited window (amend, cancel, reschedule, confirm a
   * hold). When set, a rejection that reads like "that window has closed"
   * is thrown as RandoxWindowExpiredError rather than RandoxApiError, so
   * callers can treat it as an expected outcome instead of a fault.
   */
  windowedOperation?: { name: string; orderNumber: string };
  timeoutMs?: number;
  /**
   * Whether this call may be repeated after a transient failure.
   *
   * Default true, because almost everything here is a read. It is set FALSE
   * for CreatePendingOrder, and that exception is the reason the flag
   * exists: a 502 from a gateway says nothing about whether the request
   * reached the laboratory, and a retried create is a second real order for
   * a real patient — who is then bled and billed twice. A create that fails
   * ambiguously fails loudly and a human decides.
   */
  retryable?: boolean;
}

/** HTTP statuses worth trying again. Everything else is a decision, not a blip. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * One HTTP client per Randox API. Adds the bearer token and the
 * Ocp-Apim-Subscription-Key to every request (both are required on every
 * call, on both APIs), paces outbound calls, and retries transient failures
 * with exponential backoff.
 *
 * Three distinct recovery behaviours, deliberately separate:
 *
 *   401  → the token is dropped and re-acquired, ONCE. If a brand-new token
 *          is also rejected, the credentials or the subscription are wrong
 *          and retrying would burn B2C's rate limit while failing the same
 *          way. Not counted against the transient-retry budget: it is a
 *          different fault with a different fix.
 *   429  → honours Retry-After, and pushes the whole connection's rate
 *          limiter back, not just this request. Being told to slow down and
 *          then immediately letting nine queued calls through is not slowing
 *          down.
 *   5xx / network / timeout
 *        → exponential backoff with jitter, up to RANDOX_RETRY_MAX_ATTEMPTS.
 *          Jitter matters because the poll sweep is a loop: without it, a
 *          Randox blip re-synchronises every order onto the same retry
 *          instant, which is the stampede the stagger exists to prevent.
 *
 * When everything is exhausted the error is thrown, and the caller (the poll
 * sweep) records it against the order and backs that order off. A failing
 * Randox never loses an order and never stops the job.
 */
export class RandoxHttpClient {
  private readonly tokens: B2CTokenClient;
  private readonly limiter: RequestRateLimiter;

  private static readonly DEFAULT_TIMEOUT_MS = 30_000;
  /** Cap on any single backoff wait, however large Retry-After says. */
  private static readonly MAX_BACKOFF_MS = 60_000;

  constructor(private readonly connection: RandoxApiConnection) {
    this.tokens = new B2CTokenClient(connection);
    this.limiter = new RequestRateLimiter(env.RANDOX_MAX_REQUESTS_PER_MINUTE);
  }

  get label(): string {
    return this.connection.label;
  }

  async request<T>(path: string, options: RandoxRequestOptions = {}): Promise<T> {
    const { res, text } = await this.requestRaw(path, options);
    return this.readBody<T>(path, options, res, text);
  }

  /**
   * The transport half, without body parsing — so a caller that needs to see
   * the status code itself (the reference-data GET/POST probe) can, without
   * re-implementing auth, pacing and retry.
   */
  async requestRaw(
    path: string,
    options: RandoxRequestOptions = {},
  ): Promise<{ res: Response; text: string }> {
    const url = this.buildUrl(path, options.query);
    const method = options.method ?? 'GET';
    const retryable = options.retryable !== false;
    const maxAttempts = retryable ? Math.max(1, env.RANDOX_RETRY_MAX_ATTEMPTS) : 1;

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.limiter.acquire();

      let res: Response;
      try {
        res = await this.send(url, method, options);
      } catch (e) {
        // A timeout or a dropped connection. Ambiguous for a create — which
        // is precisely why a create is never retryable.
        lastError = e;
        if (attempt >= maxAttempts) throw e;
        await sleep(this.backoffFor(attempt, null));
        continue;
      }

      if (res.status === 401) {
        // Token rejected — could be revoked, or expired earlier than its
        // stated lifetime. Drop it and try once with a new one. Outside the
        // transient budget: see the class comment.
        this.tokens.invalidate();
        await this.limiter.acquire();
        res = await this.send(url, method, options);
      }

      if (res.ok || !RETRYABLE_STATUSES.has(res.status) || attempt >= maxAttempts) {
        return { res, text: await res.text() };
      }

      // Read the body before waiting — a Response left unread holds its
      // socket open for the whole backoff.
      const text = await res.text();
      lastError = new RandoxApiError(
        `${this.connection.label} ${method} ${path} failed with HTTP ${res.status}`,
        res.status,
        path,
        text.slice(0, 2000),
      );

      const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
      if (res.status === 429) {
        // The gateway is limiting the whole connection, not this one call.
        this.limiter.backOff(retryAfterMs ?? RandoxHttpClient.MAX_BACKOFF_MS / 4);
      }
      await sleep(this.backoffFor(attempt, retryAfterMs));
    }

    // Unreachable in practice — the loop either returns or throws — but a
    // fall-through that returned undefined would be a silent empty result.
    throw lastError ?? new RandoxApiError(`${this.connection.label} ${method} ${path} failed`, 0, path);
  }

  /**
   * Parses a response the caller obtained through requestRaw. Same error
   * behaviour as request(), so a body that arrived down the probe path fails
   * exactly as one that arrived down the ordinary path.
   */
  readReferenceBody<T>(path: string, res: Response, text: string): T {
    return this.readBody<T>(path, { method: 'GET' }, res, text);
  }

  private readBody<T>(path: string, options: RandoxRequestOptions, res: Response, text: string): T {
    const method = options.method ?? 'GET';

    if (!res.ok) {
      if (options.windowedOperation && looksLikeWindowExpired(res.status, text)) {
        throw new RandoxWindowExpiredError(
          options.windowedOperation.name,
          options.windowedOperation.orderNumber,
          `${this.connection.label} rejected ${options.windowedOperation.name} for order ${options.windowedOperation.orderNumber}: the window for this change has passed (HTTP ${res.status}).`,
        );
      }
      throw new RandoxApiError(
        `${this.connection.label} ${method} ${path} failed with HTTP ${res.status}`,
        res.status,
        path,
        text.slice(0, 2000),
      );
    }

    if (!text.trim()) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new RandoxApiError(
        `${this.connection.label} ${method} ${path} returned a non-JSON body`,
        res.status,
        path,
        text.slice(0, 2000),
      );
    }
  }

  /**
   * Exponential, with full jitter on the exponential part. Retry-After, when
   * Randox send one, wins outright — they know their own recovery time
   * better than an exponent does — but is still capped, so a header saying
   * "an hour" doesn't wedge a poll sweep for an hour.
   */
  private backoffFor(attempt: number, retryAfterMs: number | null): number {
    if (retryAfterMs !== null) return Math.min(retryAfterMs, RandoxHttpClient.MAX_BACKOFF_MS);
    const base = env.RANDOX_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    const jitter = Math.random() * env.RANDOX_RETRY_BASE_DELAY_MS;
    return Math.min(base + jitter, RandoxHttpClient.MAX_BACKOFF_MS);
  }

  private buildUrl(path: string, query?: RandoxRequestOptions['query']): string {
    const url = new URL(`${this.connection.baseUrl}/${path.replace(/^\/+/, '')}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async send(url: string, method: string, options: RandoxRequestOptions): Promise<Response> {
    const token = await this.tokens.getToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? RandoxHttpClient.DEFAULT_TIMEOUT_MS);

    try {
      return await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Ocp-Apim-Subscription-Key': this.connection.subscriptionKey,
          Accept: 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new RandoxApiError(
          `${this.connection.label} ${method} request timed out after ${options.timeoutMs ?? RandoxHttpClient.DEFAULT_TIMEOUT_MS}ms`,
          504,
          url,
        );
      }
      throw new RandoxApiError(
        `${this.connection.label} ${method} request failed: ${e instanceof Error ? e.message : 'network error'}`,
        0,
        url,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Retry-After is either a number of seconds or an HTTP-date (RFC 9110).
 * Azure APIM sends seconds; the date form is accepted because the spec
 * permits it and treating "Wed, 21 Oct 2026 07:28:00 GMT" as NaN seconds
 * would silently discard the only instruction the gateway gave us.
 */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - Date.now());
}
