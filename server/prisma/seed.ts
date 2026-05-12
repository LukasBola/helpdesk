import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@helpdesk.local'
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123'

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Admin',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'ADMIN',
    },
  })
  console.log(`Seeded admin: ${email}`)
}

void main().finally(() => prisma.$disconnect())
