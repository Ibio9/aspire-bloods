import { RandoxAuthError } from '../errors.js';
import type { RandoxApiConnection } from '../config.js';

interface TokenResponse {
  access_token?: string;
  id_token?: string;
  expires_in?: number | string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface CachedToken {
  value: string;
  /** Epoch ms. Already includes the safety margin. */
  expiresAt: number;
}

/**
 * Azure AD B2C resource-owner-password-credentials token client, shared by
 * both Randox APIs.
 *
 * The two APIs have different client ids, scopes, base URLs and
 * subscription keys, but the token mechanism is identical — so this class
 * is instantiated once per API rather than duplicated. Each instance keeps
 * its own cache: a Nexus token is not a Booking token, and they expire
 * independently.
 *
 * A token is fetched once and reused until it expires. It is NOT fetched
 * per call. The only things that trigger a new token are expiry (with a
 * margin) and an explicit invalidate() from the HTTP layer after a 401.
 *
 * Concurrent callers share one in-flight request (`pending`) — without
 * that, ten orders polled in the same tick would open ten identical token
 * requests against B2C, which rate-limits.
 */
export class B2CTokenClient {
  private cached: CachedToken | null = null;
  private pending: Promise<string> | null = null;

  /**
   * Refresh this long before the token actually expires. A token that
   * expires mid-flight produces a 401 that the HTTP layer would have to
   * retry; the margin makes that the exception rather than routine.
   */
  private static readonly EXPIRY_MARGIN_MS = 60_000;

  constructor(private readonly connection: RandoxApiConnection) {}

  async getToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.value;
    if (this.pending) return this.pending;

    this.pending = this.requestToken().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  /**
   * Drops the cached token. Called by the HTTP layer on a 401 so the next
   * attempt acquires a fresh one — the retry path for a token that was
   * revoked or expired early, not a routine refresh.
   */
  invalidate(): void {
    this.cached = null;
  }

  private async requestToken(): Promise<string> {
    const { tokenUrl, clientId, scope, username, password, label } = this.connection;

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      scope,
      username,
      password,
      // B2C's ROPC policy returns the access token only when it's asked for
      // explicitly; without this some tenants return an id_token alone.
      response_type: 'token id_token',
    });

    let res: Response;
    try {
      res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (e) {
      throw new RandoxAuthError(
        `Could not reach the ${label} token endpoint: ${e instanceof Error ? e.message : 'network error'}`,
        label,
      );
    }

    const text = await res.text();
    let parsed: TokenResponse;
    try {
      parsed = JSON.parse(text) as TokenResponse;
    } catch {
      throw new RandoxAuthError(`${label} token endpoint returned a non-JSON response (HTTP ${res.status}).`, label);
    }

    if (!res.ok) {
      // error_description carries the actual cause (bad password, wrong
      // scope, policy not enabled for ROPC). It does not contain the
      // password itself — B2C never echoes it — so it is safe to log.
      throw new RandoxAuthError(
        `${label} token request failed (HTTP ${res.status}): ${parsed.error_description ?? parsed.error ?? text.slice(0, 300)}`,
        label,
      );
    }

    const token = parsed.access_token ?? parsed.id_token;
    if (!token) {
      throw new RandoxAuthError(`${label} token response contained neither access_token nor id_token.`, label);
    }

    // expires_in is seconds and has been seen as a string on some B2C
    // policies. A missing or unparseable value falls back to a
    // conservative 5 minutes rather than caching indefinitely.
    const expiresInSeconds = Number(parsed.expires_in);
    const ttlMs = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds * 1000 : 300_000;

    this.cached = {
      value: token,
      expiresAt: Date.now() + Math.max(ttlMs - B2CTokenClient.EXPIRY_MARGIN_MS, 10_000),
    };
    return token;
  }
}
