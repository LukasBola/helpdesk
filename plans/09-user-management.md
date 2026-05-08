# Plan 09: User Management (Admin)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-only CRUD for users — list all users, create new agents, update role, and block/unblock. Frontend user management page accessible only to ADMIN role.

**Architecture:** All user management routes protected by `requireRole('ADMIN')`. Passwords hashed on creation. Blocked users are rejected at login (already handled in Plan 02 auth route). Users cannot delete themselves.

**Tech Stack:** Express, Prisma, bcrypt, Zod, React + TanStack Query

**Prerequisite:** Plan 02 (auth middleware + `requireRole`).

---

## File Map

```
server/src/
└── routes/
    └── users.ts              # GET /api/users, POST, PATCH /:id, DELETE /:id

client/src/
├── hooks/
│   └── useUsers.ts           # list + mutations
└── pages/
    └── UsersPage.tsx         # user list + create form
```

---

### Task 1: Users API

**Files:**

- Create: `server/src/routes/users.ts`

- [ ] **Step 1: Write failing integration tests**

Create `server/src/routes/users.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { prisma } from '../db'
import bcrypt from 'bcrypt'

let adminCookie: string
let agentCookie: string
let createdUserId: string

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: 'admin-users@test.com',
      name: 'Admin',
      passwordHash: await bcrypt.hash('pass123', 10),
      role: 'ADMIN',
    },
  })

  await prisma.user.create({
    data: {
      email: 'agent-users@test.com',
      name: 'Agent',
      passwordHash: await bcrypt.hash('pass123', 10),
      role: 'AGENT',
    },
  })

  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin-users@test.com', password: 'pass123' })
  adminCookie = adminLogin.headers['set-cookie'][0]

  const agentLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'agent-users@test.com', password: 'pass123' })
  agentCookie = agentLogin.headers['set-cookie'][0]
})

afterAll(async () => {
  await prisma.user.deleteMany()
})

describe('GET /api/users', () => {
  it('returns user list for admin', async () => {
    const res = await request(app).get('/api/users').set('Cookie', adminCookie)
    expect(res.status).toBe(200)
    expect(res.body).toBeInstanceOf(Array)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body[0].passwordHash).toBeUndefined()
  })

  it('returns 403 for agent', async () => {
    const res = await request(app).get('/api/users').set('Cookie', agentCookie)
    expect(res.status).toBe(403)
  })
})

describe('POST /api/users', () => {
  it('creates a new agent', async () => {
    const res = await request(app).post('/api/users').set('Cookie', adminCookie).send({
      email: 'new-agent@test.com',
      name: 'New Agent',
      password: 'securePass1',
      role: 'AGENT',
    })
    expect(res.status).toBe(201)
    expect(res.body.email).toBe('new-agent@test.com')
    expect(res.body.passwordHash).toBeUndefined()
    createdUserId = res.body.id
  })

  it('returns 422 on duplicate email', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({ email: 'new-agent@test.com', name: 'Dup', password: 'securePass1', role: 'AGENT' })
    expect(res.status).toBe(422)
  })
})

describe('PATCH /api/users/:id', () => {
  it('blocks a user', async () => {
    const res = await request(app)
      .patch(`/api/users/${createdUserId}`)
      .set('Cookie', adminCookie)
      .send({ isBlocked: true })
    expect(res.status).toBe(200)
    expect(res.body.isBlocked).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test src/routes/users.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `server/src/routes/users.ts`**

```typescript
import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { requireAuth, requireRole } from '../middleware/auth'
import { prisma } from '../db'

const router = Router()

router.use(requireAuth, requireRole('ADMIN'))

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isBlocked: true,
  createdAt: true,
}

router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: 'asc' },
  })
  res.json(users)
})

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(['AGENT', 'ADMIN']).default('AGENT'),
})

router.post('/', async (req, res) => {
  const result = createSchema.safeParse(req.body)
  if (!result.success) {
    res.status(422).json({ error: result.error.flatten() })
    return
  }

  const { email, name, password, role } = result.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(422).json({ error: 'Email already in use' })
    return
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 10),
      role,
    },
    select: USER_SELECT,
  })

  res.status(201).json(user)
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['AGENT', 'ADMIN']).optional(),
  isBlocked: z.boolean().optional(),
})

router.patch('/:id', async (req, res) => {
  const result = updateSchema.safeParse(req.body)
  if (!result.success) {
    res.status(422).json({ error: result.error.flatten() })
    return
  }

  if (req.params.id === req.session.userId) {
    res.status(422).json({ error: 'Cannot modify your own account' })
    return
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: result.data,
      select: USER_SELECT,
    })
    res.json(user)
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})

export default router
```

- [ ] **Step 4: Wire route in `server/src/app.ts`**

```typescript
import usersRouter from './routes/users'
// ...
app.use('/api/users', usersRouter)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && pnpm test src/routes/users.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/users.ts server/src/routes/users.test.ts server/src/app.ts
git commit -m "feat: admin user management API — list, create, update, block"
```

---

### Task 2: Users frontend

**Files:**

- Create: `client/src/hooks/useUsers.ts`
- Create: `client/src/pages/UsersPage.tsx`

- [ ] **Step 1: Create `client/src/hooks/useUsers.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export type User = {
  id: string
  email: string
  name: string
  role: 'AGENT' | 'ADMIN'
  isBlocked: boolean
  createdAt: string
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get<User[]>('/users')
      return res.data
    },
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      email: string
      name: string
      password: string
      role: 'AGENT' | 'ADMIN'
    }) => api.post('/users', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { isBlocked?: boolean; role?: 'AGENT' | 'ADMIN' }) =>
      api.patch(`/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}
```

- [ ] **Step 2: Create `client/src/pages/UsersPage.tsx`**

```typescript
import { useState, FormEvent } from 'react'
import { useUsers, useCreateUser, useUpdateUser } from '../hooks/useUsers'
import type { User } from '../hooks/useUsers'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'

function UserRow({ user }: { user: User }) {
  const update = useUpdateUser(user.id)
  return (
    <tr className="border-b">
      <td className="px-4 py-3 text-sm">{user.name}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
      <td className="px-4 py-3">
        <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{user.role}</span>
      </td>
      <td className="px-4 py-3">
        <Button
          size="sm"
          variant={user.isBlocked ? 'default' : 'outline'}
          onClick={() => update.mutate({ isBlocked: !user.isBlocked })}
        >
          {user.isBlocked ? 'Unblock' : 'Block'}
        </Button>
      </td>
    </tr>
  )
}

export function UsersPage() {
  const { data: users = [], isLoading } = useUsers()
  const createUser = useCreateUser()
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'AGENT' as const })
  const [error, setError] = useState('')

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await createUser.mutateAsync(form)
      setForm({ email: '', name: '', password: '', role: 'AGENT' })
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to create user')
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <h1 className="text-xl font-semibold">User Management</h1>

      <section className="bg-white border rounded p-5 space-y-4">
        <h2 className="font-medium">Add user</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <select
              className="w-full border rounded h-9 px-3 text-sm"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as 'AGENT' | 'ADMIN' }))}
            >
              <option value="AGENT">Agent</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
          <div className="col-span-2">
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-medium mb-3">All users ({users.length})</h2>
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="bg-white border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <UserRow key={user.id} user={user} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Update route in `client/src/App.tsx`**

```typescript
import { UsersPage } from './pages/UsersPage'
// replace placeholder:
<Route path="/users" element={<UsersPage />} />
```

- [ ] **Step 4: Verify in browser**

Log in as admin. Navigate to `/users`. Create a user, block them, verify they cannot log in.

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useUsers.ts client/src/pages/UsersPage.tsx client/src/App.tsx
git commit -m "feat: admin user management page — list, create, block/unblock"
```
