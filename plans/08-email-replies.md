# Plan 08: Email Replies

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agents review AI-suggested replies and send them via Resend. Replies include a `Reply-To` header with plus-addressing so customer follow-ups link back to the original ticket.

**Architecture:** `POST /api/tickets/:id/reply` accepts a body (pre-filled from AI suggestion or written manually), sends via Resend, saves a `Reply` record, and updates ticket status to `IN_PROGRESS` if still `OPEN`. Thread linking uses `support+ticket-{id}@domain.com` plus-addressing.

**Tech Stack:** Resend SDK, Prisma

**Prerequisite:** Plan 04 (ticket API + auth), Plan 07 optional (AI reply suggestion already wired).

---

## File Map

```
server/src/
├── services/
│   └── emailService.ts          # sendReply via Resend
└── routes/
    └── replies.ts               # POST /api/tickets/:id/replies
```

---

### Task 1: Email service

**Files:**

- Create: `server/src/services/emailService.ts`

- [ ] **Step 1: Install Resend SDK**

Run: `cd server && pnpm add resend`

- [ ] **Step 2: Add ENV vars to `server/src/env.ts`**

```typescript
RESEND_API_KEY: z.string().optional(),
SUPPORT_EMAIL: z.string().email().default('support@helpdesk.local'),
REPLY_DOMAIN: z.string().default('helpdesk.local'),
```

Add to `.env.example`:

```bash
RESEND_API_KEY=""
SUPPORT_EMAIL="support@yourdomain.com"
REPLY_DOMAIN="yourdomain.com"
```

- [ ] **Step 3: Write failing unit tests**

Create `server/src/services/emailService.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { buildReplyAddress } from './emailService'

describe('buildReplyAddress', () => {
  it('generates plus-addressed reply-to', () => {
    const addr = buildReplyAddress('ticket-abc123', 'helpdesk.com')
    expect(addr).toBe('support+ticket-abc123@helpdesk.com')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd server && pnpm test src/services/emailService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Create `server/src/services/emailService.ts`**

```typescript
import { Resend } from 'resend'
import { env } from '../env'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

export function buildReplyAddress(ticketId: string, domain: string): string {
  return `support+ticket-${ticketId}@${domain}`
}

type SendReplyOptions = {
  ticketId: string
  toEmail: string
  subject: string
  body: string
  agentName: string
}

export async function sendReply(opts: SendReplyOptions): Promise<string | null> {
  if (!resend) {
    console.warn('[emailService] RESEND_API_KEY not set — skipping send')
    return null
  }

  const replyTo = buildReplyAddress(opts.ticketId, env.REPLY_DOMAIN)

  const { data, error } = await resend.emails.send({
    from: `${opts.agentName} <${env.SUPPORT_EMAIL}>`,
    to: opts.toEmail,
    replyTo,
    subject: `Re: ${opts.subject}`,
    text: opts.body,
  })

  if (error) throw new Error(`Resend error: ${error.message}`)

  return data?.id ?? null
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && pnpm test src/services/emailService.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/services/emailService.ts server/src/services/emailService.test.ts server/src/env.ts .env.example
git commit -m "feat: email service — Resend integration with plus-address threading"
```

---

### Task 2: Reply route

**Files:**

- Create: `server/src/routes/replies.ts`

- [ ] **Step 1: Write failing integration tests**

Create `server/src/routes/replies.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { prisma } from '../db'
import bcrypt from 'bcrypt'

vi.mock('../services/emailService', () => ({
  sendReply: vi.fn().mockResolvedValue('resend-id-123'),
  buildReplyAddress: vi.fn().mockReturnValue('support+ticket-x@test.com'),
}))

let cookie: string
let ticketId: string
let agentId: string

beforeAll(async () => {
  const agent = await prisma.user.create({
    data: {
      email: 'reply-agent@test.com',
      name: 'Reply Agent',
      passwordHash: await bcrypt.hash('pass123', 10),
      role: 'AGENT',
    },
  })
  agentId = agent.id

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'reply-agent@test.com', password: 'pass123' })
  cookie = login.headers['set-cookie'][0]

  const ticket = await prisma.ticket.create({
    data: {
      messageId: 'reply-test-1@test.com',
      customerEmail: 'customer@test.com',
      customerName: 'Customer',
      subject: 'Help needed',
      body: 'I need help.',
    },
  })
  ticketId = ticket.id
})

afterAll(async () => {
  await prisma.reply.deleteMany()
  await prisma.ticketHistory.deleteMany()
  await prisma.ticket.deleteMany()
  await prisma.user.deleteMany()
})

describe('POST /api/tickets/:id/replies', () => {
  it('sends reply, saves record, advances status to IN_PROGRESS', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/replies`)
      .set('Cookie', cookie)
      .send({ body: 'Hi, we are looking into this.' })

    expect(res.status).toBe(201)
    expect(res.body.resendId).toBe('resend-id-123')

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
    expect(ticket?.status).toBe('IN_PROGRESS')

    const reply = await prisma.reply.findFirst({ where: { ticketId } })
    expect(reply?.body).toBe('Hi, we are looking into this.')
    expect(reply?.userId).toBe(agentId)
  })

  it('returns 422 when body is empty', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/replies`)
      .set('Cookie', cookie)
      .send({ body: '' })
    expect(res.status).toBe(422)
  })

  it('returns 404 for unknown ticket', async () => {
    const res = await request(app)
      .post('/api/tickets/does-not-exist/replies')
      .set('Cookie', cookie)
      .send({ body: 'Hello' })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test src/routes/replies.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `server/src/routes/replies.ts`**

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../db'
import { sendReply } from '../services/emailService'

const router = Router({ mergeParams: true })

router.use(requireAuth)

const replyBodySchema = z.object({
  body: z.string().min(1),
})

router.post('/', async (req, res) => {
  const result = replyBodySchema.safeParse(req.body)
  if (!result.success) {
    res.status(422).json({ error: result.error.flatten() })
    return
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.ticketId } })
  if (!ticket) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const agent = await prisma.user.findUniqueOrThrow({ where: { id: req.session.userId } })

  const resendId = await sendReply({
    ticketId: ticket.id,
    toEmail: ticket.customerEmail,
    subject: ticket.subject,
    body: result.data.body,
    agentName: agent.name,
  })

  const [reply] = await prisma.$transaction([
    prisma.reply.create({
      data: {
        ticketId: ticket.id,
        userId: agent.id,
        body: result.data.body,
        resendId,
      },
    }),
    ...(ticket.status === 'OPEN'
      ? [
          prisma.ticket.update({
            where: { id: ticket.id },
            data: { status: 'IN_PROGRESS' },
          }),
          prisma.ticketHistory.create({
            data: {
              ticketId: ticket.id,
              userId: agent.id,
              field: 'status',
              oldValue: 'OPEN',
              newValue: 'IN_PROGRESS',
            },
          }),
        ]
      : []),
  ])

  res.status(201).json(reply)
})

export default router
```

- [ ] **Step 4: Wire reply route in `server/src/app.ts`**

```typescript
import repliesRouter from './routes/replies'
// ...
app.use('/api/tickets/:ticketId/replies', repliesRouter)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && pnpm test src/routes/replies.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/replies.ts server/src/routes/replies.test.ts server/src/app.ts
git commit -m "feat: reply endpoint — send via Resend, save record, advance status"
```

---

### Task 3: Reply UI

**Files:**

- Modify: `client/src/pages/TicketPage.tsx`

- [ ] **Step 1: Add reply form to `TicketPage.tsx`**

Add at the bottom of the component, after the replies section:

```typescript
// Add import at the top of TicketPage.tsx:
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'

// Add inside TicketPage component, before the return:
const qc = useQueryClient()
const [replyBody, setReplyBody] = useState('')
const sendReply = useMutation({
  mutationFn: (body: string) => api.post(`/tickets/${id}/replies`, { body }),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['tickets', id] })
    setReplyBody('')
  },
})

// Add at the bottom of the returned JSX, after replies section:
```

```tsx
<section>
  <h2 className="text-sm font-semibold text-slate-600 mb-3">Send reply</h2>
  <div className="space-y-2">
    <textarea
      className="w-full border rounded p-3 text-sm min-h-32 resize-y focus:outline-none focus:ring-2 focus:ring-slate-300"
      placeholder="Write your reply…"
      value={replyBody}
      onChange={e => setReplyBody(e.target.value)}
    />
    <div className="flex justify-end">
      <Button
        onClick={() => sendReply.mutate(replyBody)}
        disabled={!replyBody.trim() || sendReply.isPending}
      >
        {sendReply.isPending ? 'Sending…' : 'Send reply'}
      </Button>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Verify in browser**

Open a ticket. Paste a reply in the textarea, click Send. Confirm the reply appears below and status changes to In Progress.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/TicketPage.tsx
git commit -m "feat: reply form in ticket detail page"
```
