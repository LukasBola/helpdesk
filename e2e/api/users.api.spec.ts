import { expect, test } from '@playwright/test'

import { newApiContext, signInAs } from '../fixtures/api'
import { USERS } from '../fixtures/users'

test.describe('API /api/users', () => {
  test('U1 agent dostaje listę z pięcioma publicznymi polami', async () => {
    const agent = await signInAs('agent')
    const res = await agent.get('/api/users')
    expect(res.status()).toBe(200)
    const { users } = (await res.json()) as { users: Record<string, unknown>[] }
    expect(users.length).toBeGreaterThan(0)
    for (const u of users) {
      expect(Object.keys(u).sort()).toEqual(['email', 'id', 'isBlocked', 'name', 'role'])
    }
    expect(users).toContainEqual(
      expect.objectContaining({ email: USERS.admin.email, name: USERS.admin.name, role: 'ADMIN' }),
    )
  })

  test('U1 bez sesji: 401', async () => {
    const anon = await newApiContext()
    expect((await anon.get('/api/users')).status()).toBe(401)
  })
})
