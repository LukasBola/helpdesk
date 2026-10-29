import { execSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..', '..')

// Runs server/prisma/e2e-fixtures.ts against the dev database.
function fixtures(...args: string[]) {
  execSync(`pnpm --filter server e2e:fixtures ${args.join(' ')}`, { cwd: ROOT, stdio: 'ignore' })
}

const USER_ID_MARKER = 'E2E_USER_ID='

export const db = {
  // Prisma query logs share stdout, so the id is printed behind a marker.
  userId: (email: string): string => {
    const out = execSync(`pnpm --filter server e2e:fixtures user-id ${email}`, {
      cwd: ROOT,
      encoding: 'utf8',
    })
    const line = out.split('\n').find(l => l.startsWith(USER_ID_MARKER))
    if (!line) throw new Error(`user not found: ${email}`)
    return line.slice(USER_ID_MARKER.length).trim()
  },
  seed: () => fixtures('seed'),
  block: (email: string) => fixtures('block', email),
  unblock: (email: string) => fixtures('unblock', email),
}
