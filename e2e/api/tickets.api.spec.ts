import { type APIRequestContext, expect, test } from '@playwright/test'

import { findTicketId, newApiContext, signInAs, type TicketDto } from '../fixtures/api'
import { db } from '../fixtures/db'
import { E2E_SEARCH, TICKETS } from '../fixtures/tickets'
import { USERS } from '../fixtures/users'

interface ListDto {
  tickets: TicketDto[]
  total: number
  page: number
  limit: number
}

const UNKNOWN_CUID = 'cjld2cjxh0000qzrmn831i7rn'

let agent: APIRequestContext

test.beforeAll(async () => {
  agent = await signInAs('agent')
})

async function list(params: Record<string, string | number>): Promise<ListDto> {
  const res = await agent.get('/api/tickets', { params })
  expect(res.status(), JSON.stringify(params)).toBe(200)
  return (await res.json()) as ListDto
}

test.describe('API /api/tickets: autoryzacja', () => {
  test('T1 bez sesji: lista, szczegóły i PATCH zwracają 401', async () => {
    const anon = await newApiContext()
    const id = await findTicketId(agent, TICKETS.openLow.subject)
    expect((await anon.get('/api/tickets')).status()).toBe(401)
    expect((await anon.get(`/api/tickets/${id}`)).status()).toBe(401)
    expect((await anon.patch(`/api/tickets/${id}`, { data: { status: 'CLOSED' } })).status()).toBe(
      401,
    )
  })

  test('T1 sfałszowane ciasteczko sesji: 401', async () => {
    const anon = await newApiContext()
    const res = await anon.get('/api/tickets', {
      headers: { Cookie: 'better-auth.session_token=forged.value' },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe('API /api/tickets: lista', () => {
  test('T2 domyślny kształt odpowiedzi i paginacja', async () => {
    const body = await list({})
    expect(body).toMatchObject({ page: 1, limit: 25 })
    expect(Array.isArray(body.tickets)).toBe(true)
    expect(body.total).toBeGreaterThanOrEqual(Object.keys(TICKETS).length)
  })

  test('T3 filtr status zwraca tylko pasujące tickety', async () => {
    const body = await list({ status: 'IN_PROGRESS', search: E2E_SEARCH })
    expect(body.tickets.map(t => t.subject)).toContain(TICKETS.progress.subject)
    expect(body.tickets.every(t => t.status === 'IN_PROGRESS')).toBe(true)
  })

  test('T3 filtr priorytetu', async () => {
    const body = await list({ priority: 'URGENT', search: E2E_SEARCH })
    expect(body.tickets.map(t => t.subject)).toEqual([TICKETS.openUrgent.subject])
  })

  test('T3 wyszukiwanie ignoruje wielkość liter i obejmuje e-mail klienta', async () => {
    expect((await list({ search: 'e2e drukarka' })).tickets.map(t => t.subject)).toEqual([
      TICKETS.openUrgent.subject,
    ])
    expect((await list({ search: 'OPEN-LOW@KLIENT' })).tickets.map(t => t.subject)).toEqual([
      TICKETS.openLow.subject,
    ])
  })

  test('T3 limit i page dzielą wyniki bez powtórzeń', async () => {
    const first = await list({ search: E2E_SEARCH, limit: 2, page: 1, orderBy: 'createdAt' })
    const second = await list({ search: E2E_SEARCH, limit: 2, page: 2, orderBy: 'createdAt' })
    expect(first.tickets).toHaveLength(2)
    expect(second.page).toBe(2)
    const ids = [...first.tickets, ...second.tickets].map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('T3 wyszukiwanie bez wyników zwraca pustą listę', async () => {
    const body = await list({ search: 'zzz-nie-ma-takiego-ticketu' })
    expect(body).toMatchObject({ tickets: [], total: 0 })
  })

  const invalidParams: Record<string, string | number>[] = [
    { status: 'FOO' },
    { priority: 'CRITICAL' },
    { limit: 101 },
    { limit: 0 },
    { page: 0 },
    { page: 'abc' },
    { orderBy: 'subject' },
    { order: 'up' },
  ]
  for (const params of invalidParams) {
    test(`T4 niepoprawny parametr ${JSON.stringify(params)}: 422`, async () => {
      const res = await agent.get('/api/tickets', { params })
      expect(res.status()).toBe(422)
      expect(await res.json()).toHaveProperty('error')
    })
  }
})

test.describe('API /api/tickets/:id', () => {
  test('T5 szczegóły zawierają historię i odpowiedzi', async () => {
    const id = await findTicketId(agent, TICKETS.openLow.subject)
    const res = await agent.get(`/api/tickets/${id}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ id, subject: TICKETS.openLow.subject, status: 'OPEN' })
    expect(Array.isArray(body.history)).toBe(true)
    expect(Array.isArray(body.replies)).toBe(true)
  })

  test('T5 nieistniejący ticket: 404', async () => {
    expect((await agent.get(`/api/tickets/${UNKNOWN_CUID}`)).status()).toBe(404)
    expect((await agent.get('/api/tickets/nie-ma')).status()).toBe(404)
  })
})

test.describe('API PATCH /api/tickets/:id: zmiany i historia', () => {
  // The second test relies on the state left by the first.
  test.describe.configure({ mode: 'serial' })

  test('T6 agent zmienia status i priorytet; historia zapisuje autora', async () => {
    const id = await findTicketId(agent, TICKETS.patchStatus.subject)
    const res = await agent.patch(`/api/tickets/${id}`, {
      data: { status: 'IN_PROGRESS', priority: 'HIGH' },
    })
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'IN_PROGRESS', priority: 'HIGH' })

    const detail = await (await agent.get(`/api/tickets/${id}`)).json()
    const changes = detail.history.map((h: { field: string; newValue: string }) => [
      h.field,
      h.newValue,
    ])
    expect(changes).toEqual(
      expect.arrayContaining([
        ['status', 'IN_PROGRESS'],
        ['priority', 'HIGH'],
      ]),
    )
    expect(detail.history[0].user.name).toBe(USERS.agent.name)
  })

  test('T6 ponowne ustawienie tej samej wartości nie dodaje wpisu historii', async () => {
    const id = await findTicketId(agent, TICKETS.patchStatus.subject)
    const before = (await (await agent.get(`/api/tickets/${id}`)).json()).history.length
    const res = await agent.patch(`/api/tickets/${id}`, { data: { status: 'IN_PROGRESS' } })
    expect(res.status()).toBe(200)
    const after = (await (await agent.get(`/api/tickets/${id}`)).json()).history.length
    expect(after).toBe(before)
  })
})

test.describe('API PATCH /api/tickets/:id', () => {
  test('T11 przypisanie do agenta i odpięcie (assigneeId: null)', async () => {
    const id = await findTicketId(agent, TICKETS.patchAssign.subject)
    const me = (await (await agent.get('/api/auth/get-session')).json()).user.id as string

    const assigned = await agent.patch(`/api/tickets/${id}`, { data: { assigneeId: me } })
    expect(assigned.status()).toBe(200)
    expect((await assigned.json()).assigneeId).toBe(me)
    const mine = await list({ assigneeId: me, search: E2E_SEARCH })
    expect(mine.tickets.map(t => t.subject)).toContain(TICKETS.patchAssign.subject)

    const unassigned = await agent.patch(`/api/tickets/${id}`, { data: { assigneeId: null } })
    expect(unassigned.status()).toBe(200)
    expect((await unassigned.json()).assigneeId).toBeNull()
  })

  for (const data of [
    { status: 'DONE' },
    { priority: 'CRITICAL' },
    { assigneeId: 'not-a-cuid' },
    { assigneeId: 123 },
  ]) {
    test(`T7 niepoprawne dane ${JSON.stringify(data)}: 422`, async () => {
      const id = await findTicketId(agent, TICKETS.patchInvalid.subject)
      const res = await agent.patch(`/api/tickets/${id}`, { data })
      expect(res.status()).toBe(422)
    })
  }

  test('T8 przypisanie do nieistniejącego użytkownika: 4xx, a nie 500', async () => {
    const id = await findTicketId(agent, TICKETS.patchInvalid.subject)
    const res = await agent.patch(`/api/tickets/${id}`, { data: { assigneeId: UNKNOWN_CUID } })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })

  test('T9 uszkodzony JSON w body: 400, a nie 500', async () => {
    const id = await findTicketId(agent, TICKETS.patchInvalid.subject)
    const res = await agent.patch(`/api/tickets/${id}`, {
      headers: { 'Content-Type': 'application/json' },
      data: '{"status": "OPEN",',
    })
    expect(res.status()).toBe(400)
  })

  test('T10 PATCH nieistniejącego ticketu: 404', async () => {
    const res = await agent.patch(`/api/tickets/${UNKNOWN_CUID}`, { data: { status: 'CLOSED' } })
    expect(res.status()).toBe(404)
  })

  test('T6 nieznane pola w body nie zmieniają ticketu', async () => {
    const id = await findTicketId(agent, TICKETS.patchInvalid.subject)
    const res = await agent.patch(`/api/tickets/${id}`, {
      data: { subject: 'Zmieniony temat', customerEmail: 'hacker@example.com' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.subject).toBe(TICKETS.patchInvalid.subject)
    expect(body.customerEmail).toBe('patch-invalid@klient.example')
  })
})

test.describe('API: zablokowany użytkownik z aktywną sesją', () => {
  test.afterAll(() => db.unblock(USERS.blockedApi.email))

  test('T12 po zablokowaniu dostaje 401 z API ticketów', async () => {
    const ctx = await signInAs('blockedApi')
    expect((await ctx.get('/api/tickets')).status()).toBe(200)
    db.block(USERS.blockedApi.email)
    expect((await ctx.get('/api/tickets')).status()).toBe(401)
  })
})
