import type { Role } from '@prisma/client'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app'
import { prisma } from '../db'
import { createCredentialUser } from '../lib/users'
import { signIn } from '../test/auth'

const AGENT = 'agent-users-route@test.com'
const ADMIN = 'admin-users-route@test.com'
const BLOCKED = 'blocked-users-route@test.com'
const SORT = ['Zzz', 'Aaa', 'Mmm'].map(n => ({
  name: `${n} Sort`,
  email: `${n.toLowerCase()}-sort-users-route@test.com`,
}))
const emails = [AGENT, ADMIN, BLOCKED, ...SORT.map(u => u.email)]

let agentCookie: string
let adminCookie: string

interface PublicUser {
  id: string
  name: string
  email: string
  role: Role
  isBlocked: boolean
}

beforeAll(async () => {
  await createCredentialUser({
    email: AGENT,
    password: 'password123',
    name: 'Users Route Agent',
  })
  await createCredentialUser({
    email: ADMIN,
    password: 'password123',
    name: 'Users Route Admin',
    role: 'ADMIN',
  })
  await createCredentialUser({
    email: BLOCKED,
    password: 'password123',
    name: 'Users Route Blocked',
  })
  for (const u of SORT) {
    await createCredentialUser({ ...u, password: 'password123' })
  }
  agentCookie = await signIn(AGENT, 'password123')
  adminCookie = await signIn(ADMIN, 'password123')
  await prisma.user.update({
    where: { email: BLOCKED },
    data: { isBlocked: true },
  })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails } } })
})

describe('GET /api/users', () => {
  it('lists users with only public fields', async () => {
    const res = await request(app).get('/api/users').set('Cookie', agentCookie)
    expect(res.status).toBe(200)
    for (const u of res.body.users) {
      expect(Object.keys(u).sort()).toEqual(['email', 'id', 'isBlocked', 'name', 'role'])
    }
  })

  it('sorts users by name ascending', async () => {
    const res = await request(app).get('/api/users').set('Cookie', agentCookie)
    const owned = res.body.users
      .filter((u: PublicUser) => SORT.some(s => s.email === u.email))
      .map((u: PublicUser) => u.name)
    expect(owned).toEqual(['Aaa Sort', 'Mmm Sort', 'Zzz Sort'])
  })

  it('includes blocked users with isBlocked true', async () => {
    const res = await request(app).get('/api/users').set('Cookie', agentCookie)
    const blocked = res.body.users.find((u: PublicUser) => u.email === BLOCKED)
    expect(blocked?.isBlocked).toBe(true)
  })

  it('is available to AGENT, not only ADMIN', async () => {
    const agent = await request(app).get('/api/users').set('Cookie', agentCookie)
    const admin = await request(app).get('/api/users').set('Cookie', adminCookie)
    expect(agent.status).toBe(200)
    expect(admin.status).toBe(200)
    const adminRow = agent.body.users.find((u: PublicUser) => u.email === ADMIN)
    expect(adminRow?.role).toBe('ADMIN')
  })

  it('returns 401 without a session', async () => {
    const res = await request(app).get('/api/users')
    expect(res.status).toBe(401)
  })
})
