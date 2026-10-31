import path from 'node:path'

import { defineConfig, devices } from '@playwright/test'

import { STORAGE_STATE } from './fixtures/users'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

// Same env as the dev server (e.g. POSTMARK_WEBHOOK_TOKEN for the webhook tests).
try {
  process.loadEnvFile(path.join(import.meta.dirname, '..', '.env'))
} catch {
  // No .env: tests that need a secret skip themselves.
}

const headless = process.env.E2E_HEADLESS ?? 'true'
if (headless !== 'true' && headless !== 'false') {
  throw new Error('E2E_HEADLESS must be "true" or "false"')
}

// Firefox and WebKit are installed (`pnpm e2e:install`) but the suite runs on Chrome only.
export default defineConfig({
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
    headless: headless === 'true',
    locale: 'pl-PL',
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: { slowMo: Number(process.env.E2E_SLOWMO ?? 0) },
  },
  projects: [
    // Logs in once per role through the LoginPage POM and saves the session cookies.
    {
      name: 'setup',
      testDir: './tests',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      testDir: './tests',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE.admin },
      dependencies: ['setup'],
    },
    // Frontend ↔ backend contract: HTTP calls through the Vite proxy, no browser needed.
    { name: 'api', testDir: './api', use: { extraHTTPHeaders: { Origin: BASE_URL } } },
  ],
  webServer: {
    command: 'pnpm dev',
    cwd: '..',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
