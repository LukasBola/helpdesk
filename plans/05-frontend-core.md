# Plan 05: Frontend Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React SPA with React Router, TanStack Query, axios, a login page, protected route wrapper, and app shell (sidebar + header).

**Architecture:** `AuthContext` holds the current user from `GET /api/auth/me`. `ProtectedRoute` redirects to `/login` when unauthenticated. All API calls go through a single axios instance (base URL `/api`, credentials: include).

**Tech Stack:** React 18, React Router 6, TanStack Query 5, axios, Tailwind, shadcn/ui

**Prerequisite:** Plan 01 (client scaffolded), Plan 02 (auth API endpoints live).

---

## File Map

```
client/src/
├── lib/
│   ├── api.ts               # axios instance
│   └── queryClient.ts       # TanStack Query client
├── contexts/
│   └── AuthContext.tsx      # current user state + login/logout helpers
├── components/
│   ├── ProtectedRoute.tsx   # redirects to /login if not authed
│   └── AppShell.tsx         # sidebar + header layout
├── pages/
│   ├── LoginPage.tsx
│   └── NotFoundPage.tsx
├── main.tsx                 # QueryClientProvider + Router setup
├── App.tsx                  # route definitions
└── test-setup.ts            # RTL + vitest globals
```

---

### Task 1: API client + Query client

**Files:**
- Create: `client/src/lib/api.ts`
- Create: `client/src/lib/queryClient.ts`

- [ ] **Step 1: Create `client/src/lib/api.ts`**

```typescript
import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)
```

- [ ] **Step 2: Create `client/src/lib/queryClient.ts`**

```typescript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})
```

---

### Task 2: Auth context

**Files:**
- Create: `client/src/contexts/AuthContext.tsx`

- [ ] **Step 1: Write failing component tests**

Create `client/src/contexts/AuthContext.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from './AuthContext'
import { QueryClientProvider } from '@tanstack/react-query'
import { QueryClient } from '@tanstack/react-query'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { id: 'u1', email: 'a@test.com', name: 'A', role: 'AGENT' } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

function TestConsumer() {
  const { user, logout } = useAuth()
  return (
    <div>
      <span data-testid="email">{user?.email ?? 'none'}</span>
      <button onClick={logout}>logout</button>
    </div>
  )
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}

describe('AuthContext', () => {
  it('loads current user on mount', async () => {
    render(<TestConsumer />, { wrapper })
    await waitFor(() => {
      expect(screen.getByTestId('email').textContent).toBe('a@test.com')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && pnpm test src/contexts/AuthContext.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `client/src/contexts/AuthContext.tsx`**

```typescript
import { createContext, useContext, ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

type User = {
  id: string
  email: string
  name: string
  role: 'AGENT' | 'ADMIN'
}

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()

  const { data: user = null, isLoading } = useQuery<User | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const res = await api.get<User>('/auth/me')
        return res.data
      } catch {
        return null
      }
    },
  })

  async function logout() {
    await api.post('/auth/logout')
    qc.setQueryData(['me'], null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && pnpm test src/contexts/AuthContext.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/ client/src/contexts/
git commit -m "feat: axios api client, query client, auth context"
```

---

### Task 3: Protected route

**Files:**
- Create: `client/src/components/ProtectedRoute.tsx`

- [ ] **Step 1: Write failing tests**

Create `client/src/components/ProtectedRoute.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../contexts/AuthContext'

describe('ProtectedRoute', () => {
  it('renders children when authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', email: 'a@test.com', name: 'A', role: 'AGENT' }, isLoading: false, logout: vi.fn() })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Dashboard</div>} />
          </Route>
          <Route path="/login" element={<div>Login</div>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Dashboard')).toBeDefined()
  })

  it('redirects to /login when unauthenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false, logout: vi.fn() })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Dashboard</div>} />
          </Route>
          <Route path="/login" element={<div>Login</div>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Login')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && pnpm test src/components/ProtectedRoute.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `client/src/components/ProtectedRoute.tsx`**

```typescript
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) return null

  if (!user) return <Navigate to="/login" replace />

  return <Outlet />
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && pnpm test src/components/ProtectedRoute.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ProtectedRoute.tsx client/src/components/ProtectedRoute.test.tsx
git commit -m "feat: ProtectedRoute — redirects to /login when unauthenticated"
```

---

### Task 4: Login page

**Files:**
- Create: `client/src/pages/LoginPage.tsx`

- [ ] **Step 1: Write failing tests**

Create `client/src/pages/LoginPage.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { LoginPage } from './LoginPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: { id: 'u1', email: 'a@test.com', name: 'A', role: 'AGENT' } }),
  },
}))

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('LoginPage', () => {
  it('submits credentials and navigates to /', async () => {
    render(<LoginPage />, { wrapper })

    await userEvent.type(screen.getByLabelText(/email/i), 'a@test.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'pass123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'))
  })

  it('shows error message on failed login', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { error: 'Invalid credentials' } } })

    render(<LoginPage />, { wrapper })

    await userEvent.type(screen.getByLabelText(/email/i), 'bad@test.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(screen.getByText(/invalid credentials/i)).toBeDefined())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && pnpm test src/pages/LoginPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `client/src/pages/LoginPage.tsx`**

```typescript
import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

export function LoginPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { email, password })
      qc.setQueryData(['me'], res.data)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Helpdesk</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && pnpm test src/pages/LoginPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/LoginPage.tsx client/src/pages/LoginPage.test.tsx
git commit -m "feat: login page with form validation and error handling"
```

---

### Task 5: App shell + routing

**Files:**
- Create: `client/src/components/AppShell.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/main.tsx`

- [ ] **Step 1: Create `client/src/components/AppShell.tsx`**

```typescript
import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function AppShell() {
  const { user, logout } = useAuth()

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-56 bg-white border-r flex flex-col">
        <div className="p-4 font-semibold text-lg border-b">Helpdesk</div>
        <nav className="flex-1 p-3 space-y-1">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `block px-3 py-2 rounded text-sm font-medium ${isActive ? 'bg-slate-100' : 'hover:bg-slate-50'}`
            }
          >
            Tickets
          </NavLink>
          {user?.role === 'ADMIN' && (
            <NavLink
              to="/users"
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm font-medium ${isActive ? 'bg-slate-100' : 'hover:bg-slate-50'}`
              }
            >
              Users
            </NavLink>
          )}
        </nav>
        <div className="p-3 border-t text-sm text-slate-500">
          <p className="truncate">{user?.name}</p>
          <button
            onClick={logout}
            className="text-xs text-slate-400 hover:text-slate-600 mt-1"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Update `client/src/App.tsx`**

```typescript
import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import { LoginPage } from './pages/LoginPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<div className="p-6">Tickets — coming in Plan 06</div>} />
          <Route path="/tickets/:id" element={<div className="p-6">Ticket detail — coming in Plan 06</div>} />
          <Route path="/users" element={<div className="p-6">Users — coming in Plan 09</div>} />
        </Route>
      </Route>
      <Route path="*" element={<div className="p-6 text-center">404 — Page not found</div>} />
    </Routes>
  )
}
```

- [ ] **Step 3: Update `client/src/main.tsx`**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './contexts/AuthContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)
```

- [ ] **Step 4: Start dev server and verify login works**

Run: `pnpm dev` from repo root.

Open http://localhost:5173 — should redirect to `/login`. Log in with seeded admin credentials (`admin@helpdesk.local` / `changeme123`). Should land on the main layout with sidebar.

- [ ] **Step 5: Commit**

```bash
git add client/src/
git commit -m "feat: app shell with sidebar, routing, and auth flow wired"
```
