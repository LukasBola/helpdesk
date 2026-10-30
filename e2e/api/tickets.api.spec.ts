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

interface HistoryDto {
  field: string
  oldValue: string | null
  newValue: string | null
  user: { name: string } | null
}

const UNKNOWN_CUID = 'cjld2cjxh0000qzrmn831i7rn'
const FIXTURE_COUNT = Object.keys(TICKETS).length

let agent: APIRequestContext

test.beforeAll(async () => {
  agent = await signInAs('agent')
})

async function list(params: Record<string, string | number>): Promise<ListDto> {
  const res = await agent.get('/api/tickets', { params })
  expect(res.status(), JSON.stringify(params)).toBe(200)
  return (await res.json()) as ListDto
}

async function detail(id: string) {
  const res = await agent.get(`/api/tickets/${id}`)
  expect(res.status()).toBe(200)
  return (await res.json()) as TicketDto & {
    history: HistoryDto[]
    replies: unknown[]
    assignee: { id: string; name: string; email: string } | null
  }
}

async function userId(ctx: APIRequestContext): Promise<string> {
  return (await (await ctx.get('/api/auth/get-session')).json()).user.id as string
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
    expect((await detail(id)).status).toBe('OPEN')
  })

  test('T1 sfałszowane ciasteczko sesji: 401', async () => {
    const anon = await newApiContext()
    const res = await anon.get('/api/tickets', {
      headers: { Cookie: 'better-auth.session_token=forged.value' },
    })
    expect(res.status()).toBe(401)
  })

  test('T13 PATCH z obcego originu (CSRF) jest odrzucony, ticket bez zmian', async () => {
    const id = await findTicketId(agent, TICKETS.openLow.subject)
    const res = await agent.patch(`/api/tickets/${id}`, {
      headers: { Origin: 'http://evil.example' },
      data: { status: 'CLOSED' },
    })
    expect(res.status()).toBe(403)
    expect((await detail(id)).status).toBe('OPEN')
  })
})

test.describe('API /api/tickets: lista', () => {
  test('T2 domyślny kształt odpowiedzi i komplet fixture’ów', async () => {
    const all = await list({})
    expect(all).toMatchObject({ page: 1, limit: 25 })

    const fixtures = await list({ search: E2E_SEARCH, limit: 100 })
    expect(fixtures.total).toBe(FIXTURE_COUNT)
    expect(fixtures.tickets.map(t => t.subject).sort()).toEqual(
      Object.values(TICKETS)
        .map(t => t.subject)
        .sort(),
    )
    expect(all.total).toBeGreaterThanOrEqual(fixtures.total)
  })

  test('T3 filtr status zwraca tylko pasujące tickety', async () => {
    const body = await list({ status: 'RESOLVED', search: E2E_SEARCH })
    expect(body.tickets.map(t => t.subject)).toEqual([TICKETS.resolved.subject])
    expect(body.total).toBe(1)
  })

  test('T3 filtr priorytetu', async () => {
    const body = await list({ priority: 'URGENT', search: E2E_SEARCH })
    expect(body.tickets.map(t => t.subject)).toEqual([TICKETS.openUrgent.subject])
  })

  test('T3 wyszukiwanie ignoruje wielkość liter i obejmuje e-mail i nazwę klienta', async () => {
    const bySubject = await list({ search: 'e2e drukarka' })
    expect(bySubject.tickets.map(t => t.subject)).toContain(TICKETS.openUrgent.subject)
    const byEmail = await list({ search: 'OPEN-LOW@KLIENT.EXAMPLE' })
    expect(byEmail.tickets.map(t => t.subject)).toEqual([TICKETS.openLow.subject])
    const byName = await list({ search: 'klient resolved' })
    expect(byName.tickets.map(t => t.subject)).toEqual([TICKETS.resolved.subject])
  })

  for (const orderBy of ['createdAt', 'priority'] as const) {
    test(`T3 paginacja (orderBy=${orderBy}) daje te same tickety co jedna strona`, async () => {
      const whole = await list({ search: E2E_SEARCH, orderBy, limit: 6 })
      const pages = [1, 2, 3].map(page => list({ search: E2E_SEARCH, orderBy, limit: 2, page }))
      const paged = (await Promise.all(pages)).flatMap(p => p.tickets.map(t => t.id))
      expect(paged).toEqual(whole.tickets.map(t => t.id))
    })
  }

  test('T3 strona za ostatnią: pusta lista i poprawny total', async () => {
    const body = await list({ search: E2E_SEARCH, limit: 5, page: 10 })
    expect(body).toMatchObject({ tickets: [], total: FIXTURE_COUNT, page: 10 })
  })

  test('T3 bardzo duży numer strony nie powoduje błędu serwera', async () => {
    const body = await list({ search: E2E_SEARCH, page: '100000000000' })
    expect(body.tickets).toEqual([])
  })

  test('T3 wyszukiwanie bez wyników zwraca pustą listę', async () => {
    const body = await list({ search: 'zzz-nie-ma-takiego-ticketu' })
    expect(body).toMatchObject({ tickets: [], total: 0 })
  })

  for (const ch of ['%', '_', '\\']) {
    test(`T14 znak ${ch} w wyszukiwaniu jest dosłowny, nie wildcard`, async () => {
      const body = await list({ search: `${ch}${E2E_SEARCH}` })
      expect(body.total).toBe(0)
    })
  }

  test('T14 polskie znaki w wyszukiwaniu', async () => {
    const body = await list({ search: 'fakturę' })
    expect(body.tickets.map(t => t.subject)).toContain(TICKETS.openLow.subject)
  })

  const invalidParams: Record<string, string | number>[] = [
    { status: 'FOO' },
    { priority: 'CRITICAL' },
    { limit: 101 },
    { limit: 0 },
    { page: 0 },
    { page: -1 },
    { page: 'abc' },
    { page: 1.5 },
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
  test('T5 szczegóły ticketu bez zmian: puste historia i odpowiedzi', async () => {
    const id = await findTicketId(agent, TICKETS.openLow.subject)
    const body = await detail(id)
    expect(body).toMatchObject({
      id,
      subject: TICKETS.openLow.subject,
      status: 'OPEN',
      priority: 'LOW',
      assignee: null,
      history: [],
      replies: [],
    })
  })

  test('T5 nieistniejący ticket: 404 JSON', async () => {
    for (const id of [UNKNOWN_CUID, 'nie-ma']) {
      const res = await agent.get(`/api/tickets/${id}`)
      expect(res.status()).toBe(404)
      expect(await res.json()).toEqual({ error: 'Not found' })
    }
  })
})

test.describe('API PATCH /api/tickets/:id: zmiany i historia', () => {
  test('T6 agent zmienia status i priorytet; historia ma stare/nowe wartości i autora', async () => {
    const id = await findTicketId(agent, TICKETS.patchStatus.subject)
    const before = await detail(id)
    const status = before.status === 'OPEN' ? 'IN_PROGRESS' : 'OPEN'
    const priority = before.priority === 'HIGH' ? 'LOW' : 'HIGH'

    const res = await agent.patch(`/api/tickets/${id}`, { data: { status, priority } })
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ status, priority })

    const after = await detail(id)
    const added = after.history.slice(before.history.length)
    expect(added).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'status',
          oldValue: before.status,
          newValue: status,
          user: expect.objectContaining({ name: USERS.agent.name }),
        }),
        expect.objectContaining({
          field: 'priority',
          oldValue: before.priority,
          newValue: priority,
        }),
      ]),
    )
    expect(added).toHaveLength(2)
  })

  test('T6 ponowne ustawienie tej samej wartości nie dodaje wpisu historii', async () => {
    const id = await findTicketId(agent, TICKETS.patchStatus.subject)
    const before = await detail(id)
    const res = await agent.patch(`/api/tickets/${id}`, { data: { status: before.status } })
    expect(res.status()).toBe(200)
    expect((await detail(id)).history).toHaveLength(before.history.length)
  })

  test('T6 pusty PATCH niczego nie zmienia', async () => {
    const id = await findTicketId(agent, TICKETS.openUrgent.subject)
    const res = await agent.patch(`/api/tickets/${id}`, { data: {} })
    expect(res.status()).toBe(200)
    expect(await detail(id)).toMatchObject({ status: 'OPEN', priority: 'URGENT', history: [] })
  })

  test('T11 przypisanie i odpięcie: historia, assignee i filtr assigneeId', async () => {
    const id = await findTicketId(agent, TICKETS.patchAssign.subject)
    const me = await userId(agent)

    const assigned = await agent.patch(`/api/tickets/${id}`, { data: { assigneeId: me } })
    expect(assigned.status()).toBe(200)
    const afterAssign = await detail(id)
    expect(afterAssign.assignee).toMatchObject({ id: me, name: USERS.agent.name })
    expect(afterAssign.history.at(-1)).toMatchObject({
      field: 'assigneeId',
      oldValue: null,
      newValue: me,
    })
    expect((await list({ assigneeId: me, search: E2E_SEARCH })).tickets.map(t => t.id)).toContain(
      id,
    )

    const unassigned = await agent.patch(`/api/tickets/${id}`, { data: { assigneeId: null } })
    expect(unassigned.status()).toBe(200)
    const afterUnassign = await detail(id)
    expect(afterUnassign.assignee).toBeNull()
    expect(afterUnassign.history.at(-1)).toMatchObject({
      field: 'assigneeId',
      oldValue: me,
      newValue: null,
    })
    expect(
      (await list({ assigneeId: me, search: E2E_SEARCH })).tickets.map(t => t.id),
    ).not.toContain(id)
  })
})

test.describe('API PATCH /api/tickets/:id: błędne dane', () => {
  const invalidBodies: Record<string, unknown>[] = [
    { status: 'DONE' },
    { priority: 'CRITICAL' },
    { status: null },
    { assigneeId: 'not-a-cuid' },
    { assigneeId: 123 },
  ]
  for (const data of invalidBodies) {
    test(`T7 niepoprawne dane ${JSON.stringify(data)}: 422, ticket bez zmian`, async () => {
      const id = await findTicketId(agent, TICKETS.patchInvalid.subject)
      const res = await agent.patch(`/api/tickets/${id}`, { data })
      expect(res.status()).toBe(422)
      expect(await detail(id)).toMatchObject({ status: 'OPEN', priority: 'MEDIUM', history: [] })
    })
  }

  test('T8 przypisanie do nieistniejącego użytkownika: 422 i brak zmian', async () => {
    const id = await findTicketId(agent, TICKETS.patchInvalid.subject)
    const res = await agent.patch(`/api/tickets/${id}`, { data: { assigneeId: UNKNOWN_CUID } })
    expect(res.status()).toBe(422)
    expect(await res.json()).toEqual({ error: 'Unknown assignee' })
    expect(await detail(id)).toMatchObject({ assignee: null, history: [] })
  })

  test('T8 przypisanie do zablokowanego użytkownika: 422', async () => {
    const id = await findTicketId(agent, TICKETS.patchInvalid.subject)
    // The locked user can't sign in to learn their own id, so read it from the database.
    const lockedId = db.userId(USERS.locked.email)
    const res = await agent.patch(`/api/tickets/${id}`, { data: { assigneeId: lockedId } })
    expect(res.status()).toBe(422)
    expect(await res.json()).toEqual({ error: 'Assignee is blocked' })
  })

  test('T9 uszkodzony JSON w body: 400 JSON', async () => {
    const id = await findTicketId(agent, TICKETS.patchInvalid.subject)
    const res = await agent.patch(`/api/tickets/${id}`, {
      headers: { 'Content-Type': 'application/json' },
      data: '{"status": "OPEN",',
    })
    expect(res.status()).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' })
  })

  test('T9 zbyt duże body (150 kB): 413 JSON', async () => {
    const id = await findTicketId(agent, TICKETS.patchInvalid.subject)
    const res = await agent.patch(`/api/tickets/${id}`, {
      data: { status: 'OPEN', padding: 'x'.repeat(150 * 1024) },
    })
    expect(res.status()).toBe(413)
    expect(await res.json()).toEqual({ error: 'Request body too large' })
  })

  test('T10 PATCH nieistniejącego ticketu: 404', async () => {
    const res = await agent.patch(`/api/tickets/${UNKNOWN_CUID}`, { data: { status: 'CLOSED' } })
    expect(res.status()).toBe(404)
  })

  test('T6 nieznane pola w body nie zmieniają ticketu', async () => {
    const id = await findTicketId(agent, TICKETS.patchInvalid.subject)
    const res = await agent.patch(`/api/tickets/${id}`, {
      data: { subject: 'Zmieniony temat', customerEmail: 'hacker@example.com', id: 'x' },
    })
    expect(res.status()).toBe(200)
    expect(await detail(id)).toMatchObject({
      id,
      subject: TICKETS.patchInvalid.subject,
      customerEmail: 'patch-invalid@klient.example',
    })
  })
})

test.describe('API: zablokowany użytkownik z aktywną sesją', () => {
  test.beforeEach(() => db.unblock(USERS.blockedApi.email))
  test.afterEach(() => db.unblock(USERS.blockedApi.email))

  test('T12 po zablokowaniu dostaje 401 z API ticketów', async () => {
    const ctx = await signInAs('blockedApi')
    expect((await ctx.get('/api/tickets')).status()).toBe(200)
    db.block(USERS.blockedApi.email)
    expect((await ctx.get('/api/tickets')).status()).toBe(401)
    expect((await ctx.patch('/api/tickets/any', { data: {} })).status()).toBe(401)
  })
})

test.describe('API: odpowiedzi i filtr przypisania', () => {
  test('T14 POST /replies dodaje odpowiedź (201) i przestawia status na IN_PROGRESS', async () => {
    const id = await findTicketId(agent, TICKETS.apiReply.subject)
    const res = await agent.post(`/api/tickets/${id}/replies`, { data: { body: 'Odpowiedź API' } })
    expect(res.status()).toBe(201)
    const ticket = await detail(id)
    expect(ticket.status).toBe('IN_PROGRESS')
    expect(ticket.replies).toHaveLength(1)
  })

  test('T14 pusta odpowiedź: 422', async () => {
    const id = await findTicketId(agent, TICKETS.apiReply.subject)
    const res = await agent.post(`/api/tickets/${id}/replies`, { data: { body: '   ' } })
    expect(res.status()).toBe(422)
  })

  test('T14 bez sesji POST /replies zwraca 401', async () => {
    const anon = await newApiContext()
    const id = await findTicketId(agent, TICKETS.apiReply.subject)
    expect((await anon.post(`/api/tickets/${id}/replies`, { data: { body: 'x' } })).status()).toBe(
      401,
    )
  })

  test('T15 assigneeId=none zwraca tylko nieprzypisane', async () => {
    const { tickets, total } = await list({ assigneeId: 'none', search: E2E_SEARCH, limit: 50 })
    expect(total).toBeGreaterThan(0)
    for (const t of tickets) expect(t.assigneeId).toBeNull()
  })
})
