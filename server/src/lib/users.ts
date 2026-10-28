import type { Role, User } from '@prisma/client'
import { z } from 'zod'

import { prisma } from '../db'
import { auth, PASSWORD_LENGTH } from './auth'

interface NewCredentialUser {
  email: string
  password: string
  name: string
  role?: Role
}

const credentialsSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z
    .string()
    .min(PASSWORD_LENGTH.min, `Password must be at least ${PASSWORD_LENGTH.min} characters`)
    .max(PASSWORD_LENGTH.max, `Password must be at most ${PASSWORD_LENGTH.max} characters`),
})

// Hashing directly skips Better Auth's endpoint validation, so apply the same rules here.
async function hashCredentials(email: string, password: string) {
  const result = credentialsSchema.safeParse({ email, password })
  if (!result.success) {
    throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  }
  const ctx = await auth.$context
  return { email: email.toLowerCase(), hashedPassword: await ctx.password.hash(password) }
}

function credentialAccount(userId: string, hashedPassword: string) {
  return { userId, accountId: userId, providerId: 'credential', password: hashedPassword }
}

// Public sign-up is disabled, so users are created here: Better Auth's own hasher,
// then User + credential Account in one transaction (same as its admin plugin).
export async function createCredentialUser({
  email,
  password,
  name,
  role = 'AGENT',
}: NewCredentialUser): Promise<User> {
  const credentials = await hashCredentials(email, password)

  return prisma.$transaction(async tx => {
    const user = await tx.user.create({
      data: { email: credentials.email, name, role, emailVerified: true },
    })
    await tx.account.create({ data: credentialAccount(user.id, credentials.hashedPassword) })
    return user
  })
}

// Idempotent variant for the seed: also repairs users left without a credential account
// (e.g. created before the Better Auth migration). Never changes an existing user's role.
export async function ensureCredentialUser(
  input: NewCredentialUser,
): Promise<'created' | 'linked' | 'exists'> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    include: { accounts: { where: { providerId: 'credential' } } },
  })
  if (!existing) {
    await createCredentialUser(input)
    return 'created'
  }
  if (existing.accounts.length > 0) {
    return 'exists'
  }
  const credentials = await hashCredentials(input.email, input.password)
  await prisma.account.create({ data: credentialAccount(existing.id, credentials.hashedPassword) })
  return 'linked'
}
