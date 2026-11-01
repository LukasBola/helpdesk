import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../db'
import { createReply, findTicketById, listTickets, updateTicket } from './ticketService'

let ticketId: string
let replyTicketId: string

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: 'user-system',
      email: 'system@test.com',
      name: 'System',
      role: 'AGENT',
    },
  })
  const t = await prisma.ticket.create({
    data: {
      messageId: 'svc-test-1@test.com',
      customerEmail: 'c@test.com',
      customerName: 'Customer',
      subject: 'Service test ticket',
      body: 'body',
      status: 'OPEN',
      priority: 'MEDIUM',
    },
  })
  ticketId = t.id
  replyTicketId = (
    await prisma.ticket.create({
      data: {
        messageId: 'svc-test-reply@test.com',
        customerEmail: 'c@test.com',
        subject: 'Reply ticket',
        body: 'body',
        status: 'OPEN',
      },
    })
  ).id
})

afterAll(async () => {
  await prisma.reply.deleteMany({ where: { ticketId: { in: [ticketId, replyTicketId] } } })
  await prisma.ticketHistory.deleteMany({ where: { ticketId: { in: [ticketId, replyTicketId] } } })
  await prisma.ticket.deleteMany({ where: { id: { in: [ticketId, replyTicketId] } } })
  await prisma.user.deleteMany({ where: { id: 'user-system' } })
})

describe('listTickets', () => {
  it('returns an array of tickets', async () => {
    const { tickets } = await listTickets({})
    expect(tickets.length).toBeGreaterThan(0)
  })

  it('filters by status', async () => {
    const { tickets } = await listTickets({ status: 'OPEN' })
    expect(tickets.every(t => t.status === 'OPEN')).toBe(true)
  })
})

describe('listTickets pagination', () => {
  const PREFIX = 'svc-page-'
  const SAME_TIME = new Date('2026-01-01T00:00:00Z')

  beforeAll(async () => {
    await prisma.ticket.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        messageId: `${PREFIX}${i}@test.com`,
        customerEmail: 'page@test.com',
        subject: `Pagination ${i}`,
        body: 'body',
        priority: 'MEDIUM' as const,
        createdAt: SAME_TIME,
      })),
    })
  })

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { messageId: { startsWith: PREFIX } } })
  })

  it.each(['asc', 'desc'] as const)(
    'breaks ties by id (%s) so the order is total and stable',
    async order => {
      const { tickets } = await listTickets({ search: 'page@test.com', order, limit: 6 })
      const ids = tickets.map(t => t.id)
      const sorted = [...ids].sort()
      expect(ids).toEqual(order === 'asc' ? sorted : sorted.reverse())
    },
  )

  it.each(['createdAt', 'priority'] as const)(
    'returns every ticket exactly once across pages when %s values tie',
    async orderBy => {
      const ids: string[] = []
      for (const page of [1, 2, 3]) {
        const { tickets } = await listTickets({ search: 'page@test.com', orderBy, limit: 2, page })
        ids.push(...tickets.map(t => t.id))
      }
      expect(ids).toHaveLength(6)
      expect(new Set(ids).size).toBe(6)
    },
  )
})

describe('listTickets unassigned filter and priority tie-break', () => {
  const PREFIX = 'svc-unassigned-'
  let unassignedId: string
  let assignedId: string
  let olderId: string
  let newerId: string

  beforeAll(async () => {
    const mk = (key: string, extra: object = {}) =>
      prisma.ticket.create({
        data: {
          messageId: `${PREFIX}${key}@test.com`,
          customerEmail: 'unassigned@test.com',
          subject: `Unassigned ${key}`,
          body: 'body',
          ...extra,
        },
      })
    unassignedId = (await mk('free')).id
    assignedId = (await mk('taken', { assigneeId: 'user-system' })).id
    newerId = (
      await mk('newer', { priority: 'URGENT', createdAt: new Date('2026-01-02T00:00:00Z') })
    ).id
    olderId = (
      await mk('older', { priority: 'URGENT', createdAt: new Date('2026-01-01T00:00:00Z') })
    ).id
  })

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { messageId: { startsWith: PREFIX } } })
  })

  it('assigneeId "none" returns only unassigned tickets', async () => {
    const { tickets } = await listTickets({ assigneeId: 'none', limit: 100 })
    expect(tickets.every(t => t.assigneeId === null)).toBe(true)
    const ids = tickets.map(t => t.id)
    expect(ids).toContain(unassignedId)
    expect(ids).not.toContain(assignedId)
  })

  it.each(['asc', 'desc'] as const)(
    'priority sort (%s) lists older tickets first within the same priority',
    async order => {
      const { tickets } = await listTickets({
        orderBy: 'priority',
        order,
        priority: 'URGENT',
        limit: 100,
      })
      const ids = tickets.map(t => t.id)
      expect(ids.indexOf(olderId)).toBeGreaterThanOrEqual(0)
      expect(ids.indexOf(olderId)).toBeLessThan(ids.indexOf(newerId))
    },
  )
})

describe('findTicketById', () => {
  it('returns ticket with history', async () => {
    const ticket = await findTicketById(ticketId)
    expect(ticket?.id).toBe(ticketId)
    expect(ticket?.history).toEqual([])
  })

  it('returns null for unknown id', async () => {
    const ticket = await findTicketById('does-not-exist')
    expect(ticket).toBeNull()
  })
})

describe('updateTicket', () => {
  it('updates status and writes history entry', async () => {
    const updated = await updateTicket(ticketId, { status: 'IN_PROGRESS' }, 'user-system')
    expect(updated).not.toBeNull()
    expect(updated?.status).toBe('IN_PROGRESS')

    const history = await prisma.ticketHistory.findMany({ where: { ticketId } })
    expect(history).toHaveLength(1)
    expect(history[0].field).toBe('status')
    expect(history[0].oldValue).toBe('OPEN')
    expect(history[0].newValue).toBe('IN_PROGRESS')
  })
})

describe('createReply', () => {
  it('returns null for an unknown ticket', async () => {
    expect(await createReply('does-not-exist', 'Hi', 'user-system')).toBeNull()
  })

  it('the automatic status history is never older than its reply', async () => {
    // Timestamps may be equal (Review Focus 3); the client orders the tie.
    const reply = await createReply(replyTicketId, 'Hi', 'user-system')
    if (!reply) throw new Error('reply not created')
    expect(reply).toMatchObject({ user: { id: 'user-system', name: 'System' } })
    const historyRow = await prisma.ticketHistory.findFirstOrThrow({
      where: { ticketId: replyTicketId, field: 'status' },
    })
    expect(historyRow.createdAt.getTime()).toBeGreaterThanOrEqual(reply.sentAt.getTime())
  })
})
