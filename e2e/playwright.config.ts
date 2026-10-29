import { defineConfig, devices } from '@playwright/test'

import { STORAGE_STATE } from './fixtures/users'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

// Firefox and WebKit are installed (`pnpm e2e:install`) but the suite runs on Chrome only.
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL: BASE_URL,
    locale: 'pl-PL',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: { slowMo: Number(process.env.E2E_SLOWMO ?? 0) },
  },
  projects: [
    // Logs in once per role through the LoginPage POM and saves the session cookies.
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE.admin },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'pnpm dev',
    cwd: '..',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
