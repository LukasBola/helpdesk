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

test.describe('API /api/webhooks/postmark: odporność', () => {
  test('M4 duży e-mail (2 MB) bez tokenu: 401, a nie 413/500', async () => {
    const ctx = await newApiContext()
    const res = await ctx.post(WEBHOOK, {
      data: { MessageID: 'x', HtmlBody: 'x'.repeat(2 * 1024 * 1024) },
    })
    expect(res.status()).toBe(401)
  })

  test('M4 uszkodzony JSON: 400 JSON', async () => {
    const ctx = await newApiContext()
    const res = await ctx.post(WEBHOOK, {
      headers: { 'Content-Type': 'application/json' },
      data: '{"MessageID":',
    })
    expect(res.status()).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' })
  })

  test('M5 żądanie z obcego originu (przeglądarka): 403', async () => {
    const ctx = await newApiContext()
    const res = await ctx.post(WEBHOOK, {
      headers: { Origin: 'http://evil.example', 'X-Postmark-Token': TOKEN ?? 'x' },
      data: {},
    })
    expect(res.status()).toBe(403)
  })
})

test.describe('API: inne', () => {
  test('M3 nieznana ścieżka /api: 404 w formacie JSON', async () => {
    const ctx = await signInAs('agent')
    for (const res of [await ctx.get('/api/nie-istnieje'), await ctx.post('/api/nie-istnieje')]) {
      expect(res.status()).toBe(404)
      expect(res.headers()['content-type']).toMatch(/application\/json/)
      expect(await res.json()).toEqual({ error: 'Not found' })
    }
  })

  test('M6 strona SPA jest serwowana dla dowolnej ścieżki frontu', async () => {
    const ctx = await newApiContext()
    const res = await ctx.get('/jakas/sciezka')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toMatch(/text\/html/)
  })
})
