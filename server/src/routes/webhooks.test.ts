import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

import { app } from '../app'

const validPayload = {
  MessageID: 'test-msg-1@mail.postmarkapp.com',
  From: 'customer@example.com',
  FromFull: { Email: 'customer@example.com', Name: 'Customer' },
  Subject: 'Help me',
  TextBody: 'I need help',
  HtmlBody: '',
  To: 'support@helpdesk.com',
}

vi.mock('../jobs/queue', () => ({
  getQueue: vi.fn().mockResolvedValue({
    send: vi.fn().mockResolvedValue('job-id'),
  }),
}))

describe('POST /api/webhooks/postmark', () => {
  it('returns 200 immediately and enqueues job', async () => {
    const res = await request(app)
      .post('/api/webhooks/postmark')
      .set('X-Postmark-Token', process.env.POSTMARK_WEBHOOK_TOKEN ?? 'test-token')
      .send(validPayload)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('returns 401 when token is missing or wrong', async () => {
    const res = await request(app)
      .post('/api/webhooks/postmark')
      .set('X-Postmark-Token', 'wrong-token')
      .send(validPayload)
    expect(res.status).toBe(401)
  })
})
