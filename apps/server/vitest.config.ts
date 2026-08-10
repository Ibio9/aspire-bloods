import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      APP_BASE_URL: 'http://localhost:5173',
      API_BASE_URL: 'http://localhost:4000',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef0123456789',
      CSRF_SECRET: 'test-csrf-secret-0123456789abcdef0123456789',
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      FILE_SIGNING_SECRET: 'test-file-signing-secret-0123456789abcdef01234',
      // Outbound pacing off, and retry backoff down to nothing. Both are real
      // behaviour and both are tested directly (rateLimiter.test.ts,
      // randoxLiveTransport.test.ts) — but leaving the production values on
      // would make every stubbed HTTP call in the suite wait a second, which
      // turns a fast suite into a thirteen-second one for no extra coverage.
      RANDOX_MAX_REQUESTS_PER_MINUTE: '0',
      RANDOX_RETRY_BASE_DELAY_MS: '1',
    },
  },
});
