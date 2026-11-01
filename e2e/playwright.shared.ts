import path from 'node:path'

import type { PlaywrightTestConfig } from '@playwright/test'

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

// Same env as the dev server (e.g. POSTMARK_WEBHOOK_TOKEN for the webhook tests).
try {
  process.loadEnvFile(path.join(import.meta.dirname, '..', '.env'))
} catch {
  // No .env: tests that need a secret skip themselves.
}

// Settings shared by the UI config (playwright.config.ts) and the API config
// (playwright.api.config.ts). Each config writes its results to its own folders.
export function sharedConfig(suffix = ''): PlaywrightTestConfig {
  return {
    outputDir: `./test-results${suffix}`,
    globalSetup: './global-setup.ts',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: [
      ['list'],
      ['html', { outputFolder: `playwright-report${suffix}`, open: 'never' }],
      ['junit', { outputFile: `test-results${suffix}/junit.xml` }],
    ],
    use: {
      baseURL: BASE_URL,
      locale: 'pl-PL',
      trace: 'retain-on-failure',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
      launchOptions: { slowMo: Number(process.env.E2E_SLOWMO ?? 0) },
    },
    webServer: {
      command: 'pnpm dev',
      cwd: '..',
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  }
}
