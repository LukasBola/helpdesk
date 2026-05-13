import { describe, expect, it } from 'vitest'

import { parsePostmarkPayload } from './processEmail'

describe('parsePostmarkPayload', () => {
  it('extracts ticket fields from Postmark payload', () => {
    const payload = {
      MessageID: 'abc123@mail.postmarkapp.com',
      From: 'customer@example.com',
      FromFull: { Email: 'customer@example.com', Name: 'John Doe' },
      Subject: 'My order is missing',
      TextBody: 'Hello, my order #1234 has not arrived.',
      HtmlBody: '<p>Hello, my order #1234 has not arrived.</p>',
      To: 'support@helpdesk.com',
    }
    const result = parsePostmarkPayload(payload)
    expect(result).toEqual({
      messageId: 'abc123@mail.postmarkapp.com',
      customerEmail: 'customer@example.com',
      customerName: 'John Doe',
      subject: 'My order is missing',
      body: 'Hello, my order #1234 has not arrived.',
    })
  })

  it('falls back to HtmlBody stripped of tags when no TextBody', () => {
    const payload = {
      MessageID: 'xyz@mail.postmarkapp.com',
      From: 'c@example.com',
      FromFull: { Email: 'c@example.com', Name: '' },
      Subject: 'Test',
      TextBody: '',
      HtmlBody: '<p>Hello <b>world</b></p>',
      To: 'support@helpdesk.com',
    }
    const result = parsePostmarkPayload(payload)
    expect((result as NonNullable<typeof result>).body).toBe('Hello world')
  })

  it('returns null for emails from own domain (anti-loop)', () => {
    const payload = {
      MessageID: 'loop@mail.postmarkapp.com',
      From: 'noreply@helpdesk.com',
      FromFull: { Email: 'noreply@helpdesk.com', Name: '' },
      Subject: 'Re: your ticket',
      TextBody: 'This is an auto-reply.',
      HtmlBody: '',
      To: 'support@helpdesk.com',
    }
    const result = parsePostmarkPayload(payload, { ownDomain: 'helpdesk.com' })
    expect(result).toBeNull()
  })
})
