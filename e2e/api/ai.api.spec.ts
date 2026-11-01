import { type APIRequestContext, expect, test } from '@playwright/test'

import { findTicketId, newApiContext, signInAs } from '../fixtures/api'
import { AI_TICKETS } from '../fixtures/tickets'

const UNKNOWN_CUID = 'cjld2cjxh0000qzrmn831i7rn'

let agent: APIRequestContext

test.beforeAll(async () => {
  agent = await signInAs('agent')
})

test.describe('API /api/tickets/:id/ai', () => {
  test('A1 GET /api/tickets/:id zwraca aiResult', async () => {
    const id = await findTicketId(agent, AI_TICKETS.ready.subject)
    const res = await agent.get(`/api/tickets/${id}`)
    expect(res.status(), 'Status GET /api/tickets/:id').toBe(200)
    const body = await res.json()
    expect(body.aiResult, 'aiResult gotowego ticketu').toMatchObject({
      state: 'READY',
      suggestedPriority: 'URGENT',
      customerLanguage: 'de',
      summaryPl: expect.any(String),
      summaryEn: expect.any(String),
      draft: expect.any(String),
      draftTranslationPl: expect.any(String),
      draftTranslationEn: expect.any(String),
    })

    const failedId = await findTicketId(agent, AI_TICKETS.failed.subject)
    const failed = await (await agent.get(`/api/tickets/${failedId}`)).json()
    expect(failed.aiResult.state, 'Stan aiResult ticketu FAILED').toBe('FAILED')
  })

  test('A2 POST /api/tickets/:id/ai bez sesji: 401', async () => {
    const id = await findTicketId(agent, AI_TICKETS.ready.subject)
    const anon = await newApiContext()
    const res = await anon.post(`/api/tickets/${id}/ai`)
    expect(res.status(), 'Status POST /ai bez sesji').toBe(401)
    await anon.dispose()
  })

  test('A3 POST dla nieznanego id: 404', async () => {
    const res = await agent.post(`/api/tickets/${UNKNOWN_CUID}/ai`)
    expect(res.status(), 'Status POST /ai dla nieznanego ticketu').toBe(404)
  })
})
