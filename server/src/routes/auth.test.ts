import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { prisma } from '../db'
import bcrypt from 'bcrypt'

let agentId: string

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: 'agent@test.com',
      name: 'Test Agent',
      passwordHash: await bcrypt.hash('password123', 10),
      role: 'AGENT',
    },
  })
  agentId = user.id
})

afterAll(async () => {
  await prisma.user.deleteMany()
})

describe('POST /api/auth/login', () => {
  it('returns 200 and sets session on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'agent@test.com', password: 'password123' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: agentId, email: 'agent@test.com', role: 'AGENT' })
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'agent@test.com', password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'password123' })
    expect(res.status).toBe(401)
  })

  it('returns 422 on missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'agent@test.com' })
    expect(res.status).toBe(422)
  })
})

describe('POST /api/auth/logout', () => {
  it('destroys session and returns 200', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ email: 'agent@test.com', password: 'password123' })
    const res = await agent.post('/api/auth/logout')
    expect(res.status).toBe(200)
    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(401)
  })
})

describe('GET /api/auth/me', () => {
  it('returns current user when authenticated', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ email: 'agent@test.com', password: 'password123' })
    const res = await agent.get('/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ email: 'agent@test.com' })
  })

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})
