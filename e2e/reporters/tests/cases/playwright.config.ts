import { defineConfig } from '@playwright/test'

// Run by step-log.spec.ts in a child process; these cases fail on purpose.
// The JSON report lets the spec check the per-attempt step-log.txt attachment.
export default defineConfig({
  testDir: '.',
  testMatch: '*.case.ts',
  retries: 1,
  workers: 2,
  timeout: 2_000,
  reporter: [['../../step-log.ts'], ['json', { outputFile: 'test-results/report.json' }]],
})
