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
    },
  },
});
