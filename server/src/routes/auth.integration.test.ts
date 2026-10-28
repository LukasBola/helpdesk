import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app'
import { prisma } from '../db'
import { env } from '../env'
import { createCredentialUser } from '../lib/users'
import { signIn } from '../test/auth'

const EMAIL = 'auth-http@test.com'
const SIGNUP = 'auth-http-signup@test.com'
const PASSWORD = 'password123'

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, SIGNUP] } } })
  await createCredentialUser({ email: EMAIL, password: PASSWORD, name: 'Auth HTTP' })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, SIGNUP] } } })
})

describe('POST /api/auth/sign-in/email', () => {
  it('returns 200 and sets a session cookie on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email: EMAIL, password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 400 and no cookie when the password is missing', async () => {
    const res = await request(app).post('/api/auth/sign-in/email').send({ email: EMAIL })
    expect(res.status).toBe(400)
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('returns 400 when the email is malformed', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email: 'not-an-email', password: PASSWORD })
    expect(res.status).toBe(400)
  })

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email: EMAIL, password: 'wrong-password' })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/sign-up/email', () => {
  it('is disabled', async () => {
    const res = await request(app)
      .post('/api/auth/sign-up/email')
      .send({ email: SIGNUP, password: PASSWORD, name: 'Nope' })
    expect(res.status).toBe(400)
    expect(await prisma.user.count({ where: { email: SIGNUP } })).toBe(0)
  })
})

describe('GET /api/auth/get-session', () => {
  it('returns the user with role and isBlocked when signed in', async () => {
    const cookie = await signIn(EMAIL, PASSWORD)
    const res = await request(app).get('/api/auth/get-session').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ email: EMAIL, role: 'AGENT', isBlocked: false })
  })

  it('returns null when not signed in', async () => {
    const res = await request(app).get('/api/auth/get-session')
    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
  })
})

describe('POST /api/auth/sign-out', () => {
  it('invalidates the session', async () => {
    const cookie = await signIn(EMAIL, PASSWORD)

    // Requests carrying a session cookie must send a trusted Origin; JSON body avoids a "simple request".
    const out = await request(app)
      .post('/api/auth/sign-out')
      .set('Cookie', cookie)
      .set('Origin', env.BETTER_AUTH_URL)
      .send({})
    expect(out.status).toBe(200)

    const res = await request(app).get('/api/tickets').set('Cookie', cookie)
    expect(res.status).toBe(401)
  })
})

describe('blocking a signed-in user', () => {
  it('rejects protected routes on the next request', async () => {
    const cookie = await signIn(EMAIL, PASSWORD)
    const before = await request(app).get('/api/tickets').set('Cookie', cookie)
    expect(before.status).toBe(200)

    await prisma.user.update({ where: { email: EMAIL }, data: { isBlocked: true } })
    try {
      const after = await request(app).get('/api/tickets').set('Cookie', cookie)
      expect(after.status).toBe(401)
    } finally {
      await prisma.user.update({ where: { email: EMAIL }, data: { isBlocked: false } })
    }
  })
})
