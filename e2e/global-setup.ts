import { execSync } from 'node:child_process'
import path from 'node:path'

// Ensures the e2e users exist in the dev database (idempotent).
export default function globalSetup() {
  execSync('pnpm --filter server seed:e2e', {
    cwd: path.join(import.meta.dirname, '..'),
    stdio: 'ignore',
  })
}
