import { afterAll, describe, expect, it } from 'vitest'

import { prisma } from '../db'
import { type InteractionEntry, runTriage, triageTicket } from './aiService'
import { createFakeProvider } from './fakeProvider'
import { AiInvalidOutputError, AiUnavailableError } from './types'

const noopLog = () => Promise.resolve()
const input = { subject: 'Hilfe', body: 'Drucker kaputt', customerName: null }

function respondWith(lang: string) {
  return createFakeProvider(req =>
    req.kind === 'analysis'
      ? { priority: 'HIGH', customerLanguage: lang, summaryPl: 'pl', summaryEn: 'en' }
      : { draft: 'Hallo', translationPl: 'Cześć', translationEn: 'Hello' },
  )
}

describe('runTriage', () => {
  it('runs analysis then draft and merges the outcome', async () => {
    const entries: InteractionEntry[] = []
    const out = await runTriage(input, respondWith('de'), async e => {
      entries.push(e)
    })
    expect(out).toEqual({
      suggestedPriority: 'HIGH',
      customerLanguage: 'de',
      summaryPl: 'pl',
      summaryEn: 'en',
      draft: 'Hallo',
      draftTranslationPl: 'Cześć',
      draftTranslationEn: 'Hello',
    })
    expect(entries.map(e => e.type)).toEqual(['CLASSIFICATION', 'SUGGESTED_REPLY'])
  })

  it('drops the translation into the customer language', async () => {
    const pl = await runTriage(input, respondWith('pl'), noopLog)
    expect(pl.draftTranslationPl).toBeNull()
    expect(pl.draftTranslationEn).toBe('Hello')
    const en = await runTriage(input, respondWith('en'), noopLog)
    expect(en.draftTranslationEn).toBeNull()
    expect(en.draftTranslationPl).toBe('Cześć')
  })

  it('logs success once and does not double-log when the success log throws', async () => {
    const entries: InteractionEntry[] = []
    const log = (e: InteractionEntry) => {
      entries.push(e)
      return Promise.reject(new Error('db down'))
    }
    await expect(runTriage(input, respondWith('de'), log)).rejects.toThrow('db down')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ type: 'CLASSIFICATION', success: true })
  })

  it('rethrows the provider error when the failure log throws', async () => {
    const provider = {
      name: 'fake' as const,
      model: 'fake',
      generate: () => Promise.reject(new AiUnavailableError('down')),
    }
    const log = () => Promise.reject(new Error('db down'))
    await expect(runTriage(input, provider, log)).rejects.toThrow('down')
  })

  it('logs analysis success then draft failure exactly once each', async () => {
    const entries: InteractionEntry[] = []
    const provider = createFakeProvider(req => {
      if (req.kind === 'analysis') {
        return { priority: 'LOW', customerLanguage: 'en', summaryPl: 'a', summaryEn: 'b' }
      }
      return { draft: '' }
    })
    await expect(
      runTriage(input, provider, async e => void entries.push(e)),
    ).rejects.toBeInstanceOf(AiInvalidOutputError)
    expect(entries.map(e => [e.type, e.success])).toEqual([
      ['CLASSIFICATION', true],
      ['SUGGESTED_REPLY', false],
    ])
  })

  it('logs an unavailable provider with zeros and rethrows', async () => {
    const entries: InteractionEntry[] = []
    const provider = {
      name: 'fake' as const,
      model: 'fake',
      generate: async () => {
        throw new AiUnavailableError('down')
      },
    }
    await expect(runTriage(input, provider, async e => void entries.push(e))).rejects.toThrow(
      'down',
    )
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      type: 'CLASSIFICATION',
      success: false,
      response: '',
      inputTokens: 0,
      outputTokens: 0,
      error: 'down',
    })
  })
})

describe('triageTicket', () => {
  const ids: string[] = []
  const userIds: string[] = []
  async function makeTicket() {
    const t = await prisma.ticket.create({
      data: {
        subject: 'Hilfe',
        body: 'Drucker kaputt',
        customerEmail: 'ai-svc@example.com',
        messageId: `<ai-svc-${Date.now()}-${Math.random()}@example.com>`,
      },
    })
    ids.push(t.id)
    return t
  }

  afterAll(async () => {
    await prisma.aIInteraction.deleteMany({ where: { ticketId: { in: ids } } })
    await prisma.ticket.deleteMany({ where: { id: { in: ids } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  })

  it('rejects for a missing ticket', async () => {
    await expect(triageTicket('missing-id')).rejects.toThrow('Ticket not found')
  })

  it('logs a failed call', async () => {
    const t = await makeTicket()
    const provider = createFakeProvider(() => {
      throw new AiInvalidOutputError('bad', '{"x":1}', {
        inputTokens: 3,
        outputTokens: 4,
        latencyMs: 5,
      })
    })
    await expect(triageTicket(t.id, { provider })).rejects.toThrow()
    const rows = await prisma.aIInteraction.findMany({ where: { ticketId: t.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      success: false,
      provider: 'fake',
      response: '{"x":1}',
      inputTokens: 3,
      outputTokens: 4,
      latencyMs: 5,
    })
    expect(rows[0]?.error).toBeTruthy()
  })

  it('logs both calls with provider and model on success', async () => {
    const t = await makeTicket()
    const user = await prisma.user.create({
      data: { email: `ai-svc-${Date.now()}@example.com`, name: 'AI Svc', role: 'ADMIN' },
    })
    userIds.push(user.id)
    const out = await triageTicket(t.id, { provider: respondWith('de'), userId: user.id })
    expect(out.customerLanguage).toBe('de')
    const rows = await prisma.aIInteraction.findMany({
      where: { ticketId: t.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(rows.map(r => r.type)).toEqual(['CLASSIFICATION', 'SUGGESTED_REPLY'])
    for (const r of rows) {
      expect(r).toMatchObject({
        success: true,
        provider: 'fake',
        model: 'fake',
        userId: user.id,
        costUsd: 0,
      })
      expect(r.prompt.length).toBeGreaterThan(0)
    }
  })
})
