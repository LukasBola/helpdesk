# Plan 06: Frontend Tickets

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ticket list page (with status/priority filters and search), ticket detail page (body, history timeline, reply thread), and status/priority update controls.

**Architecture:** TanStack Query manages server state. `useTickets` and `useTicket` hooks wrap API calls. Mutations call `PATCH /api/tickets/:id` and invalidate the relevant query keys on success. Filtering is URL-driven via `useSearchParams`.

**Tech Stack:** TanStack Query 5, React Router 6 (useSearchParams), shadcn/ui, Tailwind

**Prerequisite:** Plan 04 (ticket API), Plan 05 (frontend shell running).

---

## File Map

```
client/src/
├── hooks/
│   ├── useTickets.ts          # list query + filters
│   └── useTicket.ts           # single ticket query + update mutation
├── components/
│   ├── TicketStatusBadge.tsx  # colour-coded status chip
│   ├── TicketPriorityBadge.tsx
│   ├── TicketFilters.tsx      # filter bar (status, priority, search)
│   ├── TicketRow.tsx          # single row in the list table
│   └── TicketHistory.tsx      # timeline of changes
└── pages/
    ├── TicketsPage.tsx         # list view
    └── TicketPage.tsx          # detail view
```

---

### Task 1: Ticket hooks

**Files:**

- Create: `client/src/hooks/useTickets.ts`
- Create: `client/src/hooks/useTicket.ts`

- [ ] **Step 1: Write failing tests**

Create `client/src/hooks/useTickets.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTickets } from './useTickets'
import React from 'react'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      data: {
        tickets: [
          {
            id: 't1',
            subject: 'Test',
            status: 'OPEN',
            priority: 'MEDIUM',
            customerEmail: 'c@test.com',
            createdAt: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        limit: 25,
      },
    }),
  },
}))

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: new QueryClient() }, children)
}

describe('useTickets', () => {
  it('fetches ticket list', async () => {
    const { result } = renderHook(() => useTickets({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.tickets).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && pnpm test src/hooks/useTickets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `client/src/hooks/useTickets.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

type TicketFilters = {
  status?: string
  priority?: string
  search?: string
  page?: number
}

export function useTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: ['tickets', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.priority) params.set('priority', filters.priority)
      if (filters.search) params.set('search', filters.search)
      if (filters.page) params.set('page', String(filters.page))
      const res = await api.get(`/tickets?${params}`)
      return res.data as {
        tickets: Ticket[]
        total: number
        page: number
        limit: number
      }
    },
  })
}

export type Ticket = {
  id: string
  subject: string
  status: string
  priority: string
  customerEmail: string
  customerName: string | null
  assigneeId: string | null
  assignee: { id: string; name: string; email: string } | null
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 4: Create `client/src/hooks/useTicket.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export type TicketDetail = {
  id: string
  subject: string
  body: string
  status: string
  priority: string
  customerEmail: string
  customerName: string | null
  createdAt: string
  updatedAt: string
  assignee: { id: string; name: string; email: string } | null
  history: HistoryEntry[]
  replies: Reply[]
}

export type HistoryEntry = {
  id: string
  field: string
  oldValue: string | null
  newValue: string | null
  createdAt: string
  user: { id: string; name: string } | null
}

export type Reply = {
  id: string
  body: string
  sentAt: string
  user: { id: string; name: string }
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['tickets', id],
    queryFn: async () => {
      const res = await api.get(`/tickets/${id}`)
      return res.data as TicketDetail
    },
  })
}

export function useUpdateTicket(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { status?: string; priority?: string }) => api.patch(`/tickets/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets', id] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && pnpm test src/hooks/useTickets.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/hooks/
git commit -m "feat: useTickets and useTicket query hooks"
```

---

### Task 2: Status and priority badges

**Files:**

- Create: `client/src/components/TicketStatusBadge.tsx`
- Create: `client/src/components/TicketPriorityBadge.tsx`

- [ ] **Step 1: Write failing tests**

Create `client/src/components/TicketStatusBadge.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TicketStatusBadge } from './TicketStatusBadge'

describe('TicketStatusBadge', () => {
  it('renders OPEN status', () => {
    render(<TicketStatusBadge status="OPEN" />)
    expect(screen.getByText('Open')).toBeDefined()
  })

  it('renders IN_PROGRESS status', () => {
    render(<TicketStatusBadge status="IN_PROGRESS" />)
    expect(screen.getByText('In Progress')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && pnpm test src/components/TicketStatusBadge.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `client/src/components/TicketStatusBadge.tsx`**

```typescript
const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-slate-100 text-slate-600',
}

export function TicketStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-slate-100'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
```

- [ ] **Step 4: Create `client/src/components/TicketPriorityBadge.tsx`**

```typescript
const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
}

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
}

export function TicketPriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[priority] ?? 'bg-slate-100'}`}>
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && pnpm test src/components/TicketStatusBadge.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/components/TicketStatusBadge.tsx client/src/components/TicketStatusBadge.test.tsx client/src/components/TicketPriorityBadge.tsx
git commit -m "feat: ticket status and priority badge components"
```

---

### Task 3: Tickets list page

**Files:**

- Create: `client/src/components/TicketFilters.tsx`
- Create: `client/src/pages/TicketsPage.tsx`

- [ ] **Step 1: Create `client/src/components/TicketFilters.tsx`**

```typescript
import { useSearchParams } from 'react-router-dom'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Input } from './ui/input'
import { useCallback } from 'react'

export function TicketFilters() {
  const [params, setParams] = useSearchParams()

  const set = useCallback(
    (key: string, value: string) => {
      setParams(prev => {
        const next = new URLSearchParams(prev)
        if (value) {
          next.set(key, value)
        } else {
          next.delete(key)
        }
        next.delete('page')
        return next
      })
    },
    [setParams]
  )

  return (
    <div className="flex gap-3 flex-wrap">
      <Input
        placeholder="Search tickets…"
        defaultValue={params.get('search') ?? ''}
        onChange={e => set('search', e.target.value)}
        className="w-56"
      />
      <Select value={params.get('status') ?? ''} onValueChange={v => set('status', v)}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All statuses</SelectItem>
          <SelectItem value="OPEN">Open</SelectItem>
          <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
          <SelectItem value="RESOLVED">Resolved</SelectItem>
          <SelectItem value="CLOSED">Closed</SelectItem>
        </SelectContent>
      </Select>
      <Select value={params.get('priority') ?? ''} onValueChange={v => set('priority', v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="All priorities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All priorities</SelectItem>
          <SelectItem value="LOW">Low</SelectItem>
          <SelectItem value="MEDIUM">Medium</SelectItem>
          <SelectItem value="HIGH">High</SelectItem>
          <SelectItem value="URGENT">Urgent</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
```

- [ ] **Step 2: Create `client/src/pages/TicketsPage.tsx`**

```typescript
import { Link, useSearchParams } from 'react-router-dom'
import { useTickets } from '../hooks/useTickets'
import { TicketStatusBadge } from '../components/TicketStatusBadge'
import { TicketPriorityBadge } from '../components/TicketPriorityBadge'
import { TicketFilters } from '../components/TicketFilters'
import { Button } from '../components/ui/button'

export function TicketsPage() {
  const [params] = useSearchParams()
  const page = Number(params.get('page') ?? 1)

  const { data, isLoading } = useTickets({
    status: params.get('status') ?? undefined,
    priority: params.get('priority') ?? undefined,
    search: params.get('search') ?? undefined,
    page,
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tickets</h1>
        <span className="text-sm text-slate-500">{data?.total ?? 0} total</span>
      </div>
      <TicketFilters />
      {isLoading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : (
        <div className="bg-white rounded border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Subject</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Priority</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.tickets.map(ticket => (
                <tr key={ticket.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/tickets/${ticket.id}`} className="font-medium hover:underline">
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{ticket.customerEmail}</td>
                  <td className="px-4 py-3">
                    <TicketStatusBadge status={ticket.status} />
                  </td>
                  <td className="px-4 py-3">
                    <TicketPriorityBadge priority={ticket.priority} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex gap-2">
        {page > 1 && (
          <Link to={`?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page - 1) })}`}>
            <Button variant="outline" size="sm">Previous</Button>
          </Link>
        )}
        {data && data.total > page * data.limit && (
          <Link to={`?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page + 1) })}`}>
            <Button variant="outline" size="sm">Next</Button>
          </Link>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update route in `client/src/App.tsx`**

```typescript
import { TicketsPage } from './pages/TicketsPage'
// replace placeholder:
<Route path="/" element={<TicketsPage />} />
```

- [ ] **Step 4: Verify in browser**

Start dev server, navigate to `/`. Ticket list should render. Filter by status works.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/TicketsPage.tsx client/src/components/TicketFilters.tsx
git commit -m "feat: ticket list page with filters and pagination"
```

---

### Task 4: Ticket detail page

**Files:**

- Create: `client/src/components/TicketHistory.tsx`
- Create: `client/src/pages/TicketPage.tsx`

- [ ] **Step 1: Create `client/src/components/TicketHistory.tsx`**

```typescript
import type { HistoryEntry } from '../hooks/useTicket'

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  assigneeId: 'Assignee',
}

export function TicketHistory({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-slate-400">No changes yet.</p>
  }

  return (
    <ol className="relative border-l border-slate-200 space-y-4 ml-3">
      {history.map(entry => (
        <li key={entry.id} className="ml-4">
          <div className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-slate-300" />
          <p className="text-sm text-slate-600">
            <span className="font-medium">{entry.user?.name ?? 'System'}</span>{' '}
            changed <span className="font-medium">{FIELD_LABELS[entry.field] ?? entry.field}</span>{' '}
            from <code className="bg-slate-100 px-1 rounded">{entry.oldValue ?? '—'}</code> to{' '}
            <code className="bg-slate-100 px-1 rounded">{entry.newValue ?? '—'}</code>
          </p>
          <time className="text-xs text-slate-400">
            {new Date(entry.createdAt).toLocaleString()}
          </time>
        </li>
      ))}
    </ol>
  )
}
```

- [ ] **Step 2: Create `client/src/pages/TicketPage.tsx`**

```typescript
import { useParams } from 'react-router-dom'
import { useTicket, useUpdateTicket } from '../hooks/useTicket'
import { TicketStatusBadge } from '../components/TicketStatusBadge'
import { TicketPriorityBadge } from '../components/TicketPriorityBadge'
import { TicketHistory } from '../components/TicketHistory'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'

export function TicketPage() {
  const { id } = useParams<{ id: string }>()
  const { data: ticket, isLoading } = useTicket(id!)
  const update = useUpdateTicket(id!)

  if (isLoading) return <div className="p-6 text-slate-500">Loading…</div>
  if (!ticket) return <div className="p-6 text-red-500">Ticket not found.</div>

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{ticket.subject}</h1>
        <p className="text-sm text-slate-500">From: {ticket.customerEmail}</p>
      </div>

      <div className="flex gap-4 items-center">
        <div className="space-y-1">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Status</p>
          <Select
            value={ticket.status}
            onValueChange={status => update.mutate({ status })}
          >
            <SelectTrigger className="w-36 h-8">
              <SelectValue>
                <TicketStatusBadge status={ticket.status} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map(s => (
                <SelectItem key={s} value={s}>
                  <TicketStatusBadge status={s} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Priority</p>
          <Select
            value={ticket.priority}
            onValueChange={priority => update.mutate({ priority })}
          >
            <SelectTrigger className="w-32 h-8">
              <SelectValue>
                <TicketPriorityBadge priority={ticket.priority} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => (
                <SelectItem key={p} value={p}>
                  <TicketPriorityBadge priority={p} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white rounded border p-4 text-sm whitespace-pre-wrap">
        {ticket.body}
      </div>

      <section>
        <h2 className="text-sm font-semibold text-slate-600 mb-3">Change history</h2>
        <TicketHistory history={ticket.history} />
      </section>

      {ticket.replies.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-600 mb-3">Replies</h2>
          <div className="space-y-3">
            {ticket.replies.map(reply => (
              <div key={reply.id} className="bg-white rounded border p-4 text-sm">
                <p className="font-medium text-slate-700 mb-1">{reply.user.name}</p>
                <p className="whitespace-pre-wrap">{reply.body}</p>
                <time className="text-xs text-slate-400 mt-2 block">
                  {new Date(reply.sentAt).toLocaleString()}
                </time>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update route in `client/src/App.tsx`**

```typescript
import { TicketPage } from './pages/TicketPage'
// replace placeholder:
<Route path="/tickets/:id" element={<TicketPage />} />
```

- [ ] **Step 4: Verify in browser**

Click a ticket in the list. Detail view loads. Status dropdown updates ticket and history entry appears.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/TicketPage.tsx client/src/components/TicketHistory.tsx
git commit -m "feat: ticket detail page with status/priority controls and history"
```
