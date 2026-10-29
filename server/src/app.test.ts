import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { app } from './app'

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})

describe('malformed JSON body', () => {
  it('returns 400 instead of 500 before any route runs', async () => {
    const res = await request(app)
      .post('/api/webhooks/postmark')
      .set('Content-Type', 'application/json')
      .send('{"MessageID":')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid JSON body' })
  })
})
