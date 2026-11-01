import { defineConfig, devices } from '@playwright/test'

import { STORAGE_STATE } from './fixtures/users'
import { sharedConfig } from './playwright.shared'

// UI tests in the browser. API contract tests live in playwright.api.config.ts.
// The VS Code extension enables only the first project of each config by default, so the
// UI project comes first; `setup` still runs before it as a dependency.
// Firefox and WebKit are installed (`pnpm e2e:install`) but the suite runs on Chrome only.
export default defineConfig({
  ...sharedConfig(),
  projects: [
    {
      name: 'chromium',
      testDir: './tests',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE.admin },
      dependencies: ['setup'],
    },
    // Logs in once per role through the LoginPage POM and saves the session cookies.
    {
      name: 'setup',
      testDir: './tests',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
