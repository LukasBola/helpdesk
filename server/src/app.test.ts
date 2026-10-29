import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { app } from './app'
import { env } from './env'

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

describe('oversized JSON body', () => {
  const big = JSON.stringify({ status: 'OPEN', padding: 'x'.repeat(150 * 1024) })

  it('returns 413 instead of 500 on regular API routes', async () => {
    const res = await request(app)
      .patch('/api/tickets/any')
      .set('Content-Type', 'application/json')
      .send(big)
    expect(res.status).toBe(413)
    expect(res.body).toEqual({ error: 'Request body too large' })
  })

  it('lets large inbound emails reach the webhook token check', async () => {
    const res = await request(app)
      .post('/api/webhooks/postmark')
      .set('Content-Type', 'application/json')
      .send(big)
    expect(res.status).toBe(401)
  })
})

describe('unknown /api route', () => {
  it('returns a JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(res.body).toEqual({ error: 'Not found' })
  })
})

describe('origin check on state-changing API requests', () => {
  it('rejects a PATCH from an untrusted Origin before auth', async () => {
    const res = await request(app)
      .patch('/api/tickets/any')
      .set('Origin', 'http://evil.example')
      .send({ status: 'OPEN' })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Invalid origin' })
  })

  it('lets a PATCH from the client origin through to auth', async () => {
    const res = await request(app)
      .patch('/api/tickets/any')
      .set('Origin', env.CLIENT_URL)
      .send({ status: 'OPEN' })
    expect(res.status).toBe(401)
  })

  it('does not apply to safe methods', async () => {
    const res = await request(app).get('/api/tickets').set('Origin', 'http://evil.example')
    expect(res.status).toBe(401)
  })

  it('does not apply to server-to-server webhooks (no browser Origin)', async () => {
    const res = await request(app).post('/api/webhooks/postmark').send({})
    expect(res.status).toBe(401)
  })
})
