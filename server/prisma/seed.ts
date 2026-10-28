import { prisma } from '../src/db'
import { createCredentialUser } from '../src/lib/users'

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@helpdesk.local'
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123'

  if (!process.env.SEED_ADMIN_PASSWORD && process.env.NODE_ENV !== 'test') {
    console.warn(
      'WARNING: Using default admin password. Set SEED_ADMIN_PASSWORD before running in production.',
    )
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Admin already exists: ${email}`)
    return
  }

  await createCredentialUser({ email, password, name: 'Admin', role: 'ADMIN' })
  console.log(`Seeded admin: ${email}`)
}

void main().finally(() => prisma.$disconnect())
