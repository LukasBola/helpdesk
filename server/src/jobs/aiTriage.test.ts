import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createClaudeProvider } from '../ai/claudeProvider'
import { createFakeProvider } from '../ai/fakeProvider'
import { prisma } from '../db'
import { AI_JOB, handleAiJob, requestAiTriage } from './aiTriage'
import { getQueue, stopQueue } from './queue'

let ticketId: string
const failing = createFakeProvider(() => ({ nope: true }))
const job = (retryCount: number) => ({ data: { ticketId }, retryCount, retryLimit: 2 })

beforeAll(async () => {
  const ticket = await prisma.ticket.create({
    data: {
      messageId: 'ai-triage-1@test.com',
      customerEmail: 'c@test.com',
      subject: 'Printer broken',
      body: 'My printer does not work.',
    },
  })
  ticketId = ticket.id
})

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { messageId: 'ai-triage-1@test.com' } })
  await stopQueue()
})

describe('handleAiJob', () => {
  it('success stores results as READY', async () => {
    await prisma.ticketAiResult.upsert({
      where: { ticketId },
      create: { ticketId, state: 'PENDING' },
      update: { state: 'PENDING' },
    })
    await handleAiJob(job(0), createFakeProvider())
    const row = await prisma.ticketAiResult.findUniqueOrThrow({ where: { ticketId } })
    expect(row.state).toBe('READY')
    expect(row.error).toBeNull()
    expect(row.completedAt).not.toBeNull()
    expect(row.draft).toBeTruthy()
    expect(row.summaryPl).toBeTruthy()
    expect(row.suggestedPriority).not.toBeNull()
  })

  it('non-final failure rethrows and keeps PENDING', async () => {
    await prisma.ticketAiResult.update({ where: { ticketId }, data: { state: 'PENDING' } })
    await expect(handleAiJob(job(1), failing)).rejects.toThrow()
    const row = await prisma.ticketAiResult.findUniqueOrThrow({ where: { ticketId } })
    expect(row.state).toBe('PENDING')
  })

  it('last attempt marks FAILED and keeps previous results', async () => {
    await prisma.ticketAiResult.update({
      where: { ticketId },
      data: { state: 'READY', draft: 'previous draft', error: null },
    })
    await expect(handleAiJob(job(2), failing)).resolves.toBeUndefined()
    const row = await prisma.ticketAiResult.findUniqueOrThrow({ where: { ticketId } })
    expect(row.state).toBe('FAILED')
    expect(row.draft).toBe('previous draft')
    expect(row.error).toBeTruthy()
    expect((row.error as string).length).toBeLessThanOrEqual(500)
  })
})

describe('handleAiJob with an unimplemented provider', () => {
  it('writes FAILED without rethrowing even on the first attempt', async () => {
    await prisma.ticketAiResult.update({ where: { ticketId }, data: { state: 'PENDING' } })
    await expect(handleAiJob(job(0), createClaudeProvider())).resolves.toBeUndefined()
    const row = await prisma.ticketAiResult.findUniqueOrThrow({ where: { ticketId } })
    expect(row.state).toBe('FAILED')
    expect(row.error).toContain('not implemented')
  })
})

describe('requestAiTriage', () => {
  it('does not queue twice while PENDING', async () => {
    await prisma.ticketAiResult.update({
      where: { ticketId },
      data: { state: 'READY', draft: 'previous draft' },
    })
    const boss = await getQueue()
    await boss.createQueue(AI_JOB)

    expect(await requestAiTriage(ticketId)).toBe('queued')
    expect(await requestAiTriage(ticketId)).toBe('already-pending')
    const row = await prisma.ticketAiResult.findUniqueOrThrow({ where: { ticketId } })
    expect(row.state).toBe('PENDING')
    expect(row.draft).toBe('previous draft')
  })

  it('re-queues a PENDING row only when it is stale', async () => {
    const setAge = (minutes: number) => {
      const at = new Date(Date.now() - minutes * 60_000)
      return prisma.$executeRaw`UPDATE "ticket_ai_results" SET "state" = 'PENDING', "updatedAt" = ${at} WHERE "ticketId" = ${ticketId}`
    }
    await setAge(1)
    expect(await requestAiTriage(ticketId)).toBe('already-pending')
    await setAge(16)
    expect(await requestAiTriage(ticketId)).toBe('queued')
  })

  it('marks FAILED when enqueue fails and allows a later retry', async () => {
    await prisma.ticketAiResult.update({
      where: { ticketId },
      data: { state: 'READY', error: null },
    })
    const boss = await getQueue()
    const spy = vi.spyOn(boss, 'send').mockRejectedValueOnce(new Error('db down'))
    await expect(requestAiTriage(ticketId)).rejects.toThrow('db down')
    spy.mockRestore()
    const row = await prisma.ticketAiResult.findUniqueOrThrow({ where: { ticketId } })
    expect(row.state).toBe('FAILED')
    expect(row.error).toContain('db down')
    expect(row.draft).toBe('previous draft')
    expect(await requestAiTriage(ticketId)).toBe('queued')
  })
})
