import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../db'
import { findTicketById, listTickets, updateTicket } from './ticketService'

let ticketId: string

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: 'user-system',
      email: 'system@test.com',
      name: 'System',
      passwordHash: 'not-a-real-hash',
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
})

afterAll(async () => {
  await prisma.ticketHistory.deleteMany({ where: { ticketId } })
  await prisma.ticket.deleteMany({ where: { id: ticketId } })
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
