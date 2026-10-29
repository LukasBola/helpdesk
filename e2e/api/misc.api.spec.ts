import { expect, test } from '@playwright/test'

import { newApiContext, signInAs } from '../fixtures/api'

const WEBHOOK = '/api/webhooks/postmark'
const TOKEN = process.env.POSTMARK_WEBHOOK_TOKEN

test.describe('API /api/webhooks/postmark', () => {
  test('M1 bez tokenu: 401', async () => {
    const ctx = await newApiContext()
    expect((await ctx.post(WEBHOOK, { data: {} })).status()).toBe(401)
  })

  test('M1 zły token: 401', async () => {
    const ctx = await newApiContext()
    const res = await ctx.post(WEBHOOK, { headers: { 'X-Postmark-Token': 'wrong' }, data: {} })
    expect(res.status()).toBe(401)
  })

  test('M1 sesja agenta nie zastępuje tokenu webhooka', async () => {
    const ctx = await signInAs('agent')
    expect((await ctx.post(WEBHOOK, { data: {} })).status()).toBe(401)
  })

  test('M2 poprawny token, niepoprawny payload: 400', async () => {
    test.skip(!TOKEN, 'POSTMARK_WEBHOOK_TOKEN not set for the e2e run')
    const ctx = await newApiContext()
    const res = await ctx.post(WEBHOOK, {
      headers: { 'X-Postmark-Token': TOKEN as string },
      data: { MessageID: '' },
    })
    expect(res.status()).toBe(400)
  })
})

test.describe('API: inne', () => {
  test('M3 nieznana ścieżka /api: 404', async () => {
    const ctx = await signInAs('agent')
    expect((await ctx.get('/api/nie-istnieje')).status()).toBe(404)
  })
})
