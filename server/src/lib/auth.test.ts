import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../db'
import { env } from '../env'
import { auth } from './auth'
import { createCredentialUser } from './users'

const ACTIVE = 'auth-active@test.com'
const BLOCKED = 'auth-blocked@test.com'
const SIGNUP = 'auth-signup@test.com'
const PASSWORD = 'password123'

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [ACTIVE, BLOCKED, SIGNUP] } } })
  await createCredentialUser({ email: ACTIVE, password: PASSWORD, name: 'Active' })
  const blocked = await createCredentialUser({
    email: BLOCKED,
    password: PASSWORD,
    name: 'Blocked',
  })
  await prisma.user.update({ where: { id: blocked.id }, data: { isBlocked: true } })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [ACTIVE, BLOCKED, SIGNUP] } } })
})

describe('createCredentialUser', () => {
  it('creates an AGENT with a hashed credential account', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: ACTIVE },
      include: { accounts: true },
    })
    expect(user.role).toBe('AGENT')
    expect(user.accounts).toHaveLength(1)
    expect(user.accounts[0].providerId).toBe('credential')
    expect(user.accounts[0].accountId).toBe(user.id)
    expect(user.accounts[0].password).toBeTruthy()
    expect(user.accounts[0].password).not.toBe(PASSWORD)
  })
})

describe('auth.api.signInEmail', () => {
  it('signs in with valid credentials', async () => {
    const result = await auth.api.signInEmail({ body: { email: ACTIVE, password: PASSWORD } })
    expect(result.user.email).toBe(ACTIVE)
  })

  it('rejects a wrong password', async () => {
    await expect(
      auth.api.signInEmail({ body: { email: ACTIVE, password: 'wrong-password' } }),
    ).rejects.toMatchObject({ status: 'UNAUTHORIZED' })
  })

  it('rejects an unknown email', async () => {
    await expect(
      auth.api.signInEmail({ body: { email: 'nobody@test.com', password: PASSWORD } }),
    ).rejects.toMatchObject({ status: 'UNAUTHORIZED' })
  })

  it('rejects a blocked user with the correct password and creates no session', async () => {
    await expect(
      auth.api.signInEmail({ body: { email: BLOCKED, password: PASSWORD } }),
    ).rejects.toMatchObject({ status: 'UNAUTHORIZED' })

    const sessions = await prisma.session.count({ where: { user: { email: BLOCKED } } })
    expect(sessions).toBe(0)
  })
})

describe('auth.api.signUpEmail', () => {
  it('is disabled', async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: SIGNUP, password: PASSWORD, name: 'Nope' } }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' })

    expect(await prisma.user.count({ where: { email: SIGNUP } })).toBe(0)
  })
})

describe('trustedOrigins', () => {
  it('trusts the client origin', () => {
    expect(auth.options.trustedOrigins).toContain(env.CLIENT_URL)
  })
})

describe('sign-in errors', () => {
  it('returns the same error for a wrong password and a blocked account', async () => {
    const wrong = await auth.api
      .signInEmail({ body: { email: ACTIVE, password: 'wrong-password' } })
      .catch(e => e)
    const blocked = await auth.api
      .signInEmail({ body: { email: BLOCKED, password: PASSWORD } })
      .catch(e => e)
    expect(blocked.status).toBe(wrong.status)
    expect(blocked.body).toEqual(wrong.body)
  })
})
