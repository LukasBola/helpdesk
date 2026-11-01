import { describe, expect, it } from 'vitest'

import i18n from '@/i18n'
import type { AppUser, TicketDetail, TicketHistoryEntry, TicketReply } from '@/lib/tickets-api'
import { buildTimeline, historyText } from '@/lib/timeline'

const t = i18n.t.bind(i18n)

const users: AppUser[] = [
  { id: 'u1', name: 'Anna Kowalska', email: 'a@x.pl', role: 'AGENT', isBlocked: false },
  { id: 'u2', name: 'Tomasz Nowak', email: 't@x.pl', role: 'AGENT', isBlocked: false },
]

function ticketWith(over: Partial<TicketDetail> = {}): TicketDetail {
  return {
    id: 't1',
    subject: 'S',
    status: 'OPEN',
    priority: 'LOW',
    customerEmail: 'k@x.pl',
    customerName: null,
    createdAt: '2026-10-30T09:00:00.000Z',
    updatedAt: '2026-10-30T09:00:00.000Z',
    assigneeId: null,
    assignee: null,
    body: 'Hej',
    history: [],
    replies: [],
    ...over,
  }
}
const reply = (at: string, id = 'r'): TicketReply => ({
  id,
  body: 'b',
  sentAt: at,
  user: { id: 'u1', name: 'Anna Kowalska' },
})
const entry = (at: string, over: Partial<TicketHistoryEntry> = {}): TicketHistoryEntry => ({
  id: 'h',
  field: 'status',
  oldValue: 'OPEN',
  newValue: 'IN_PROGRESS',
  createdAt: at,
  user: { id: 'u1', name: 'Anna Kowalska' },
  ...over,
})
const assign = (from: string | null, to: string | null) =>
  entry('2026-10-30T10:00:00.000Z', { field: 'assigneeId', oldValue: from, newValue: to })

describe('buildTimeline', () => {
  it('puts the customer message first and orders the rest by time', () => {
    const items = buildTimeline(
      ticketWith({
        replies: [reply('2026-10-30T12:00:00.000Z', 'r2'), reply('2026-10-30T10:00:00.000Z', 'r1')],
        history: [entry('2026-10-30T11:00:00.000Z', { id: 'h1' })],
      }),
    )
    expect(items.map(i => i.kind)).toEqual(['message', 'reply', 'history', 'reply'])
    expect(items.map(i => i.at)).toEqual([
      '2026-10-30T09:00:00.000Z',
      '2026-10-30T10:00:00.000Z',
      '2026-10-30T11:00:00.000Z',
      '2026-10-30T12:00:00.000Z',
    ])
  })

  it('orders a reply before a history entry with the same timestamp', () => {
    const at = '2026-10-30T10:42:00.000Z'
    const items = buildTimeline(ticketWith({ replies: [reply(at)], history: [entry(at)] }))
    expect(items.map(i => i.kind)).toEqual(['message', 'reply', 'history'])
  })
})

describe('historyText', () => {
  it('resolves assignee ids, unassigned and unknown users', () => {
    expect(historyText(assign(null, 'u2'), users, t)).toBe(
      'Anna Kowalska · Przypisanie: Nieprzypisany → Tomasz Nowak',
    )
    expect(historyText(assign('gone', null), users, t)).toContain('nieznany użytkownik')
  })

  it('translates status and priority values', () => {
    expect(historyText(entry('x'), users, t)).toBe('Anna Kowalska · Status: Otwarty → W toku')
    expect(
      historyText(entry('x', { field: 'priority', oldValue: 'LOW', newValue: 'URGENT' }), users, t),
    ).toBe('Anna Kowalska · Priorytet: Niski → Pilny')
  })

  it('uses the unknown-user label when the author is missing', () => {
    expect(historyText(entry('x', { user: null }), users, t)).toMatch(/^nieznany użytkownik · /)
  })

  it('falls back to the raw value or a dash for unexpected values', () => {
    expect(historyText(entry('x', { oldValue: null, newValue: 'WEIRD' }), users, t)).toBe(
      'Anna Kowalska · Status: — → WEIRD',
    )
  })
})
