import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../db'
import { auth } from './auth'
import { createCredentialUser, ensureCredentialUser } from './users'

const NEW = 'ensure-new@test.com'
const ORPHAN = 'ensure-orphan@test.com'
const POLICY = 'policy@test.com'
const PASSWORD = 'password123'
const EMAILS = [NEW, ORPHAN, POLICY]

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } })
})

describe('createCredentialUser password policy', () => {
  it('rejects a password shorter than 8 characters', async () => {
    await expect(
      createCredentialUser({ email: POLICY, password: 'short', name: 'P' }),
    ).rejects.toThrow(/password/i)
    expect(await prisma.user.count({ where: { email: POLICY } })).toBe(0)
  })

  it('rejects a password longer than 128 characters', async () => {
    await expect(
      createCredentialUser({ email: POLICY, password: 'a'.repeat(129), name: 'P' }),
    ).rejects.toThrow(/password/i)
    expect(await prisma.user.count({ where: { email: POLICY } })).toBe(0)
  })

  it('rejects a malformed email', async () => {
    await expect(
      createCredentialUser({ email: 'not-an-email', password: PASSWORD, name: 'P' }),
    ).rejects.toThrow(/email/i)
  })
})

describe('ensureCredentialUser', () => {
  it('creates the user when missing', async () => {
    const result = await ensureCredentialUser({ email: NEW, password: PASSWORD, name: 'New' })
    expect(result).toBe('created')
    expect(await prisma.account.count({ where: { user: { email: NEW } } })).toBe(1)
  })

  it('is idempotent for a mixed-case email', async () => {
    const result = await ensureCredentialUser({
      email: 'Ensure-New@Test.com',
      password: PASSWORD,
      name: 'New',
    })
    expect(result).toBe('exists')
    expect(await prisma.user.count({ where: { email: NEW } })).toBe(1)
  })

  it('adds a credential account to a user that has none, so they can sign in', async () => {
    await prisma.user.create({ data: { email: ORPHAN, name: 'Orphan', role: 'ADMIN' } })

    const result = await ensureCredentialUser({
      email: ORPHAN,
      password: PASSWORD,
      name: 'Orphan',
    })
    expect(result).toBe('linked')

    const signedIn = await auth.api.signInEmail({ body: { email: ORPHAN, password: PASSWORD } })
    expect(signedIn.user.email).toBe(ORPHAN)
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ORPHAN } })
    expect(user.role).toBe('ADMIN')
  })
})
