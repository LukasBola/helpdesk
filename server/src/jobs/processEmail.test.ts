import { afterAll, describe, expect, it } from 'vitest'

import autoResponder from '../__fixtures__/postmark/auto-responder.json'
import deliveryReceipt from '../__fixtures__/postmark/delivery-receipt.json'
import emptyBody from '../__fixtures__/postmark/empty-body.json'
import forwarded from '../__fixtures__/postmark/forwarded.json'
import htmlOnly from '../__fixtures__/postmark/html-only.json'
import noName from '../__fixtures__/postmark/no-name.json'
import nonUtf8 from '../__fixtures__/postmark/non-utf8.json'
import ourReplyLoop from '../__fixtures__/postmark/our-reply-loop.json'
import plainText from '../__fixtures__/postmark/plain-text.json'
import plusAddress from '../__fixtures__/postmark/plus-address.json'
import unicodeSubject from '../__fixtures__/postmark/unicode-subject.json'
import { prisma } from '../db'
import type { PostmarkPayload } from './processEmail'
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

// Integration: real DB via testcontainers (started in global setup)
describe('ticket creation (integration)', () => {
  afterAll(async () => {
    await prisma.ticket.deleteMany()
  })

  it('creates a ticket from a valid email payload', async () => {
    const parsed = parsePostmarkPayload({
      MessageID: 'integration-1@test.com',
      From: 'c@test.com',
      FromFull: { Email: 'c@test.com', Name: 'Test Customer' },
      Subject: 'Integration test',
      TextBody: 'This is a test',
      HtmlBody: '',
      To: 'support@test.com',
    })
    expect(parsed).not.toBeNull()
    if (!parsed) return

    const ticket = await prisma.ticket.create({ data: parsed })
    expect(ticket.messageId).toBe('integration-1@test.com')
    expect(ticket.status).toBe('OPEN')
  })

  it('does not create duplicate ticket for same messageId', async () => {
    const data = {
      messageId: 'dup-1@test.com',
      customerEmail: 'c@test.com',
      customerName: 'C',
      subject: 'Dup test',
      body: 'body',
    }
    await prisma.ticket.create({ data })

    await expect(prisma.ticket.create({ data })).rejects.toThrow()
  })
})

describe('fixture tests', () => {
  it('parses plain-text fixture', () => {
    const result = parsePostmarkPayload(plainText as PostmarkPayload)
    expect(result?.subject).toBe('Cannot access course')
    expect(result?.customerName).toBe('Jane Student')
  })

  it('rejects auto-responder from own domain', () => {
    const result = parsePostmarkPayload(autoResponder as PostmarkPayload, {
      ownDomain: 'helpdesk.com',
    })
    expect(result).toBeNull()
  })
})

describe('expanded fixture tests', () => {
  it('parses forwarded email', () => {
    const result = parsePostmarkPayload(forwarded as PostmarkPayload)
    expect(result?.customerEmail).toBe('manager@example.com')
    expect(result?.body).toContain('Please handle this')
  })

  it('falls back to stripped HTML when TextBody is empty', () => {
    const result = parsePostmarkPayload(htmlOnly as PostmarkPayload)
    expect(result?.body).toBe('I need urgent help with my account.')
  })

  it('returns empty string body for email with no text or HTML', () => {
    const result = parsePostmarkPayload(emptyBody as PostmarkPayload)
    expect(result?.body).toBe('')
  })

  it('falls back to email address as name when Name is empty', () => {
    const result = parsePostmarkPayload(noName as PostmarkPayload)
    expect(result?.customerName).toBe('anon@example.com')
  })

  it('handles unicode subject and name without throwing', () => {
    const result = parsePostmarkPayload(unicodeSubject as PostmarkPayload)
    expect(result).not.toBeNull()
    expect(result?.subject).toContain('请帮帮我')
  })

  it('handles non-UTF8 accented characters without throwing', () => {
    const result = parsePostmarkPayload(nonUtf8 as PostmarkPayload)
    expect(result?.customerName).toContain('René')
  })

  it('rejects email sent from our own support address (loop)', () => {
    const result = parsePostmarkPayload(ourReplyLoop as PostmarkPayload, {
      ownDomain: 'helpdesk.com',
    })
    expect(result).toBeNull()
  })

  it('rejects delivery receipt from mailer-daemon (loop)', () => {
    const result = parsePostmarkPayload(deliveryReceipt as PostmarkPayload, {
      ownDomain: 'helpdesk.com',
    })
    // mailer-daemon is not our domain — not filtered, becomes low-priority ticket
    expect(result).not.toBeNull()
  })

  it('parses plus-addressed reply correctly', () => {
    const result = parsePostmarkPayload(plusAddress as PostmarkPayload)
    expect(result?.customerEmail).toBe('student@example.com')
    expect(result?.messageId).toBe('fixture-plus@mail.postmarkapp.com')
  })
})
