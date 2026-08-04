import type { Response } from 'express';
import { env } from '../config/env.js';

const isProd = env.NODE_ENV === 'production';

const baseCookieOpts = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  domain: isProd ? env.COOKIE_DOMAIN : undefined,
  path: '/',
};

export function setAccessTokenCookie(res: Response, token: string) {
  res.cookie('access_token', token, {
    ...baseCookieOpts,
    maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
  });
}

export function setRefreshTokenCookie(res: Response, token: string) {
  res.cookie('refresh_token', token, {
    ...baseCookieOpts,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

/** Non-httpOnly by design — the SPA reads this and echoes it as X-CSRF-Token (double-submit pattern). */
export function setCsrfCookie(res: Response, token: string) {
  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    domain: isProd ? env.COOKIE_DOMAIN : undefined,
    path: '/',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function setTrustedDeviceCookie(res: Response, deviceId: string) {
  res.cookie('device_id', deviceId, {
    ...baseCookieOpts,
    maxAge: env.TRUSTED_DEVICE_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  for (const name of ['access_token', 'refresh_token', 'csrf_token']) {
    res.clearCookie(name, { ...baseCookieOpts });
  }
}
