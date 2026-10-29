import { prisma } from '../src/db'
import { ensureCredentialUser } from '../src/lib/users'

// Dedicated users for the Playwright suite (e2e/), so tests don't depend on the admin's password.
// Keep in sync with e2e/fixtures/users.ts.
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-password-123'

async function main() {
  for (const user of [
    { email: 'e2e-admin@helpdesk.local', name: 'Ewa Admin', role: 'ADMIN' as const },
    { email: 'e2e-agent@helpdesk.local', name: 'Adam Agent', role: 'AGENT' as const },
  ]) {
    const result = await ensureCredentialUser({ ...user, password: PASSWORD })
    console.log(`E2E user ${user.email}: ${result}`)
  }
}

void main().finally(() => prisma.$disconnect())
