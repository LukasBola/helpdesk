import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app'
import { prisma } from '../db'
import { createCredentialUser } from '../lib/users'
import { signIn } from '../test/auth'

let cookie: string
let ticketId: string
let openId: string
let openId2: string
let resolvedId: string
let formId: string

beforeAll(async () => {
  await createCredentialUser({
    email: 'agent-ticket@test.com',
    password: 'password123',
    name: 'Agent',
  })
  cookie = await signIn('agent-ticket@test.com', 'password123')

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

  const mk = (n: string, status: 'OPEN' | 'RESOLVED') =>
    prisma.ticket.create({
      data: {
        messageId: `route-reply-${n}@test.com`,
        customerEmail: 'c@test.com',
        customerName: 'C',
        subject: `Reply ${n}`,
        body: 'body',
        status,
      },
    })
  openId = (await mk('open', 'OPEN')).id
  openId2 = (await mk('open2', 'OPEN')).id
  resolvedId = (await mk('resolved', 'RESOLVED')).id
  formId = (await mk('form', 'OPEN')).id
})

afterAll(async () => {
  const ids = [ticketId, openId, openId2, resolvedId, formId]
  await prisma.reply.deleteMany({ where: { ticketId: { in: ids } } })
  await prisma.ticketHistory.deleteMany({ where: { ticketId: { in: ids } } })
  await prisma.ticket.deleteMany({ where: { id: { in: ids } } })
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

  it('returns 422 when assigneeId is a valid cuid of a non-existent user', async () => {
    const res = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('Cookie', cookie)
      .send({ assigneeId: 'cjld2cjxh0000qzrmn831i7rn' })
    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'Unknown assignee' })
  })

  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"status":')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid JSON body' })
  })

  it('returns 422 when assigning a blocked user', async () => {
    const blocked = await createCredentialUser({
      email: 'blocked-assignee@test.com',
      password: 'password123',
      name: 'Blocked',
    })
    await prisma.user.update({ where: { id: blocked.id }, data: { isBlocked: true } })
    const res = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('Cookie', cookie)
      .send({ assigneeId: blocked.id })
    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'Assignee is blocked' })
    await prisma.user.delete({ where: { id: blocked.id } })
  })
})

describe('GET /api/tickets edge cases', () => {
  it('returns an empty page (not an error) beyond the last page', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .query({ page: 1000, limit: 100 })
      .set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.tickets).toEqual([])
    expect(res.body.total).toBeGreaterThan(0)
  })

  it('returns an empty page (not 500) for an absurdly large page', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .query({ page: '100000000000' })
      .set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.tickets).toEqual([])
  })

  it.each(['%', '_'])('treats %s in search as a literal character', async ch => {
    const res = await request(app).get('/api/tickets').query({ search: ch }).set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(0)
  })
})

describe('POST /api/tickets/:id/replies', () => {
  const post = (id: string, body: unknown) =>
    request(app).post(`/api/tickets/${id}/replies`).set('Cookie', cookie).send({ body })

  it('saves the reply and moves an OPEN ticket to IN_PROGRESS with a history entry', async () => {
    const res = await request(app)
      .post(`/api/tickets/${openId}/replies`)
      .set('Cookie', cookie)
      .send({ body: '  Dzień dobry  ' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ body: 'Dzień dobry', resendId: null, user: { name: 'Agent' } })
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: openId },
      include: { history: true },
    })
    expect(ticket.status).toBe('IN_PROGRESS')
    expect(ticket.history).toContainEqual(
      expect.objectContaining({ field: 'status', oldValue: 'OPEN', newValue: 'IN_PROGRESS' }),
    )
  })

  it('does not change a status other than OPEN', async () => {
    const res = await post(resolvedId, 'Hello')
    expect(res.status).toBe(201)
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: resolvedId },
      include: { history: true },
    })
    expect(ticket.status).toBe('RESOLVED')
    expect(ticket.history).toHaveLength(0)
  })

  it('two concurrent replies to an OPEN ticket create two replies but one status history row', async () => {
    await Promise.all([post(openId2, 'A'), post(openId2, 'B')])
    expect(await prisma.reply.count({ where: { ticketId: openId2 } })).toBe(2)
    expect(
      await prisma.ticketHistory.count({ where: { ticketId: openId2, field: 'status' } }),
    ).toBe(1)
  })

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['too long', 'x'.repeat(10_001)],
    ['missing', undefined],
  ])('rejects a %s body with 422', async (_label, body) => {
    const res = await post(formId, body)
    expect(res.status).toBe(422)
    expect(await prisma.reply.count({ where: { ticketId: formId } })).toBe(0)
  })

  it('returns 404 for an unknown ticket', async () => {
    const res = await post('cnonexistent000000000000', 'Hi')
    expect(res.status).toBe(404)
  })

  it('returns 401 without a session', async () => {
    const res = await request(app).post(`/api/tickets/${formId}/replies`).send({ body: 'Hi' })
    expect(res.status).toBe(401)
    expect(await prisma.reply.count({ where: { ticketId: formId } })).toBe(0)
  })
})
