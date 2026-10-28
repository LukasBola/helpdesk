# Better Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `express-session` + `connect-pg-simple` + `bcrypt` authentication with Better Auth, mapped onto the existing `User` Prisma model, preserving external behavior (sign-in/sign-out/session, role hierarchy, blocked-user rejection at login and mid-session, no public registration).

**Architecture:** Better Auth owns sessions and credentials via its Prisma adapter, using the existing `User` model directly (Prisma accessor `prisma.user` is Better Auth's default, so no model/field remapping). `role` and `isBlocked` are `additionalFields` with `input: false`, so they ride along in every `getSession` result. Public sign-up is disabled; users are created server-side by `createCredentialUser()` (hash via `auth.$context.password.hash`, then `User` + `Account` in one Prisma transaction — same pattern as Better Auth's admin plugin). A `databaseHooks.session.create.before` hook rejects blocked users after password verification. `requireAuth`/`requireRole` keep their signatures, call `auth.api.getSession()`, and expose `req.currentUser`.

**Tech Stack:** `better-auth` (Prisma adapter, `better-auth/node` for Express 4), existing Express 4 + Prisma 5 + Postgres + Vitest + Supertest + testcontainers.

**Spec:** `docs/superpowers/specs/2026-07-28-better-auth-migration-design.md` (revision 2)

## Global Constraints

- Scope is a 1:1 replacement: email + password only. No OAuth, no 2FA.
- `emailAndPassword.disableSignUp: true` — this also blocks server-side `auth.api.signUpEmail()`, so seed and tests MUST use `createCredentialUser()`.
- `requireRole` keeps the role hierarchy (`ADMIN` passes an `AGENT` check).
- `requireAuth`/`requireRole` reject `isBlocked` users on **every** request. Do NOT enable `session.cookieCache` (it would serve stale `isBlocked`/`role`).
- Async middleware must forward errors with `next(err)` — Express 4 does not catch rejected promises.
- Data is reset, not migrated (only a seeded admin exists).
- **Every commit must typecheck**: `.husky/pre-commit` runs `pnpm typecheck`. Tasks 2–5 form one atomic change and are committed together at the end of Task 5. Never use `--no-verify`.
- Test passwords must be ≥ 8 characters (Better Auth default `minPasswordLength`).
- Mount the handler with `app.all('/api/auth/*', ...)` (Express 4 syntax) **before** `express.json()`.

## File Map

```
server/
├── package.json                         # + better-auth (Task 1), − old auth deps (Task 7)
├── prisma/
│   ├── schema.prisma                    # User changes, new Session/Account/Verification (Task 2)
│   ├── migrations/<ts>_better_auth_migration/   # (Task 2)
│   └── seed.ts                          # uses createCredentialUser (Task 6)
└── src/
    ├── env.ts / env.test.ts             # BETTER_AUTH_* (Task 1), − SESSION_SECRET (Task 7)
    ├── app.ts                           # mount better-auth, drop session/authRouter (Task 5)
    ├── db.test.ts                       # + prisma.account (Task 5)
    ├── lib/
    │   ├── auth.ts                      # NEW: betterAuth instance (Task 3)
    │   ├── auth.test.ts                 # NEW (Task 3)
    │   ├── users.ts                     # NEW: createCredentialUser (Task 3)
    │   └── session.ts                   # DELETE (Task 5)
    ├── middleware/auth.ts + auth.test.ts  # rewritten (Task 4)
    ├── routes/
    │   ├── auth.ts + auth.test.ts       # DELETE (Task 5)
    │   ├── auth.integration.test.ts     # NEW: HTTP tests for /api/auth/* (Task 5)
    │   ├── tickets.ts                   # req.session.userId → req.currentUser (Task 5)
    │   └── tickets.test.ts              # createCredentialUser + signIn (Task 5)
    ├── services/ticketService.test.ts   # drop passwordHash (Task 5)
    ├── test/
    │   ├── setup.ts                     # BETTER_AUTH_* env (Task 1), − SESSION_SECRET (Task 7)
    │   └── auth.ts                      # NEW: signIn() helper (Task 5)
    └── types/
        ├── express.d.ts                 # NEW: req.currentUser (Task 4)
        └── session.d.ts                 # DELETE (Task 4)
```

---

### Task 0: Branch

- [ ] **Step 1: Create an isolated branch**

Use superpowers:using-git-worktrees, or: `git switch main && git pull && git switch -c feature/better-auth`

---

### Task 1: Add Better Auth dependency and env vars (additive)

Old auth keeps working after this task — `SESSION_SECRET` and old deps are removed only in Task 7.

**Files:**

- Modify: `server/package.json`
- Modify: `server/src/env.ts`
- Modify: `server/src/env.test.ts`
- Modify: `server/src/test/setup.ts`
- Modify: `.env.example`

**Interfaces:**

- Produces: `env.BETTER_AUTH_SECRET: string`, `env.BETTER_AUTH_URL: string` — consumed by Task 3.

- [ ] **Step 1: Install better-auth**

Run: `cd server && pnpm add better-auth`

- [ ] **Step 2: Write the failing env test**

In `server/src/env.test.ts`:

1. In every test that currently calls `vi.stubEnv('SESSION_SECRET', 'a'.repeat(32))`, add right after it:

```typescript
vi.stubEnv('BETTER_AUTH_SECRET', 'b'.repeat(32))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
```

2. Add these tests at the end of the `describe('env')` block:

```typescript
it('throws when BETTER_AUTH_SECRET is too short', async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
  vi.stubEnv('SESSION_SECRET', 'a'.repeat(32))
  vi.stubEnv('BETTER_AUTH_SECRET', 'b'.repeat(31))
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
  await expect(import('./env')).rejects.toThrow()
})

it('throws when BETTER_AUTH_URL is not a URL', async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
  vi.stubEnv('SESSION_SECRET', 'a'.repeat(32))
  vi.stubEnv('BETTER_AUTH_SECRET', 'b'.repeat(32))
  vi.stubEnv('BETTER_AUTH_URL', 'not-a-url')
  await expect(import('./env')).rejects.toThrow()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && pnpm test src/env.test.ts`
Expected: FAIL — the two new tests resolve instead of throwing (fields not in schema yet).

- [ ] **Step 4: Add the fields to `server/src/env.ts`**

Add below `SESSION_SECRET`:

```typescript
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
```

- [ ] **Step 5: Add the vars to the test global setup**

In `server/src/test/setup.ts`, below the `SESSION_SECRET` line:

```typescript
process.env.BETTER_AUTH_SECRET = 'test-better-auth-secret-at-least-32-chars'
process.env.BETTER_AUTH_URL = 'http://localhost:3000'
```

- [ ] **Step 6: Update `.env.example` and local `.env`**

Add to `.env.example` (keep `SESSION_SECRET` for now):

```
BETTER_AUTH_SECRET=replace-with-a-random-32-plus-character-string
BETTER_AUTH_URL=http://localhost:3000
```

Add the same keys with real values to your local, uncommitted `.env` (generate the secret with `openssl rand -base64 32`).

- [ ] **Step 7: Run the full suite and typecheck**

Run: `cd server && pnpm test && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add server/package.json pnpm-lock.yaml server/src/env.ts server/src/env.test.ts server/src/test/setup.ts .env.example
git commit -m "chore: add better-auth dependency and BETTER_AUTH_* env vars"
```

---

> **Tasks 2–5 are one atomic change.** After Task 2 the old code no longer typechecks (`passwordHash` is gone), so the pre-commit hook would reject a commit. Do not commit until Task 5, Step 10. Individual test files can still be run in between (Vitest does not typecheck).

### Task 2: Prisma schema for Better Auth + migration

**Files:**

- Modify: `server/prisma/schema.prisma` (the `User` model and the old `Session` model)
- Create: `server/prisma/migrations/<timestamp>_better_auth_migration/migration.sql` (generated)

**Interfaces:**

- Produces: `User.emailVerified`, `User.sessions`, `User.accounts`, models `Session`/`Account`/`Verification` — consumed by Task 3. `User.passwordHash` removed.

- [ ] **Step 1: Reset the local database**

Run: `cd server && pnpm prisma migrate reset --force --skip-seed`
Expected: database dropped and re-created with the existing migrations; no seed run.

Why: the new `session` table has NOT NULL columns without defaults, and an old admin row without an `account` row could never sign in.

- [ ] **Step 2: Replace the `User` model** with:

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

- [ ] **Step 3: Replace the old `Session` model** (`sid`/`sess`/`expire`, at the end of the file) with:

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

- [ ] **Step 4: Generate and apply the migration**

Run: `cd server && pnpm prisma migrate dev -n better-auth-migration`
Expected: ends with `Your database is now in sync with your schema.` and regenerates Prisma Client.

- [ ] **Step 5: Review the generated SQL**

Run: `cat server/prisma/migrations/*_better_auth_migration/migration.sql`
Expected: drops `users.passwordHash`, adds `users.emailVerified`, drops `session.sid/sess/expire` and adds the new `session` columns, creates `account` and `verification`, adds FKs with `ON DELETE CASCADE`. No other tables touched.

(No commit — continue to Task 3.)

---

### Task 3: Better Auth instance + `createCredentialUser`

**Files:**

- Create: `server/src/lib/auth.ts`
- Create: `server/src/lib/users.ts`
- Test: `server/src/lib/auth.test.ts`

**Interfaces:**

- Consumes: `prisma` (`server/src/db.ts`), `env.BETTER_AUTH_SECRET`/`env.BETTER_AUTH_URL` (Task 1), schema (Task 2).
- Produces: `auth` (consumed by Tasks 4, 5); `createCredentialUser({ email, password, name, role? }): Promise<User>` (consumed by Tasks 5, 6 and later Plan 09).

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/auth.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../db'
import { auth } from './auth'
import { createCredentialUser } from './users'

const ACTIVE = 'auth-active@test.com'
const BLOCKED = 'auth-blocked@test.com'
const SIGNUP = 'auth-signup@test.com'
const PASSWORD = 'password123'

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [ACTIVE, BLOCKED, SIGNUP] } } })
  await createCredentialUser({ email: ACTIVE, password: PASSWORD, name: 'Active' })
  const blocked = await createCredentialUser({
    email: BLOCKED,
    password: PASSWORD,
    name: 'Blocked',
  })
  await prisma.user.update({ where: { id: blocked.id }, data: { isBlocked: true } })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [ACTIVE, BLOCKED, SIGNUP] } } })
})

describe('createCredentialUser', () => {
  it('creates an AGENT with a hashed credential account', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: ACTIVE },
      include: { accounts: true },
    })
    expect(user.role).toBe('AGENT')
    expect(user.accounts).toHaveLength(1)
    expect(user.accounts[0].providerId).toBe('credential')
    expect(user.accounts[0].accountId).toBe(user.id)
    expect(user.accounts[0].password).toBeTruthy()
    expect(user.accounts[0].password).not.toBe(PASSWORD)
  })
})

describe('auth.api.signInEmail', () => {
  it('signs in with valid credentials', async () => {
    const result = await auth.api.signInEmail({ body: { email: ACTIVE, password: PASSWORD } })
    expect(result.user.email).toBe(ACTIVE)
  })

  it('rejects a wrong password', async () => {
    await expect(
      auth.api.signInEmail({ body: { email: ACTIVE, password: 'wrong-password' } }),
    ).rejects.toMatchObject({ status: 'UNAUTHORIZED' })
  })

  it('rejects an unknown email', async () => {
    await expect(
      auth.api.signInEmail({ body: { email: 'nobody@test.com', password: PASSWORD } }),
    ).rejects.toMatchObject({ status: 'UNAUTHORIZED' })
  })

  it('rejects a blocked user with the correct password and creates no session', async () => {
    await expect(
      auth.api.signInEmail({ body: { email: BLOCKED, password: PASSWORD } }),
    ).rejects.toMatchObject({ status: 'UNAUTHORIZED' })

    const sessions = await prisma.session.count({ where: { user: { email: BLOCKED } } })
    expect(sessions).toBe(0)
  })
})

describe('auth.api.signUpEmail', () => {
  it('is disabled', async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: SIGNUP, password: PASSWORD, name: 'Nope' } }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' })

    expect(await prisma.user.count({ where: { email: SIGNUP } })).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test src/lib/auth.test.ts`
Expected: FAIL — `Cannot find module './auth'`.

- [ ] **Step 3: Create `server/src/lib/auth.ts`**

```typescript
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError } from 'better-auth/api'

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
    disableSignUp: true,
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
  databaseHooks: {
    session: {
      create: {
        // Runs after the password is verified, so blocked accounts don't respond faster.
        before: async session => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isBlocked: true },
          })
          if (!user || user.isBlocked) {
            throw new APIError('UNAUTHORIZED', { message: 'Invalid credentials' })
          }
        },
      },
    },
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
})
```

- [ ] **Step 4: Create `server/src/lib/users.ts`**

```typescript
import type { Role, User } from '@prisma/client'

import { prisma } from '../db'
import { auth } from './auth'

interface NewCredentialUser {
  email: string
  password: string
  name: string
  role?: Role
}

// Public sign-up is disabled, so users are created here: Better Auth's own hasher,
// then User + credential Account in one transaction (same as its admin plugin).
export async function createCredentialUser({
  email,
  password,
  name,
  role = 'AGENT',
}: NewCredentialUser): Promise<User> {
  const ctx = await auth.$context
  const passwordHash = await ctx.password.hash(password)

  return prisma.$transaction(async tx => {
    const user = await tx.user.create({
      data: { email: email.toLowerCase(), name, role, emailVerified: true },
    })
    await tx.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: passwordHash,
      },
    })
    return user
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && pnpm test src/lib/auth.test.ts`
Expected: PASS (6 tests).

If a `rejects.toMatchObject({ status: ... })` assertion fails only because of the error shape, print the error and assert on the field Better Auth actually exposes (`status` string or `statusCode` number) — do not weaken the test to a bare `.rejects.toThrow()`.

(No commit — continue to Task 4.)

---

### Task 4: Rewrite auth middleware

**Files:**

- Modify: `server/src/middleware/auth.ts`
- Modify: `server/src/middleware/auth.test.ts`
- Create: `server/src/types/express.d.ts`
- Delete: `server/src/types/session.d.ts`

**Interfaces:**

- Consumes: `auth` (Task 3).
- Produces: `requireAuth(req, res, next)`, `requireRole(role)` — same signatures. `req.currentUser?: { id: string; role: 'AGENT' | 'ADMIN' }` — consumed by `routes/tickets.ts` (Task 5) and future routes.

- [ ] **Step 1: Swap the request type declarations**

Run: `rm server/src/types/session.d.ts`

Create `server/src/types/express.d.ts`:

```typescript
declare namespace Express {
  interface Request {
    currentUser?: {
      id: string
      role: 'AGENT' | 'ADMIN'
    }
  }
}
```

- [ ] **Step 2: Write the failing test**

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

function mockReq(currentUser?: Request['currentUser']): Request {
  return { headers: {}, currentUser } as unknown as Request
}

function mockRes(): { status: MockInstance; json: MockInstance } & Response {
  const res: { status?: MockInstance; json?: MockInstance } = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res as { status: MockInstance; json: MockInstance } & Response
}

function session(role: 'AGENT' | 'ADMIN', isBlocked = false) {
  return { user: { id: 'u1', role, isBlocked } }
}

const next = vi.fn() as unknown as NextFunction

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requireAuth', () => {
  it('sets req.currentUser and calls next when session exists', async () => {
    getSession.mockResolvedValue(session('AGENT'))
    const req = mockReq()
    await requireAuth(req, mockRes(), next)
    expect(req.currentUser).toEqual({ id: 'u1', role: 'AGENT' })
    expect(next).toHaveBeenCalledWith()
  })

  it('returns 401 when no session', async () => {
    getSession.mockResolvedValue(null)
    const res = mockRes()
    await requireAuth(mockReq(), res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when user is blocked', async () => {
    getSession.mockResolvedValue(session('AGENT', true))
    const res = mockRes()
    await requireAuth(mockReq(), res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('forwards session lookup errors to next', async () => {
    getSession.mockRejectedValue(new Error('db down'))
    const res = mockRes()
    await requireAuth(mockReq(), res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(res.status).not.toHaveBeenCalled()
  })
})

describe('requireRole', () => {
  it('calls next for matching role', async () => {
    getSession.mockResolvedValue(session('ADMIN'))
    await requireRole('ADMIN')(mockReq(), mockRes(), next)
    expect(next).toHaveBeenCalledWith()
  })

  it('returns 403 for insufficient role', async () => {
    getSession.mockResolvedValue(session('AGENT'))
    const res = mockRes()
    await requireRole('ADMIN')(mockReq(), res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('allows ADMIN to pass an AGENT role check', async () => {
    getSession.mockResolvedValue(session('ADMIN'))
    await requireRole('AGENT')(mockReq(), mockRes(), next)
    expect(next).toHaveBeenCalledWith()
  })

  it('returns 401 when no session', async () => {
    getSession.mockResolvedValue(null)
    const res = mockRes()
    await requireRole('ADMIN')(mockReq(), res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('reuses req.currentUser set by requireAuth without a second lookup', async () => {
    await requireRole('ADMIN')(mockReq({ id: 'u1', role: 'ADMIN' }), mockRes(), next)
    expect(getSession).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('forwards session lookup errors to next', async () => {
    getSession.mockRejectedValue(new Error('db down'))
    await requireRole('ADMIN')(mockReq(), mockRes(), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && pnpm test src/middleware/auth.test.ts`
Expected: FAIL — the current middleware reads `req.session.userId` (undefined on the mock request), so it never calls `getSession` or sets `req.currentUser`.

- [ ] **Step 4: Replace `server/src/middleware/auth.ts`**

```typescript
import { fromNodeHeaders } from 'better-auth/node'
import type { NextFunction, Request, Response } from 'express'

import { auth } from '../lib/auth'

type Role = 'AGENT' | 'ADMIN'
type CurrentUser = NonNullable<Request['currentUser']>

const ROLE_HIERARCHY: Record<Role, number> = { AGENT: 1, ADMIN: 2 }

async function loadCurrentUser(req: Request): Promise<CurrentUser | null> {
  if (req.currentUser) {
    return req.currentUser
  }
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session || session.user.isBlocked) {
    return null
  }
  req.currentUser = { id: session.user.id, role: session.user.role as Role }
  return req.currentUser
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await loadCurrentUser(req)
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}

export function requireRole(role: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await loadCurrentUser(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      if ((ROLE_HIERARCHY[user.role] ?? 0) < ROLE_HIERARCHY[role]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && pnpm test src/middleware/auth.test.ts`
Expected: PASS (10 tests).

(No commit — continue to Task 5.)

---

### Task 5: Wire into Express, fix ticket routes, integration tests — commit

**Files:**

- Modify: `server/src/app.ts`
- Modify: `server/src/routes/tickets.ts`
- Modify: `server/src/routes/tickets.test.ts`
- Modify: `server/src/services/ticketService.test.ts`
- Modify: `server/src/db.test.ts`
- Create: `server/src/test/auth.ts`
- Create: `server/src/routes/auth.integration.test.ts`
- Delete: `server/src/lib/session.ts`, `server/src/routes/auth.ts`, `server/src/routes/auth.test.ts`

**Interfaces:**

- Consumes: `auth`, `createCredentialUser` (Task 3), `requireAuth` + `req.currentUser` (Task 4).
- Produces: `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/get-session` (Better Auth built-ins); `signIn(email, password): Promise<string>` test helper returning a `Cookie` header value — for Plans 08/09 tests.

- [ ] **Step 1: Delete obsolete files**

Run: `rm server/src/lib/session.ts server/src/routes/auth.ts server/src/routes/auth.test.ts`

- [ ] **Step 2: Create the test helper `server/src/test/auth.ts`**

```typescript
import request from 'supertest'

import { app } from '../app'

export async function signIn(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/sign-in/email').send({ email, password })
  if (res.status !== 200) {
    throw new Error(`signIn(${email}) failed with status ${res.status}`)
  }
  const setCookie: string[] = res.headers['set-cookie'] ?? []
  return setCookie.map(cookie => cookie.split(';')[0]).join('; ')
}
```

- [ ] **Step 3: Write the failing integration tests**

Create `server/src/routes/auth.integration.test.ts`:

```typescript
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app'
import { prisma } from '../db'
import { env } from '../env'
import { createCredentialUser } from '../lib/users'
import { signIn } from '../test/auth'

const EMAIL = 'auth-http@test.com'
const SIGNUP = 'auth-http-signup@test.com'
const PASSWORD = 'password123'

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, SIGNUP] } } })
  await createCredentialUser({ email: EMAIL, password: PASSWORD, name: 'Auth HTTP' })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, SIGNUP] } } })
})

describe('POST /api/auth/sign-in/email', () => {
  it('returns 200 and sets a session cookie on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email: EMAIL, password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email: EMAIL, password: 'wrong-password' })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/sign-up/email', () => {
  it('is disabled', async () => {
    const res = await request(app)
      .post('/api/auth/sign-up/email')
      .send({ email: SIGNUP, password: PASSWORD, name: 'Nope' })
    expect(res.status).toBe(400)
    expect(await prisma.user.count({ where: { email: SIGNUP } })).toBe(0)
  })
})

describe('GET /api/auth/get-session', () => {
  it('returns the user with role and isBlocked when signed in', async () => {
    const cookie = await signIn(EMAIL, PASSWORD)
    const res = await request(app).get('/api/auth/get-session').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ email: EMAIL, role: 'AGENT', isBlocked: false })
  })

  it('returns null when not signed in', async () => {
    const res = await request(app).get('/api/auth/get-session')
    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
  })
})

describe('POST /api/auth/sign-out', () => {
  it('invalidates the session', async () => {
    const cookie = await signIn(EMAIL, PASSWORD)

    // Requests carrying a session cookie must send a trusted Origin; JSON body avoids a "simple request".
    const out = await request(app)
      .post('/api/auth/sign-out')
      .set('Cookie', cookie)
      .set('Origin', env.BETTER_AUTH_URL)
      .send({})
    expect(out.status).toBe(200)

    const res = await request(app).get('/api/tickets').set('Cookie', cookie)
    expect(res.status).toBe(401)
  })
})

describe('blocking a signed-in user', () => {
  it('rejects protected routes on the next request', async () => {
    const cookie = await signIn(EMAIL, PASSWORD)
    const before = await request(app).get('/api/tickets').set('Cookie', cookie)
    expect(before.status).toBe(200)

    await prisma.user.update({ where: { email: EMAIL }, data: { isBlocked: true } })
    try {
      const after = await request(app).get('/api/tickets').set('Cookie', cookie)
      expect(after.status).toBe(401)
    } finally {
      await prisma.user.update({ where: { email: EMAIL }, data: { isBlocked: false } })
    }
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd server && pnpm test src/routes/auth.integration.test.ts`
Expected: FAIL — `app.ts` still imports the deleted `./lib/session` and `./routes/auth`.

- [ ] **Step 5: Replace `server/src/app.ts`**

```typescript
import { toNodeHandler } from 'better-auth/node'
import express from 'express'

import { auth } from './lib/auth'
import { errorHandler } from './middleware/errorHandler'
import ticketsRouter from './routes/tickets'
import webhookRouter from './routes/webhooks'

export const app = express()

// Must be mounted before express.json(), which would consume the body Better Auth needs.
app.all('/api/auth/*', toNodeHandler(auth))

app.use(express.json())

app.use('/api/webhooks', webhookRouter)
app.use('/api/tickets', ticketsRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use(errorHandler)
```

- [ ] **Step 6: Update `server/src/routes/tickets.ts`**

In the `PATCH /:id` handler replace

```typescript
const ticket = await updateTicket(req.params.id, result.data, req.session.userId as string)
```

with

```typescript
const ticket = await updateTicket(req.params.id, result.data, req.currentUser?.id as string)
```

(`router.use(requireAuth)` guarantees `currentUser` is set — same reasoning as the old `as string` cast.)

- [ ] **Step 7: Update the remaining tests**

`server/src/routes/tickets.test.ts`:

1. Replace `import bcrypt from 'bcrypt'` with:

```typescript
import { createCredentialUser } from '../lib/users'
import { signIn } from '../test/auth'
```

(keep imports sorted: `../app`, `../db`, `../lib/users`, `../test/auth`).

2. Replace the user creation + login at the top of `beforeAll` with:

```typescript
await createCredentialUser({
  email: 'agent-ticket@test.com',
  password: 'password123',
  name: 'Agent',
})
cookie = await signIn('agent-ticket@test.com', 'password123')
```

`server/src/services/ticketService.test.ts`: delete the line `passwordHash: 'not-a-real-hash',`.

`server/src/db.test.ts`: in `can query all domain models without error`, add `prisma.account.findMany({ take: 1 })` to the `Promise.all` (destructure as `accounts`) and `expect(Array.isArray(accounts)).toBe(true)`.

- [ ] **Step 8: Run the full suite**

Run: `cd server && pnpm test`
Expected: all PASS — including `auth.integration.test.ts`, `lib/auth.test.ts`, `middleware/auth.test.ts`, `tickets.test.ts`.

If `sign-out` returns 403, Better Auth rejected the Origin: confirm `BETTER_AUTH_URL` in `test/setup.ts` exactly matches the `Origin` header value.

- [ ] **Step 9: Typecheck, lint, and look for leftovers**

Run: `cd server && pnpm typecheck && cd .. && pnpm lint`
Expected: no errors.

Run: `grep -rn "req.session\|passwordHash\|/api/auth/login\|/api/auth/me\|lib/session" server/src server/prisma/schema.prisma`
Expected: no matches.

- [ ] **Step 10: Commit (Tasks 2–5)**

```bash
git add server/prisma server/src
git commit -m "feat: replace express-session auth with better-auth

- Prisma schema: Better Auth session/account/verification, drop passwordHash
- lib/auth.ts with disabled public sign-up and blocked-user session hook
- createCredentialUser for server-side user creation
- requireAuth/requireRole on auth.api.getSession, req.currentUser
- mount /api/auth/* handler, migrate ticket routes and tests"
```

---

### Task 6: Seed the admin through `createCredentialUser`

**Files:**

- Modify: `server/prisma/seed.ts`

- [ ] **Step 1: Replace `server/prisma/seed.ts`**

```typescript
import { prisma } from '../src/db'
import { createCredentialUser } from '../src/lib/users'

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@helpdesk.local'
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123'

  if (!process.env.SEED_ADMIN_PASSWORD && process.env.NODE_ENV !== 'test') {
    console.warn(
      'WARNING: Using default admin password. Set SEED_ADMIN_PASSWORD before running in production.',
    )
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Admin already exists: ${email}`)
    return
  }

  await createCredentialUser({ email, password, name: 'Admin', role: 'ADMIN' })
  console.log(`Seeded admin: ${email}`)
}

void main().finally(() => prisma.$disconnect())
```

The seed now imports `src/env.ts` (through `lib/auth`), so `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` must be in the environment.

- [ ] **Step 2: Run the seed twice**

Run: `cd server && pnpm prisma db seed`
Expected: `Seeded admin: admin@helpdesk.local`

Run it again. Expected: `Admin already exists: admin@helpdesk.local`

If it fails with `Invalid environment variables`, the vars are only in the root `.env` — run `pnpm exec tsx --env-file=../.env prisma/seed.ts` instead.

- [ ] **Step 3: Smoke-test against the dev server**

Run: `cd server && pnpm dev` (separate terminal), then:

```bash
curl -i -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@helpdesk.local","password":"changeme123"}'
```

Expected: `HTTP/1.1 200`, a `set-cookie: better-auth.session_token=...` header, JSON body with `"role":"ADMIN"` in `user`.

- [ ] **Step 4: Commit**

```bash
git add server/prisma/seed.ts
git commit -m "feat: seed admin user via createCredentialUser"
```

---

### Task 7: Remove the old auth stack

**Files:**

- Modify: `server/package.json`
- Modify: `server/src/env.ts`, `server/src/env.test.ts`, `server/src/test/setup.ts`
- Modify: `.env.example`

- [ ] **Step 1: Remove old dependencies**

Run: `cd server && pnpm remove express-session connect-pg-simple bcrypt @types/express-session @types/connect-pg-simple @types/bcrypt`

- [ ] **Step 2: Remove `SESSION_SECRET`**

- `server/src/env.ts`: delete the `SESSION_SECRET` line.
- `server/src/env.test.ts`: delete every `vi.stubEnv('SESSION_SECRET', ...)` line and the whole `throws when SESSION_SECRET is too short` test.
- `server/src/test/setup.ts`: delete the `process.env.SESSION_SECRET = ...` line.
- `.env.example` and your local `.env`: delete the `SESSION_SECRET=...` line.

- [ ] **Step 3: Verify nothing references the old stack**

Run: `grep -rn "SESSION_SECRET\|bcrypt\|express-session\|connect-pg-simple" server/src server/prisma server/package.json .env.example`
Expected: no matches.

- [ ] **Step 4: Full verification**

Run: `cd server && pnpm test && pnpm typecheck && cd .. && pnpm lint`
Expected: all tests PASS, no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add server/package.json pnpm-lock.yaml server/src/env.ts server/src/env.test.ts server/src/test/setup.ts .env.example
git commit -m "chore: remove express-session, connect-pg-simple, bcrypt and SESSION_SECRET"
```

---

### Task 8: Mark downstream plans as outdated

Plans 05, 08, 09 and 11 were written for the old auth. They get a fresh spec + plan before execution; for now they only need a warning so nobody executes them as-is.

**Files:**

- Modify: `plans/index.md`
- Modify: `plans/05-frontend-core.md`, `plans/08-email-replies.md`, `plans/09-user-management.md`, `plans/11-e2e-playwright.md`

- [ ] **Step 1: Update `plans/index.md`**

In "Tech Stack Quick Reference" replace `- **Auth:** express-session + connect-pg-simple` with `- **Auth:** Better Auth (email + password, Prisma adapter) — see docs/superpowers/specs/2026-07-28-better-auth-migration-design.md`.

- [ ] **Step 2: Add a banner under the title of plans 05, 08, 09 and 11**

```markdown
> **⚠️ Outdated after the Better Auth migration.** This plan assumes `/api/auth/login`, `/api/auth/me`, `bcrypt` and `req.session`. Before executing it, write a fresh spec (superpowers:brainstorming) and plan. Use `createCredentialUser()` (`server/src/lib/users.ts`), the `signIn()` test helper (`server/src/test/auth.ts`), `req.currentUser`, and on the client `better-auth/react`. See "Wpływ na kolejne plany" in `docs/superpowers/specs/2026-07-28-better-auth-migration-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add plans/
git commit -m "docs: mark plans 05/08/09/11 as outdated after better-auth migration"
```

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch.
