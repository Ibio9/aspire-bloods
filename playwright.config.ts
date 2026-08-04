import { defineConfig, devices } from '@playwright/test';

/**
 * Assumes both dev servers are already running (see README — `npm run
 * dev:server` + `npm run dev:web`) against a migrated, seeded database.
 * Not auto-orchestrated here: the stack needs Postgres + two processes,
 * which is simpler to start explicitly than to encode as a single
 * Playwright webServer command.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // these specs share seeded accounts and mutate server state
  workers: 1, // also share the login rate limiter — parallel workers would race it
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
