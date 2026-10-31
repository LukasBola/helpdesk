import { defineConfig } from '@playwright/test'

// Checks the step-log reporter itself (`pnpm e2e:reporter:test`, also in CI).
// No app or database needed; the cases use Chromium (`pnpm exec playwright install chromium`).
export default defineConfig({ testDir: '.', testMatch: '*.spec.ts', reporter: 'list' })
