# Plan 02: Authentication

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Session-based authentication with login/logout endpoints, auth middleware for protected routes, and two roles (AGENT, ADMIN).

**Architecture:** express-session stores session IDs in cookies; connect-pg-simple persists sessions to the `session` table in Postgres (already in schema). Passwords hashed with bcrypt. Middleware `requireAuth` and `requireRole` protect routes.

**Tech Stack:** express-session, connect-pg-simple, bcrypt, Zod (request validation)

**Prerequisite:** Plan 01 complete — Prisma schema migrated, DB running.

---

## File Map

```
server/src/
├── lib/
│   └── session.ts          # express-session + connect-pg-simple config
├── middleware/
│   ├── auth.ts             # requireAuth, requireRole
│   └── errorHandler.ts     # global error handler
├── routes/
│   └── auth.ts             # POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
└── app.ts                  # wire session + auth routes (modify)
```

---

### Task 1: Session middleware

**Files:**
- Create: `server/src/lib/session.ts`

- [ ] **Step 1: Install deps**

Run: `cd server && pnpm add express-session connect-pg-simple bcrypt && pnpm add -D @types/express-session @types/connect-pg-simple @types/bcrypt`

- [ ] **Step 2: Extend express-session types**

Create `server/src/types/session.d.ts`:

```typescript
import 'express-session'

declare module 'express-session' {
  interface SessionData {
    userId: string
    role: 'AGENT' | 'ADMIN'
  }
}
```

- [ ] **Step 3: Create `server/src/lib/session.ts`**

```typescript
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import { env } from '../env'

const PgStore = connectPgSimple(session)

export const sessionMiddleware = session({
  store: new PgStore({
    conString: env.DATABASE_URL,
    tableName: 'session',
    createTableIfMissing: false,
  }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
  },
})
```

---

### Task 2: Auth middleware

**Files:**
- Create: `server/src/middleware/auth.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/middleware/auth.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import { requireAuth, requireRole } from './auth'

function mockReq(session: Partial<{ userId: string; role: string }> = {}): Request {
  return { session } as unknown as Request
}

function mockRes(): { status: MockInstance; json: MockInstance } & Response {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res as any
}

const next = vi.fn() as unknown as NextFunction

describe('requireAuth', () => {
  it('calls next when session has userId', () => {
    const req = mockReq({ userId: 'u1', role: 'AGENT' })
    const res = mockRes()
    requireAuth(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 401 when no session', () => {
    const req = mockReq()
    const res = mockRes()
    requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })
})

describe('requireRole', () => {
  it('calls next for matching role', () => {
    const req = mockReq({ userId: 'u1', role: 'ADMIN' })
    const res = mockRes()
    requireRole('ADMIN')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 403 for wrong role', () => {
    const req = mockReq({ userId: 'u1', role: 'AGENT' })
    const res = mockRes()
    requireRole('ADMIN')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test src/middleware/auth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `server/src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from 'express'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

export function requireRole(role: 'AGENT' | 'ADMIN') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (req.session.role !== role) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && pnpm test src/middleware/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/auth.ts server/src/middleware/auth.test.ts server/src/types/
git commit -m "feat: requireAuth and requireRole middleware"
```

---

### Task 3: Auth routes

**Files:**
- Create: `server/src/routes/auth.ts`

- [ ] **Step 1: Write failing integration tests**

Create `server/src/routes/auth.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { prisma } from '../db'
import bcrypt from 'bcrypt'

let agentId: string

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: 'agent@test.com',
      name: 'Test Agent',
      passwordHash: await bcrypt.hash('password123', 10),
      role: 'AGENT',
    },
  })
  agentId = user.id
})

afterAll(async () => {
  await prisma.user.deleteMany()
})

describe('POST /api/auth/login', () => {
  it('returns 200 and sets session on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'agent@test.com', password: 'password123' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: agentId, email: 'agent@test.com', role: 'AGENT' })
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'agent@test.com', password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'password123' })
    expect(res.status).toBe(401)
  })

  it('returns 422 on missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'agent@test.com' })
    expect(res.status).toBe(422)
  })
})

describe('POST /api/auth/logout', () => {
  it('destroys session and returns 200', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ email: 'agent@test.com', password: 'password123' })
    const res = await agent.post('/api/auth/logout')
    expect(res.status).toBe(200)
    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(401)
  })
})

describe('GET /api/auth/me', () => {
  it('returns current user when authenticated', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ email: 'agent@test.com', password: 'password123' })
    const res = await agent.get('/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ email: 'agent@test.com' })
  })

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test src/routes/auth.test.ts`
Expected: FAIL — routes not wired.

- [ ] **Step 3: Create `server/src/routes/auth.ts`**

```typescript
import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { prisma } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post('/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    res.status(422).json({ error: result.error.flatten() })
    return
  }

  const { email, password } = result.data
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user || user.isBlocked) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  req.session.userId = user.id
  req.session.role = user.role

  res.json({ id: user.id, email: user.email, name: user.name, role: user.role })
})

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid')
    res.json({ ok: true })
  })
})

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    select: { id: true, email: true, name: true, role: true },
  })
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  res.json(user)
})

export default router
```

- [ ] **Step 4: Wire session and auth routes in `server/src/app.ts`**

```typescript
import express from 'express'
import { sessionMiddleware } from './lib/session'
import authRouter from './routes/auth'

export const app = express()

app.use(express.json())
app.use(sessionMiddleware)

app.use('/api/auth', authRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && pnpm test src/routes/auth.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/auth.ts server/src/routes/auth.test.ts server/src/lib/session.ts server/src/app.ts
git commit -m "feat: session-based auth — login, logout, me endpoints"
```

---

### Task 4: Seed admin user

**Files:**
- Create: `server/prisma/seed.ts`

- [ ] **Step 1: Create `server/prisma/seed.ts`**

```typescript
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@helpdesk.local'
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123'

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Admin',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'ADMIN',
    },
  })
  console.log(`Seeded admin: ${email}`)
}

main().finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Add seed script to `server/package.json`**

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

- [ ] **Step 3: Run seed**

Run: `cd server && pnpm prisma db seed`
Expected: `Seeded admin: admin@helpdesk.local`

- [ ] **Step 4: Commit**

```bash
git add server/prisma/seed.ts server/package.json
git commit -m "feat: admin seed script"
```

---

### Task 5: Global error handler

**Files:**
- Create: `server/src/middleware/errorHandler.ts`

- [ ] **Step 1: Create `server/src/middleware/errorHandler.ts`**

```typescript
import { Request, Response, NextFunction } from 'express'

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}
```

- [ ] **Step 2: Register in `server/src/app.ts`** (must be last middleware)

```typescript
import { errorHandler } from './middleware/errorHandler'
// ... existing imports

// After all routes:
app.use(errorHandler)
```

- [ ] **Step 3: Commit**

```bash
git add server/src/middleware/errorHandler.ts server/src/app.ts
git commit -m "feat: global error handler"
```
