import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for running E2E tests against a remote deployment
 * (no local webServer needed).
 *
 * Usage: E2E_BASE_URL=https://sigscore.dev npx playwright test --config=playwright.remote.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,

  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://sigscore.dev',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // No webServer — we're testing against a live deployment
});
