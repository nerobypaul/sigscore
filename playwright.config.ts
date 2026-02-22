import { defineConfig, devices } from '@playwright/test';

const isRemote = !!process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Skip local webServer startup when testing against a remote URL
  ...(isRemote ? {} : {
    webServer: [
      {
        command: 'npm run dev --workspace=backend',
        url: 'http://localhost:4000/health',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
      {
        command: 'npm run dev --workspace=frontend',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
    ],
  }),
});
