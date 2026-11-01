import { describe, expect, it } from 'vitest'

import i18n from '@/i18n'
import type { SessionUser } from '@/lib/auth-client'
import type { TicketAiResult } from '@/lib/tickets-api'

import { aiLanguage, draftTranslationFor, hasResults, isStalePending, summaryFor } from './ai'

const result: TicketAiResult = {
  ticketId: 't1',
  state: 'READY',
  error: null,
  suggestedPriority: 'HIGH',
  customerLanguage: 'en',
  draft: 'Hello',
  summaryPl: 'Streszczenie',
  summaryEn: 'Summary',
  draftTranslationPl: 'Dzień dobry',
  draftTranslationEn: 'Hello',
  completedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('ai helpers', () => {
  it('aiLanguage prefers aiLocale over the UI language', async () => {
    await i18n.changeLanguage('pl')
    expect(aiLanguage({ aiLocale: 'en' } as SessionUser)).toBe('en')
    expect(aiLanguage({ aiLocale: null } as SessionUser)).toBe('pl')
    expect(aiLanguage(null)).toBe('pl')
  })

  it("draftTranslationFor hides the translation in the customer's language", () => {
    expect(draftTranslationFor(result, 'en')).toBeNull()
    expect(draftTranslationFor(result, 'pl')).toBe('Dzień dobry')
  })

  it('summaryFor picks the language', () => {
    expect(summaryFor(result, 'pl')).toBe('Streszczenie')
    expect(summaryFor(result, 'en')).toBe('Summary')
  })

  it('hasResults is true once completedAt is set', () => {
    expect(hasResults(null)).toBe(false)
    expect(hasResults({ ...result, completedAt: null })).toBe(false)
    expect(hasResults(result)).toBe(true)
  })
})

describe('isStalePending', () => {
  const now = Date.parse('2026-01-01T01:00:00.000Z')
  const pending = (updatedAt: string): TicketAiResult => ({
    ...result,
    state: 'PENDING',
    updatedAt,
  })

  it('is true for PENDING older than 15 minutes', () => {
    expect(isStalePending(pending('2026-01-01T00:30:00.000Z'), now)).toBe(true)
  })
  it('is false for a fresh PENDING', () => {
    expect(isStalePending(pending('2026-01-01T00:50:00.000Z'), now)).toBe(false)
  })
  it('is false for non-PENDING states however old', () => {
    expect(isStalePending({ ...result, state: 'FAILED' }, now)).toBe(false)
  })
})
