import { describe, expect, it } from 'vitest'

import { prisma } from './db'

describe('database connection', () => {
  it('can execute a raw query', async () => {
    const result = await prisma.$queryRaw<[{ '?column?': number }]>`SELECT 1`
    expect(result[0]['?column?']).toBe(1)
  })

  it('can query all domain models without error', async () => {
    const [users, tickets, sessions] = await Promise.all([
      prisma.user.findMany({ take: 1 }),
      prisma.ticket.findMany({ take: 1 }),
      prisma.session.findMany({ take: 1 }),
    ])
    expect(Array.isArray(users)).toBe(true)
    expect(Array.isArray(tickets)).toBe(true)
    expect(Array.isArray(sessions)).toBe(true)
  })
})
