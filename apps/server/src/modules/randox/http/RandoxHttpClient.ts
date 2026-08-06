import { B2CTokenClient } from '../auth/B2CTokenClient.js';
import { RandoxApiError, RandoxWindowExpiredError, looksLikeWindowExpired } from '../errors.js';
import type { RandoxApiConnection } from '../config.js';

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
}

/**
 * One HTTP client per Randox API. Adds the bearer token and the
 * Ocp-Apim-Subscription-Key to every request (both are required on every
 * call, on both APIs), and retries exactly once on a 401 with a freshly
 * acquired token.
 *
 * The 401 retry is once, not a loop: if a brand-new token is also
 * rejected, the credentials or the subscription are wrong and retrying
 * would just burn through B2C's rate limit while the same call keeps
 * failing.
 */
export class RandoxHttpClient {
  private readonly tokens: B2CTokenClient;

  private static readonly DEFAULT_TIMEOUT_MS = 30_000;

  constructor(private readonly connection: RandoxApiConnection) {
    this.tokens = new B2CTokenClient(connection);
  }

  get label(): string {
    return this.connection.label;
  }

  async request<T>(path: string, options: RandoxRequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const method = options.method ?? 'GET';

    let res = await this.send(url, method, options);
    if (res.status === 401) {
      // Token rejected — could be revoked, or expired earlier than its
      // stated lifetime. Drop it and try once with a new one.
      this.tokens.invalidate();
      res = await this.send(url, method, options);
    }

    const text = await res.text();

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
