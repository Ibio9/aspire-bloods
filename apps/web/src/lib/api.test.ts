import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_TIMEOUT_ERROR_CODE } from '@aspire-bloods/shared';
import { apiFetch, ApiError } from './api';

/**
 * ===========================================================================
 *  AN EXPIRED ACCESS TOKEN IS BOOKKEEPING. AN IDLE SESSION IS A DECISION.
 * ===========================================================================
 *
 * The distinction this file exists to hold. A patient was signed out fifteen
 * minutes into an ordinary session because a background timer had been silently
 * restarted and the 15-minute access token lapsed — and the app treated that
 * 401 exactly as it treats "your session has timed out", which it is not.
 *
 * Fixing the timer was necessary and is not sufficient: a timer is a thing that
 * can be missed. A suspended laptop, a backgrounded tab, a reload, one slow
 * request — any of them can put the token past its life, and none of them is a
 * reason to end somebody's session mid-read. So a non-idle 401 buys one silent
 * rotation and one retry, and the idle 401 buys nothing, because the idle 401
 * is the server exercising the timeout rather than an accident of bookkeeping.
 */

const okJson = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const unauthorised = (body: unknown = { error: 'Session expired' }) =>
  new Response(JSON.stringify(body), { status: 401, headers: { 'content-type': 'application/json' } });

/** Every call the code under test made, in order, as `METHOD /path`. */
function calls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([url, init]) => {
    const path = String(url).replace(/^.*\/api/, '');
    return `${(init as RequestInit | undefined)?.method ?? 'GET'} ${path}`;
  });
}

describe('apiFetch and the access token', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // NO JSDOM — this suite runs in node, deliberately (see RangeBar.test.tsx
    // for the same stance).  touches exactly one global, so
    // exactly one global is stubbed. The CSRF token is read from it per
    // attempt, because a rotation issues a new one and a retry replaying the
    // old header would fail CSRF instead of succeeding.
    vi.stubGlobal('document', { cookie: 'csrf_token=first' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rotates once and retries when the token has simply lapsed', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorised())
      .mockResolvedValueOnce(okJson({ status: 'refreshed' }))
      .mockResolvedValueOnce(okJson({ markers: [] }));

    await expect(apiFetch('/patient/overview')).resolves.toEqual({ markers: [] });
    expect(calls(fetchMock)).toEqual([
      'GET /patient/overview',
      'POST /auth/refresh',
      'GET /patient/overview',
    ]);
  });

  it('does NOT retry an idle timeout — that 401 is the timeout working', async () => {
    fetchMock.mockResolvedValueOnce(unauthorised({ error: 'Signed out', code: IDLE_TIMEOUT_ERROR_CODE }));

    await expect(apiFetch('/patient/overview')).rejects.toBeInstanceOf(ApiError);
    // One call and no rotation: retrying would be the client trying to talk the
    // server out of a decision it has already taken.
    expect(calls(fetchMock)).toEqual(['GET /patient/overview']);
  });

  it('does not retry the auth calls themselves, so a dead refresh token cannot loop', async () => {
    for (const path of ['/auth/refresh', '/auth/login', '/auth/logout', '/auth/otp/verify']) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(unauthorised());
      await expect(apiFetch(path, { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
      expect(calls(fetchMock), path).toEqual([`POST ${path}`]);
    }
  });

  it('surfaces the original failure when the rotation itself is refused', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorised())
      .mockResolvedValueOnce(unauthorised({ error: 'Session expired, please log in again' }));

    await expect(apiFetch('/patient/overview')).rejects.toMatchObject({ status: 401 });
    // Rotation attempted once, and the request NOT retried against a token that
    // was never issued.
    expect(calls(fetchMock)).toEqual(['GET /patient/overview', 'POST /auth/refresh']);
  });

  it('shares ONE rotation between everything that lapsed at the same moment', async () => {
    /**
     * A page mid-load can have half a dozen requests in flight. Rotating once
     * per 401 would have them revoke each other — the refresh token rotates on
     * use — and all but one would come back 401 for real, turning a recoverable
     * moment into a sign-out. This is the single-flight guard.
     */
    let refreshes = 0;
    fetchMock.mockImplementation(async (url: string) => {
      const path = String(url);
      if (path.includes('/auth/refresh')) {
        refreshes += 1;
        await new Promise((r) => setTimeout(r, 5));
        return okJson({ status: 'refreshed' });
      }
      // Every business call fails once, then succeeds.
      return refreshes === 0 ? unauthorised() : okJson({ ok: true });
    });

    await Promise.all([
      apiFetch('/patient/overview'),
      apiFetch('/patient/reports'),
      apiFetch('/patient/markers'),
      apiFetch('/auth/me'),
    ]);

    expect(refreshes, 'one rotation, however many requests lapsed together').toBe(1);
  });

  it('sends the CSRF token the rotation issued, not the one the first attempt used', async () => {
    // The refresh endpoint issues a new csrf cookie. A retry replaying the old
    // header would fail CSRF rather than succeed, which would look exactly like
    // the failure this whole mechanism exists to prevent.
    const seen: (string | null)[] = [];
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const headers = new Headers(init?.headers);
      const path = String(url);
      if (path.includes('/auth/refresh')) {
        (globalThis.document as unknown as { cookie: string }).cookie = 'csrf_token=second';
        return okJson({ status: 'refreshed' });
      }
      seen.push(headers.get('X-CSRF-Token'));
      return seen.length === 1 ? unauthorised() : okJson({ ok: true });
    });

    await apiFetch('/patient/results-ready/seen', { method: 'POST' });
    expect(seen).toEqual(['first', 'second']);
  });
});
