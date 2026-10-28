import { prisma } from '../src/db'
import { ensureCredentialUser } from '../src/lib/users'

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@helpdesk.local'
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123'

  if (!process.env.SEED_ADMIN_PASSWORD && process.env.NODE_ENV !== 'test') {
    console.warn(
      'WARNING: Using default admin password. Set SEED_ADMIN_PASSWORD before running in production.',
    )
  }

  const result = await ensureCredentialUser({ email, password, name: 'Admin', role: 'ADMIN' })
  console.log(`Admin ${email}: ${result}`)
}

void main().finally(() => prisma.$disconnect())
