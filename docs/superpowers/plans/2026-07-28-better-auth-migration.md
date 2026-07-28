# Better Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `express-session` + `connect-pg-simple` + `bcrypt` authentication with Better Auth, mapped onto the existing `User` Prisma model, preserving identical external behavior (login/logout/me, role hierarchy, blocked-user rejection).

**Architecture:** Better Auth owns session/credential storage via its Prisma adapter, using the existing `User` model directly (no separate profile table — `User`'s Prisma Client accessor is already `prisma.user`, matching Better Auth's default, so no model/field remapping is needed). `role` and `isBlocked` are exposed as `additionalFields` on the Better Auth user, so they ride along in every session lookup. A `hooks.before` on `/sign-in/email` rejects blocked users at login. `requireAuth`/`requireRole` middleware keep their exact current signatures and call `auth.api.getSession()` instead of reading `req.session`.

**Tech Stack:** `better-auth` (Prisma adapter, Express integration via `better-auth/node`), existing Express + Prisma + Postgres + Vitest + Supertest stack.

**Spec:** `docs/superpowers/specs/2026-07-28-better-auth-migration-design.md`

## Global Constraints

- Scope is 1:1 replacement: email + password only. No OAuth, no 2FA in this plan.
- `requireRole` must preserve the existing role hierarchy (`ADMIN` passes an `AGENT`-required check) — this is current behavior in `server/src/middleware/auth.ts`, not a new requirement.
- `requireAuth` must reject `isBlocked` users on **every** request (not just at login), matching today's per-request check in `GET /api/auth/me`.
- Data is reset, not migrated: no real users exist beyond the seeded admin, so no bcrypt-hash migration logic is needed.
- One Prisma migration (`better-auth-migration`) covers the schema change.

---

### Task 1: Swap auth dependencies and environment config

**Files:**

- Modify: `server/package.json`
- Modify: `server/src/env.ts`
- Modify: `.env.example`

**Interfaces:**

- Produces: `env.BETTER_AUTH_SECRET: string`, `env.BETTER_AUTH_URL: string` — consumed by Task 3 (`server/src/lib/auth.ts`).

- [ ] **Step 1: Remove old auth deps, add better-auth**

Run: `cd server && pnpm remove express-session connect-pg-simple bcrypt @types/express-session @types/connect-pg-simple @types/bcrypt && pnpm add better-auth`

- [ ] **Step 2: Update `server/src/env.ts`**

Replace the whole file with:

```typescript
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ANTHROPIC_API_KEY: z.string().optional(),
  POSTMARK_WEBHOOK_TOKEN: z.string().optional(),
  OWN_DOMAIN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
})

const result = schema.safeParse(process.env)

if (!result.success) {
  console.error('Invalid environment variables:')
  console.error(result.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables')
}

export const env = result.data
```

- [ ] **Step 3: Update `.env.example`**

Remove the `SESSION_SECRET=...` line. Add:

```
BETTER_AUTH_SECRET=replace-with-a-random-32-plus-character-string
BETTER_AUTH_URL=http://localhost:3000
```

- [ ] **Step 4: Also set these two vars in your local `.env`** (not committed) so later tasks' tests/dev server can run — copy the same two keys with real local values (e.g. `BETTER_AUTH_URL=http://localhost:3000` and any random 32+ char string for the secret).

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/src/env.ts .env.example
git commit -m "chore: swap express-session/bcrypt for better-auth dependency"
```

---

### Task 2: Update Prisma schema for Better Auth and migrate

**Files:**

- Modify: `server/prisma/schema.prisma:38-53` (the `User` model)
- Modify: `server/prisma/schema.prisma:140-147` (the old `Session` model, replaced with `Session` + `Account` + `Verification`)

**Interfaces:**

- Produces: `User.emailVerified: Boolean`, `User.sessions`/`User.accounts` relations, `Session`/`Account`/`Verification` models — consumed by Task 3's Prisma adapter.
- `User.passwordHash` is removed — no remaining task reads it (Task 6's seed script uses Better Auth's own credential storage instead).

- [ ] **Step 1: Replace the `User` model** (lines 38-53) with:

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified Boolean   @default(false)
  name          String
  role          Role      @default(AGENT)
  isBlocked     Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions        Session[]
  accounts        Account[]
  assignedTickets Ticket[]        @relation("AssignedTickets")
  history         TicketHistory[]
  replies         Reply[]

  @@map("users")
}
```

- [ ] **Step 2: Replace the old `Session` model** (lines 140-147, the `connect-pg-simple` one — `sid`/`sess`/`expire`) with:

```prisma
model Session {
  id        String   @id @default(cuid())
  expiresAt DateTime
  token     String   @unique
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@map("session")
}

model Account {
  id                    String    @id @default(cuid())
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([userId])
  @@map("account")
}

model Verification {
  id         String   @id @default(cuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("verification")
}
```

- [ ] **Step 3: Run the migration**

Run: `cd server && pnpm prisma migrate dev -n better-auth-migration`
Expected: prints a summary of the migration (drops old `session` columns, adds `account`/`verification` tables, alters `users`) and ends with `Your database is now in sync with your schema.`

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat: migrate schema for better-auth (session/account/verification, drop passwordHash)"
```

---

### Task 3: Better Auth server instance with blocked-user login hook

**Files:**

- Create: `server/src/lib/auth.ts`
- Test: `server/src/lib/auth.test.ts`

**Interfaces:**

- Consumes: `prisma` from `server/src/db.ts` (existing singleton), `env.BETTER_AUTH_SECRET`/`env.BETTER_AUTH_URL` from Task 1.
- Produces: `auth: ReturnType<typeof betterAuth>` — consumed by Task 4 (middleware) and Task 5 (app mount).

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/auth.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { auth } from './auth'
import { prisma } from '../db'

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'blocked-login@test.com' } })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'blocked-login@test.com' } })
})

describe('auth sign-in hook', () => {
  it('rejects sign-in for a blocked user', async () => {
    await auth.api.signUpEmail({
      body: { email: 'blocked-login@test.com', password: 'password123', name: 'Blocked' },
    })
    await prisma.user.update({
      where: { email: 'blocked-login@test.com' },
      data: { isBlocked: true },
    })

    await expect(
      auth.api.signInEmail({
        body: { email: 'blocked-login@test.com', password: 'password123' },
      }),
    ).rejects.toMatchObject({ status: 'UNAUTHORIZED' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test src/lib/auth.test.ts`
Expected: FAIL — `Cannot find module './auth'` (file doesn't exist yet).

- [ ] **Step 3: Create `server/src/lib/auth.ts`**

```typescript
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError, createAuthMiddleware } from 'better-auth/api'

import { prisma } from '../db'
import { env } from '../env'

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  advanced: {
    database: {
      generateId: false,
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: ['AGENT', 'ADMIN'],
        required: false,
        defaultValue: 'AGENT',
        input: false,
      },
      isBlocked: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  hooks: {
    before: createAuthMiddleware(async ctx => {
      if (ctx.path !== '/sign-in/email') {
        return
      }
      const email = ctx.body?.email as string | undefined
      if (!email) {
        return
      }
      const user = await prisma.user.findUnique({ where: { email } })
      if (user?.isBlocked) {
        throw new APIError('UNAUTHORIZED', { message: 'Invalid credentials' })
      }
    }),
  },
})
```

`generateId: false` defers ID generation to Prisma's `@default(cuid())` (already set on every model) instead of Better Auth generating its own IDs — keeps ID format consistent with the rest of the schema.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && pnpm test src/lib/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/auth.ts server/src/lib/auth.test.ts
git commit -m "feat: better-auth instance with blocked-user sign-in hook"
```

---

### Task 4: Rewrite auth middleware

**Files:**

- Modify: `server/src/middleware/auth.ts`
- Modify: `server/src/middleware/auth.test.ts`
- Create: `server/src/types/express.d.ts`
- Delete: `server/src/types/session.d.ts`

**Interfaces:**

- Consumes: `auth` from `server/src/lib/auth.ts` (Task 3).
- Produces: `requireAuth(req, res, next)`, `requireRole(role: 'AGENT' | 'ADMIN')` — same signatures as before, consumed unchanged by any route that already imports them (and by Plan 04/09 routes going forward). `req.currentUser: { id: string; role: 'AGENT' | 'ADMIN'; isBlocked: boolean }` is newly available to downstream handlers.

- [ ] **Step 1: Delete `server/src/types/session.d.ts`**

Run: `rm server/src/types/session.d.ts`

- [ ] **Step 2: Create `server/src/types/express.d.ts`**

```typescript
declare namespace Express {
  interface Request {
    currentUser?: {
      id: string
      role: 'AGENT' | 'ADMIN'
      isBlocked: boolean
    }
  }
}
```

- [ ] **Step 3: Write the failing test**

Replace `server/src/middleware/auth.test.ts` with:

```typescript
import type { NextFunction, Request, Response } from 'express'
import type { MockInstance } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

import { auth } from '../lib/auth'
import { requireAuth, requireRole } from './auth'

const getSession = auth.api.getSession as unknown as MockInstance

function mockReq(): Request {
  return { headers: {} } as unknown as Request
}

function mockRes(): { status: MockInstance; json: MockInstance } & Response {
  const res: { status?: MockInstance; json?: MockInstance } = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res as { status: MockInstance; json: MockInstance } & Response
}

const next = vi.fn() as unknown as NextFunction

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requireAuth', () => {
  it('calls next when session exists and user is not blocked', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1', role: 'AGENT', isBlocked: false } })
    const req = mockReq()
    const res = mockRes()
    await requireAuth(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 401 when no session', async () => {
    getSession.mockResolvedValue(null)
    const req = mockReq()
    const res = mockRes()
    await requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when user is blocked', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1', role: 'AGENT', isBlocked: true } })
    const req = mockReq()
    const res = mockRes()
    await requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('requireRole', () => {
  it('calls next for matching role', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', isBlocked: false } })
    const req = mockReq()
    const res = mockRes()
    await requireRole('ADMIN')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 403 for wrong role', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1', role: 'AGENT', isBlocked: false } })
    const req = mockReq()
    const res = mockRes()
    await requireRole('ADMIN')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('allows ADMIN to pass an AGENT role check', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', isBlocked: false } })
    const req = mockReq()
    const res = mockRes()
    await requireRole('AGENT')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 401 when no session', async () => {
    getSession.mockResolvedValue(null)
    const req = mockReq()
    const res = mockRes()
    await requireRole('ADMIN')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd server && pnpm test src/middleware/auth.test.ts`
Expected: FAIL — `requireAuth`/`requireRole` still read `req.session`, which is `{}` in the mock request, not the mocked `getSession`.

- [ ] **Step 5: Replace `server/src/middleware/auth.ts`**

```typescript
import { fromNodeHeaders } from 'better-auth/node'
import type { NextFunction, Request, Response } from 'express'

import { auth } from '../lib/auth'

const ROLE_HIERARCHY: Record<'AGENT' | 'ADMIN', number> = { AGENT: 1, ADMIN: 2 }

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session || session.user.isBlocked) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  req.currentUser = session.user as unknown as Request['currentUser']
  next()
}

export function requireRole(role: 'AGENT' | 'ADMIN') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
    if (!session || session.user.isBlocked) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const userLevel = ROLE_HIERARCHY[(session.user as { role: 'AGENT' | 'ADMIN' }).role] ?? 0
    const requiredLevel = ROLE_HIERARCHY[role]
    if (userLevel < requiredLevel) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    req.currentUser = session.user as unknown as Request['currentUser']
    next()
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && pnpm test src/middleware/auth.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/middleware/auth.ts server/src/middleware/auth.test.ts server/src/types/
git commit -m "feat: rewrite requireAuth/requireRole on top of better-auth sessions"
```

---

### Task 5: Wire Better Auth into the Express app, with integration tests

**Files:**

- Modify: `server/src/app.ts`
- Modify: `server/src/lib/auth.test.ts` (append to the file created in Task 3)
- Delete: `server/src/lib/session.ts`
- Delete: `server/src/routes/auth.ts`
- Delete: `server/src/routes/auth.test.ts`

**Interfaces:**

- Consumes: `auth` from `server/src/lib/auth.ts` (Task 3).
- Produces: mounted routes `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/get-session`, etc. (all of Better Auth's built-in email/password endpoints) — these are the endpoints the frontend will call once Plan 05 builds a login page.

- [ ] **Step 1: Delete obsolete files**

Run: `rm server/src/lib/session.ts server/src/routes/auth.ts server/src/routes/auth.test.ts`

- [ ] **Step 2: Write the failing integration tests**

Append to `server/src/lib/auth.test.ts` (add these imports to the top and these `describe` blocks at the bottom):

```typescript
// add to the existing imports at the top of the file:
import request from 'supertest'

import { app } from '../app'
```

```typescript
// add at the bottom of the file:
describe('POST /api/auth/sign-in/email', () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: 'signin-flow@test.com' } })
    await auth.api.signUpEmail({
      body: { email: 'signin-flow@test.com', password: 'password123', name: 'Sign In Flow' },
    })
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: 'signin-flow@test.com' } })
  })

  it('returns 200 and sets a session cookie on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email: 'signin-flow@test.com', password: 'password123' })
    expect(res.status).toBe(200)
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email: 'signin-flow@test.com', password: 'wrong' })
    expect(res.status).toBe(401)
  })
})

describe('sign-out and get-session', () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: 'session-flow@test.com' } })
    await auth.api.signUpEmail({
      body: { email: 'session-flow@test.com', password: 'password123', name: 'Session Flow' },
    })
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: 'session-flow@test.com' } })
  })

  it('get-session returns the user with role and isBlocked when authenticated', async () => {
    const agent = request.agent(app)
    await agent
      .post('/api/auth/sign-in/email')
      .send({ email: 'session-flow@test.com', password: 'password123' })

    const res = await agent.get('/api/auth/get-session')
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({
      email: 'session-flow@test.com',
      role: 'AGENT',
      isBlocked: false,
    })
  })

  it('sign-out destroys the session', async () => {
    const agent = request.agent(app)
    await agent
      .post('/api/auth/sign-in/email')
      .send({ email: 'session-flow@test.com', password: 'password123' })

    const signOutRes = await agent.post('/api/auth/sign-out')
    expect(signOutRes.status).toBe(200)

    const sessionRes = await agent.get('/api/auth/get-session')
    expect(sessionRes.body).toBeNull()
  })

  it('returns null from get-session when not authenticated', async () => {
    const res = await request(app).get('/api/auth/get-session')
    expect(res.body).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && pnpm test src/lib/auth.test.ts`
Expected: FAIL — `app` still imports the deleted `authRouter`/`sessionMiddleware` (compile error), or the new requests 404, since `/api/auth/*` isn't mounted yet.

- [ ] **Step 4: Replace `server/src/app.ts`**

```typescript
import { toNodeHandler } from 'better-auth/node'
import express from 'express'

import { auth } from './lib/auth'
import { errorHandler } from './middleware/errorHandler'
import webhookRouter from './routes/webhooks'

export const app = express()

app.all('/api/auth/*', toNodeHandler(auth))

app.use(express.json())

app.use('/api/webhooks', webhookRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use(errorHandler)
```

The Better Auth handler is mounted **before** `express.json()` — mounting it after causes the Better Auth client to hang on "pending" requests, per Better Auth's Express integration docs.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && pnpm test src/lib/auth.test.ts`
Expected: PASS (all describe blocks, including the Task 3 hook test)

- [ ] **Step 6: Verify the whole server still typechecks**

Run: `cd server && pnpm typecheck`
Expected: no errors (confirms nothing else still imports the deleted files).

- [ ] **Step 7: Commit**

```bash
git add server/src/app.ts server/src/lib/auth.test.ts
git commit -m "feat: mount better-auth handler, remove express-session wiring"
```

---

### Task 6: Rewrite the admin seed script, full verification

**Files:**

- Modify: `server/prisma/seed.ts`

**Interfaces:**

- Consumes: `auth` from `server/src/lib/auth.ts` (Task 3).

- [ ] **Step 1: Replace `server/prisma/seed.ts`**

```typescript
import { PrismaClient } from '@prisma/client'

import { auth } from '../src/lib/auth'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@helpdesk.local'
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123'

  if (!process.env.SEED_ADMIN_PASSWORD && process.env.NODE_ENV !== 'test') {
    console.warn(
      'WARNING: Using default admin password. Set SEED_ADMIN_PASSWORD before running in production.',
    )
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (!existing) {
    await auth.api.signUpEmail({ body: { email, password, name: 'Admin' } })
  }

  await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } })
  console.log(`Seeded admin: ${email}`)
}

void main().finally(() => prisma.$disconnect())
```

`role` has `input: false` in the Better Auth config (Task 3), so `signUpEmail` cannot set it directly — the seed script sets it with a direct Prisma write right after account creation.

- [ ] **Step 2: Run the seed script**

Run: `cd server && pnpm prisma db seed`
Expected: `Seeded admin: admin@helpdesk.local`

- [ ] **Step 3: Run the full server test suite and typecheck**

Run: `cd server && pnpm test && pnpm typecheck`
Expected: all tests PASS, typecheck reports no errors.

- [ ] **Step 4: Commit**

```bash
git add server/prisma/seed.ts
git commit -m "feat: seed admin user via better-auth signUpEmail"
```
