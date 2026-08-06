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
    // Overridable for the same reason vite.config.ts takes DEV_WEB_PORT: a
    // second checkout of this repo (a git worktree on another branch) runs
    // its own stack on its own ports, and the specs should be runnable
    // against it without editing this file. Default unchanged.
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
