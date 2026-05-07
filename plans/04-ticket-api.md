# Plan 04: Ticket REST API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** REST endpoints for listing, viewing, updating tickets (status, priority, assignee), and reading the change history. All routes protected by `requireAuth`.

**Architecture:** Ticket service layer isolates DB logic from route handlers. History entries written transactionally whenever status, priority, or assignee changes. Filtering and sorting done at DB level via Prisma `where`/`orderBy`.

**Tech Stack:** Express, Prisma, Zod (query and body validation)

**Prerequisite:** Plan 01 (schema), Plan 02 (auth middleware).

---

## File Map

```
server/src/
├── services/
│   └── ticketService.ts      # DB logic: list, findById, update, addHistory
├── routes/
│   └── tickets.ts            # GET /api/tickets, GET/PATCH /api/tickets/:id, GET /api/tickets/:id/history
└── app.ts                    # wire ticket routes (modify)
```

---

### Task 1: Ticket service

**Files:**
- Create: `server/src/services/ticketService.ts`

- [ ] **Step 1: Write failing unit tests**

Create `server/src/services/ticketService.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { prisma } from '../db'
import {
  listTickets,
  findTicketById,
  updateTicket,
} from './ticketService'

let ticketId: string

beforeAll(async () => {
  const t = await prisma.ticket.create({
    data: {
      messageId: 'svc-test-1@test.com',
      customerEmail: 'c@test.com',
      customerName: 'Customer',
      subject: 'Service test ticket',
      body: 'body',
      status: 'OPEN',
      priority: 'MEDIUM',
    },
  })
  ticketId = t.id
})

afterAll(async () => {
  await prisma.ticketHistory.deleteMany()
  await prisma.ticket.deleteMany()
})

describe('listTickets', () => {
  it('returns an array of tickets', async () => {
    const tickets = await listTickets({})
    expect(tickets.length).toBeGreaterThan(0)
  })

  it('filters by status', async () => {
    const tickets = await listTickets({ status: 'OPEN' })
    expect(tickets.every(t => t.status === 'OPEN')).toBe(true)
  })
})

describe('findTicketById', () => {
  it('returns ticket with history', async () => {
    const ticket = await findTicketById(ticketId)
    expect(ticket?.id).toBe(ticketId)
    expect(ticket?.history).toEqual([])
  })

  it('returns null for unknown id', async () => {
    const ticket = await findTicketById('does-not-exist')
    expect(ticket).toBeNull()
  })
})

describe('updateTicket', () => {
  it('updates status and writes history entry', async () => {
    const updated = await updateTicket(ticketId, { status: 'IN_PROGRESS' }, 'user-system')
    expect(updated.status).toBe('IN_PROGRESS')

    const history = await prisma.ticketHistory.findMany({ where: { ticketId } })
    expect(history).toHaveLength(1)
    expect(history[0].field).toBe('status')
    expect(history[0].oldValue).toBe('OPEN')
    expect(history[0].newValue).toBe('IN_PROGRESS')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test src/services/ticketService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `server/src/services/ticketService.ts`**

```typescript
import { Prisma, TicketStatus, TicketPriority } from '@prisma/client'
import { prisma } from '../db'

type ListOptions = {
  status?: TicketStatus
  priority?: TicketPriority
  assigneeId?: string
  search?: string
  orderBy?: 'createdAt' | 'updatedAt' | 'priority'
  order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export async function listTickets(opts: ListOptions) {
  const where: Prisma.TicketWhereInput = {}

  if (opts.status) where.status = opts.status
  if (opts.priority) where.priority = opts.priority
  if (opts.assigneeId) where.assigneeId = opts.assigneeId
  if (opts.search) {
    where.OR = [
      { subject: { contains: opts.search, mode: 'insensitive' } },
      { customerEmail: { contains: opts.search, mode: 'insensitive' } },
      { customerName: { contains: opts.search, mode: 'insensitive' } },
    ]
  }

  const page = opts.page ?? 1
  const limit = opts.limit ?? 25
  const skip = (page - 1) * limit

  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      orderBy: { [opts.orderBy ?? 'createdAt']: opts.order ?? 'desc' },
      skip,
      take: limit,
      include: { assignee: { select: { id: true, name: true, email: true } } },
    }),
    prisma.ticket.count({ where }),
  ])

  return { tickets, total, page, limit }
}

export async function findTicketById(id: string) {
  return prisma.ticket.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      history: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, name: true } } },
      },
      replies: {
        orderBy: { sentAt: 'asc' },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })
}

type UpdateFields = {
  status?: TicketStatus
  priority?: TicketPriority
  assigneeId?: string | null
}

export async function updateTicket(id: string, fields: UpdateFields, actorId: string) {
  const current = await prisma.ticket.findUniqueOrThrow({ where: { id } })

  const historyEntries: Prisma.TicketHistoryCreateManyInput[] = []

  if (fields.status && fields.status !== current.status) {
    historyEntries.push({
      ticketId: id,
      userId: actorId,
      field: 'status',
      oldValue: current.status,
      newValue: fields.status,
    })
  }
  if (fields.priority && fields.priority !== current.priority) {
    historyEntries.push({
      ticketId: id,
      userId: actorId,
      field: 'priority',
      oldValue: current.priority,
      newValue: fields.priority,
    })
  }
  if ('assigneeId' in fields && fields.assigneeId !== current.assigneeId) {
    historyEntries.push({
      ticketId: id,
      userId: actorId,
      field: 'assigneeId',
      oldValue: current.assigneeId ?? null,
      newValue: fields.assigneeId ?? null,
    })
  }

  const [updated] = await prisma.$transaction([
    prisma.ticket.update({ where: { id }, data: fields }),
    ...(historyEntries.length > 0
      ? [prisma.ticketHistory.createMany({ data: historyEntries })]
      : []),
  ])

  return updated
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && pnpm test src/services/ticketService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/ticketService.ts server/src/services/ticketService.test.ts
git commit -m "feat: ticket service — list, find, update with history tracking"
```

---

### Task 2: Ticket routes

**Files:**
- Create: `server/src/routes/tickets.ts`

- [ ] **Step 1: Write failing integration tests**

Create `server/src/routes/tickets.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { prisma } from '../db'
import bcrypt from 'bcrypt'

let cookie: string
let ticketId: string

beforeAll(async () => {
  await prisma.user.create({
    data: {
      email: 'agent-ticket@test.com',
      name: 'Agent',
      passwordHash: await bcrypt.hash('pass123', 10),
      role: 'AGENT',
    },
  })

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'agent-ticket@test.com', password: 'pass123' })
  cookie = login.headers['set-cookie'][0]

  const ticket = await prisma.ticket.create({
    data: {
      messageId: 'route-test-1@test.com',
      customerEmail: 'c@test.com',
      customerName: 'C',
      subject: 'Route test',
      body: 'body',
    },
  })
  ticketId = ticket.id
})

afterAll(async () => {
  await prisma.ticketHistory.deleteMany()
  await prisma.ticket.deleteMany()
  await prisma.user.deleteMany()
})

describe('GET /api/tickets', () => {
  it('returns ticket list', async () => {
    const res = await request(app).get('/api/tickets').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.tickets).toBeInstanceOf(Array)
    expect(res.body.total).toBeGreaterThan(0)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/tickets')
    expect(res.status).toBe(401)
  })

  it('filters by status=OPEN', async () => {
    const res = await request(app)
      .get('/api/tickets?status=OPEN')
      .set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.tickets.every((t: any) => t.status === 'OPEN')).toBe(true)
  })
})

describe('GET /api/tickets/:id', () => {
  it('returns ticket with history', async () => {
    const res = await request(app).get(`/api/tickets/${ticketId}`).set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(ticketId)
  })

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/tickets/does-not-exist').set('Cookie', cookie)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/tickets/:id', () => {
  it('updates status and returns updated ticket', async () => {
    const res = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('Cookie', cookie)
      .send({ status: 'IN_PROGRESS' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('IN_PROGRESS')
  })

  it('returns 422 for invalid status', async () => {
    const res = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('Cookie', cookie)
      .send({ status: 'INVALID' })
    expect(res.status).toBe(422)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test src/routes/tickets.test.ts`
Expected: FAIL — route not registered.

- [ ] **Step 3: Create `server/src/routes/tickets.ts`**

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { listTickets, findTicketById, updateTicket } from '../services/ticketService'

const router = Router()

router.use(requireAuth)

const listQuerySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().optional(),
  search: z.string().optional(),
  orderBy: z.enum(['createdAt', 'updatedAt', 'priority']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})

router.get('/', async (req, res) => {
  const result = listQuerySchema.safeParse(req.query)
  if (!result.success) {
    res.status(422).json({ error: result.error.flatten() })
    return
  }
  const data = await listTickets(result.data)
  res.json(data)
})

router.get('/:id', async (req, res) => {
  const ticket = await findTicketById(req.params.id)
  if (!ticket) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(ticket)
})

const updateBodySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().nullable().optional(),
})

router.patch('/:id', async (req, res) => {
  const result = updateBodySchema.safeParse(req.body)
  if (!result.success) {
    res.status(422).json({ error: result.error.flatten() })
    return
  }

  const ticket = await updateTicket(req.params.id, result.data, req.session.userId!)
  res.json(ticket)
})

export default router
```

- [ ] **Step 4: Register route in `server/src/app.ts`**

```typescript
import ticketsRouter from './routes/tickets'
// ...
app.use('/api/tickets', ticketsRouter)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && pnpm test src/routes/tickets.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/tickets.ts server/src/routes/tickets.test.ts server/src/app.ts
git commit -m "feat: ticket REST API — list, get, update with auth and validation"
```
