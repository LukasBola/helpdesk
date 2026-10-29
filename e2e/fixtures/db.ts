import { execSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..', '..')

// Runs server/prisma/e2e-fixtures.ts against the dev database.
function fixtures(...args: string[]) {
  execSync(`pnpm --filter server e2e:fixtures ${args.join(' ')}`, { cwd: ROOT, stdio: 'ignore' })
}

export const db = {
  seed: () => fixtures('seed'),
  block: (email: string) => fixtures('block', email),
  unblock: (email: string) => fixtures('unblock', email),
}
