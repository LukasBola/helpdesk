# Plan 03: Inbound Email → Ticket Creation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receive Postmark inbound webhook, enqueue a job in pg-boss, and process it into a Ticket record in Postgres. Prevent duplicate tickets via unique `Message-ID`. Reject replies from the system's own outbound domain (anti-loop).

**Architecture:** Webhook handler returns `200 OK` immediately after enqueuing — never blocks on AI or DB. pg-boss worker picks up the job asynchronously and creates the ticket. Idempotency is enforced by a unique constraint on `tickets.messageId`.

**Tech Stack:** pg-boss, Zod (webhook payload validation), Postmark webhook token verification

**Prerequisite:** Plan 01 complete (Prisma schema), Plan 02 (auth middleware available for admin routes).

---

## File Map

```
server/src/
├── jobs/
│   ├── queue.ts              # pg-boss singleton
│   └── processEmail.ts       # job handler: parse payload → create ticket
├── routes/
│   └── webhooks.ts           # POST /api/webhooks/postmark
└── app.ts                    # wire webhook route (modify)
```

---

### Task 1: pg-boss queue setup

**Files:**
- Create: `server/src/jobs/queue.ts`

- [ ] **Step 1: Install pg-boss**

Run: `cd server && pnpm add pg-boss && pnpm add -D @types/pg-boss`

Note: pg-boss ships its own types — `@types/pg-boss` may not exist, skip if npm install fails.

- [ ] **Step 2: Create `server/src/jobs/queue.ts`**

```typescript
import PgBoss from 'pg-boss'
import { env } from '../env'

let boss: PgBoss | null = null

export async function getQueue(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: 'pgboss',
    })
    await boss.start()
  }
  return boss
}

export async function stopQueue(): Promise<void> {
  await boss?.stop()
  boss = null
}
```

- [ ] **Step 3: Start queue in `server/src/index.ts`**

```typescript
import './env'
import { app } from './app'
import { env } from './env'
import { getQueue } from './jobs/queue'
import { registerEmailWorker } from './jobs/processEmail'

async function main() {
  const queue = await getQueue()
  await registerEmailWorker(queue)
  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`)
  })
}

main().catch(console.error)
```

---

### Task 2: Email processing job

**Files:**
- Create: `server/src/jobs/processEmail.ts`

- [ ] **Step 1: Write failing unit tests**

Create `server/src/jobs/processEmail.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
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
    expect(result.body).toBe('Hello world')
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test src/jobs/processEmail.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `server/src/jobs/processEmail.ts`**

```typescript
import PgBoss from 'pg-boss'
import { prisma } from '../db'
import { env } from '../env'

export const EMAIL_JOB = 'process-email'

type PostmarkPayload = {
  MessageID: string
  From: string
  FromFull: { Email: string; Name: string }
  Subject: string
  TextBody: string
  HtmlBody: string
  To: string
}

type ParsedEmail = {
  messageId: string
  customerEmail: string
  customerName: string
  subject: string
  body: string
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function parsePostmarkPayload(
  payload: PostmarkPayload,
  options: { ownDomain?: string } = {}
): ParsedEmail | null {
  const senderDomain = payload.FromFull.Email.split('@')[1]

  if (options.ownDomain && senderDomain === options.ownDomain) {
    return null
  }

  const body = payload.TextBody?.trim() || stripHtml(payload.HtmlBody || '')

  return {
    messageId: payload.MessageID,
    customerEmail: payload.FromFull.Email,
    customerName: payload.FromFull.Name || payload.From,
    subject: payload.Subject,
    body,
  }
}

export async function registerEmailWorker(boss: PgBoss): Promise<void> {
  await boss.work<PostmarkPayload>(EMAIL_JOB, async ([job]) => {
    const ownDomain = env.OWN_DOMAIN
    const parsed = parsePostmarkPayload(job.data, { ownDomain })

    if (!parsed) {
      console.log(`[processEmail] Skipping loop email: ${job.data.MessageID}`)
      return
    }

    try {
      await prisma.ticket.create({
        data: {
          messageId: parsed.messageId,
          customerEmail: parsed.customerEmail,
          customerName: parsed.customerName,
          subject: parsed.subject,
          body: parsed.body,
        },
      })
    } catch (err: any) {
      if (err.code === 'P2002') {
        // Unique constraint — duplicate messageId, silently ignore
        console.log(`[processEmail] Duplicate messageId: ${parsed.messageId}`)
        return
      }
      throw err
    }
  })
}
```

- [ ] **Step 4: Add `OWN_DOMAIN` to env schema in `server/src/env.ts`**

```typescript
OWN_DOMAIN: z.string().optional(),
```

Add to `.env.example`:
```bash
OWN_DOMAIN="helpdesk.com"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && pnpm test src/jobs/processEmail.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/jobs/ server/src/env.ts .env.example
git commit -m "feat: pg-boss email processing job with anti-loop detection"
```

---

### Task 3: Postmark webhook endpoint

**Files:**
- Create: `server/src/routes/webhooks.ts`

- [ ] **Step 1: Write failing integration tests**

Create `server/src/routes/webhooks.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test src/routes/webhooks.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Create `server/src/routes/webhooks.ts`**

```typescript
import { Router } from 'express'
import { env } from '../env'
import { getQueue } from '../jobs/queue'
import { EMAIL_JOB } from '../jobs/processEmail'

const router = Router()

function verifyPostmarkToken(req: import('express').Request, res: import('express').Response): boolean {
  const token = req.headers['x-postmark-token']
  if (!env.POSTMARK_WEBHOOK_TOKEN || token !== env.POSTMARK_WEBHOOK_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

router.post('/postmark', async (req, res) => {
  if (!verifyPostmarkToken(req, res)) return

  const queue = await getQueue()
  await queue.send(EMAIL_JOB, req.body)

  res.json({ ok: true })
})

export default router
```

- [ ] **Step 4: Wire webhook route in `server/src/app.ts`**

```typescript
import webhookRouter from './routes/webhooks'
// ...
app.use('/api/webhooks', webhookRouter)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && pnpm test src/routes/webhooks.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/webhooks.ts server/src/routes/webhooks.test.ts server/src/app.ts
git commit -m "feat: postmark webhook endpoint — enqueues email processing job"
```

---

### Task 4: pg-boss queue integration tests

**Files:**
- Modify: `server/src/jobs/processEmail.test.ts`

- [ ] **Step 1: Add integration test that hits real DB**

Append to `server/src/jobs/processEmail.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../db'
import { parsePostmarkPayload } from './processEmail'

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
    })!

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
```

- [ ] **Step 2: Run integration test**

Run: `cd server && pnpm test src/jobs/processEmail.test.ts`
Expected: all tests PASS including integration tests with real DB.

- [ ] **Step 3: Commit**

```bash
git add server/src/jobs/processEmail.test.ts
git commit -m "test: pg-boss integration tests — deduplication verified against real DB"
```

---

### Task 5: Inbound email fixtures

**Files:**
- Create: `server/src/__fixtures__/postmark/`

- [ ] **Step 1: Create fixture directory and sample payloads**

Create `server/src/__fixtures__/postmark/plain-text.json`:

```json
{
  "MessageID": "fixture-plain@mail.postmarkapp.com",
  "From": "student@example.com",
  "FromFull": { "Email": "student@example.com", "Name": "Jane Student" },
  "Subject": "Cannot access course",
  "TextBody": "Hi, I paid for the React course but cannot access it. My order number is 12345.",
  "HtmlBody": "",
  "To": "support@helpdesk.com"
}
```

Create `server/src/__fixtures__/postmark/html-reply.json`:

```json
{
  "MessageID": "fixture-reply@mail.postmarkapp.com",
  "From": "student@example.com",
  "FromFull": { "Email": "student@example.com", "Name": "Jane Student" },
  "Subject": "Re: Your ticket #xyz",
  "TextBody": "Thanks for the reply. It still doesn't work.",
  "HtmlBody": "<div>Thanks for the reply. It still doesn't work.</div><blockquote>Original message here</blockquote>",
  "To": "support+ticket-xyz@helpdesk.com"
}
```

Create `server/src/__fixtures__/postmark/auto-responder.json`:

```json
{
  "MessageID": "fixture-autoresponder@mail.postmarkapp.com",
  "From": "noreply@helpdesk.com",
  "FromFull": { "Email": "noreply@helpdesk.com", "Name": "Helpdesk" },
  "Subject": "Auto: ticket received",
  "TextBody": "We received your message.",
  "HtmlBody": "",
  "To": "support@helpdesk.com"
}
```

- [ ] **Step 2: Write fixture-based tests**

Append to `server/src/jobs/processEmail.test.ts`:

```typescript
import plainText from '../__fixtures__/postmark/plain-text.json'
import autoResponder from '../__fixtures__/postmark/auto-responder.json'

describe('fixture tests', () => {
  it('parses plain-text fixture', () => {
    const result = parsePostmarkPayload(plainText as any)
    expect(result?.subject).toBe('Cannot access course')
    expect(result?.customerName).toBe('Jane Student')
  })

  it('rejects auto-responder from own domain', () => {
    const result = parsePostmarkPayload(autoResponder as any, { ownDomain: 'helpdesk.com' })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 3: Run and confirm**

Run: `cd server && pnpm test src/jobs/processEmail.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/src/__fixtures__/
git commit -m "test: inbound email fixtures for edge cases"
```
