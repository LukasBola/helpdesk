import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../db'
import { createCredentialUser } from '../lib/users'
import { listUsers } from './userService'

const EMAIL = 'user-service-list@test.com'

beforeAll(async () => {
  await createCredentialUser({
    email: EMAIL,
    password: 'password123',
    name: 'User Service Listed',
  })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } })
})

describe('listUsers', () => {
  it('returns the created user', async () => {
    const users = await listUsers()
    const mine = users.find(u => u.email === EMAIL)
    expect(mine).toMatchObject({
      name: 'User Service Listed',
      role: 'AGENT',
      isBlocked: false,
    })
  })
})
