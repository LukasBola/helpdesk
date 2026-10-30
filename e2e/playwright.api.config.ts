import { defineConfig } from '@playwright/test'

import { BASE_URL, sharedConfig } from './playwright.shared'

// Frontend ↔ backend contract: HTTP calls through the Vite proxy, no browser needed.
// A separate config so the VS Code extension shows these tests enabled next to the UI ones.
export default defineConfig({
  ...sharedConfig('-api'),
  projects: [{ name: 'api', testDir: './api', use: { extraHTTPHeaders: { Origin: BASE_URL } } }],
})
