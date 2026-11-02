import { describe, expect, it } from 'vitest'

import { prisma } from './db'

describe('database connection', () => {
  it('can execute a raw query', async () => {
    const result = await prisma.$queryRaw<[{ '?column?': number }]>`SELECT 1`
    expect(result[0]['?column?']).toBe(1)
  })

  it('can query all domain models without error', async () => {
    const [users, tickets, sessions, accounts] = await Promise.all([
      prisma.user.findMany({ take: 1 }),
      prisma.ticket.findMany({ take: 1 }),
      prisma.session.findMany({ take: 1 }),
      prisma.account.findMany({ take: 1 }),
    ])
    expect(Array.isArray(users)).toBe(true)
    expect(Array.isArray(tickets)).toBe(true)
    expect(Array.isArray(sessions)).toBe(true)
    expect(Array.isArray(accounts)).toBe(true)
  })

  it('deleting a ticket removes its AI result and keeps the log', async () => {
    const ticket = await prisma.ticket.create({
      data: {
        subject: 'AI cascade',
        body: 'body',
        customerEmail: 'cascade@example.com',
        messageId: `<ai-cascade-${Date.now()}@example.com>`,
      },
    })
    await prisma.ticketAiResult.create({ data: { ticketId: ticket.id, state: 'READY' } })
    const interaction = await prisma.aIInteraction.create({
      data: { ticketId: ticket.id, type: 'SUMMARY', prompt: 'p', response: 'r' },
    })

    await prisma.ticket.delete({ where: { id: ticket.id } })

    expect(await prisma.ticketAiResult.findUnique({ where: { ticketId: ticket.id } })).toBeNull()
    const kept = await prisma.aIInteraction.findUnique({ where: { id: interaction.id } })
    expect(kept).not.toBeNull()
    expect(kept?.ticketId).toBeNull()
  })
})
