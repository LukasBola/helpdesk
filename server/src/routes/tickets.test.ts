import bcrypt from 'bcrypt'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app'
import { prisma } from '../db'

let cookie: string
let ticketId: string

beforeAll(async () => {
  await prisma.user.create({
    data: {
      email: 'agent-ticket@test.com',
      name: 'Agent',
      passwordHash: await bcrypt.hash('pass123', 10),
      role: 'AGENT',
    },
  })

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'agent-ticket@test.com', password: 'pass123' })
  cookie = login.headers['set-cookie'][0]

  const ticket = await prisma.ticket.create({
    data: {
      messageId: 'route-test-1@test.com',
      customerEmail: 'c@test.com',
      customerName: 'C',
      subject: 'Route test',
      body: 'body',
    },
  })
  ticketId = ticket.id
})

afterAll(async () => {
  await prisma.ticketHistory.deleteMany({ where: { ticketId } })
  await prisma.ticket.deleteMany({ where: { id: ticketId } })
  await prisma.user.deleteMany({ where: { email: 'agent-ticket@test.com' } })
})

describe('GET /api/tickets', () => {
  it('returns ticket list', async () => {
    const res = await request(app).get('/api/tickets').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.tickets).toBeInstanceOf(Array)
    expect(res.body.total).toBeGreaterThan(0)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/tickets')
    expect(res.status).toBe(401)
  })

  it('filters by status=OPEN', async () => {
    const res = await request(app).get('/api/tickets?status=OPEN').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.tickets.every((t: { status: string }) => t.status === 'OPEN')).toBe(true)
  })
})

describe('GET /api/tickets/:id', () => {
  it('returns ticket with history', async () => {
    const res = await request(app).get(`/api/tickets/${ticketId}`).set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(ticketId)
  })

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/tickets/does-not-exist').set('Cookie', cookie)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/tickets/:id', () => {
  it('updates status and returns updated ticket', async () => {
    const res = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('Cookie', cookie)
      .send({ status: 'IN_PROGRESS' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('IN_PROGRESS')
  })

  it('returns 422 for invalid status', async () => {
    const res = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('Cookie', cookie)
      .send({ status: 'INVALID' })
    expect(res.status).toBe(422)
  })

  it('returns 404 for unknown id on PATCH', async () => {
    const res = await request(app)
      .patch('/api/tickets/does-not-exist')
      .set('Cookie', cookie)
      .send({ status: 'IN_PROGRESS' })
    expect(res.status).toBe(404)
  })

  it('returns 422 for invalid assigneeId', async () => {
    const res = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('Cookie', cookie)
      .send({ assigneeId: 'not-a-valid-id' })
    expect(res.status).toBe(422)
  })
})
