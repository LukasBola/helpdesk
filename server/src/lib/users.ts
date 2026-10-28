import type { Role, User } from '@prisma/client'

import { prisma } from '../db'
import { auth } from './auth'

interface NewCredentialUser {
  email: string
  password: string
  name: string
  role?: Role
}

// Public sign-up is disabled, so users are created here: Better Auth's own hasher,
// then User + credential Account in one transaction (same as its admin plugin).
export async function createCredentialUser({
  email,
  password,
  name,
  role = 'AGENT',
}: NewCredentialUser): Promise<User> {
  const ctx = await auth.$context
  const hashedPassword = await ctx.password.hash(password)

  return prisma.$transaction(async tx => {
    const user = await tx.user.create({
      data: { email: email.toLowerCase(), name, role, emailVerified: true },
    })
    await tx.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: hashedPassword,
      },
    })
    return user
  })
}
