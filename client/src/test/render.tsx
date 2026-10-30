import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

import { AppRoutes, ROUTER_FUTURE } from '@/App'
import { type SessionUser, useSession } from '@/lib/auth-client'

// Test files must mock the auth client themselves, e.g.:
// vi.mock('@/lib/auth-client', () => ({ useSession: vi.fn(), signIn: { email: vi.fn() }, signOut: vi.fn() }))

// The mocked useSession reads from a tiny store, so components re-render when a test
// changes the session, like the real Better Auth store does after sign-in.
type SessionState = ReturnType<typeof useSession>
let sessionState: SessionState
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setSessionState(next: SessionState) {
  sessionState = next
  vi.mocked(useSession).mockImplementation(() =>
    useSyncExternalStore(subscribe, () => sessionState),
  )
  act(() => listeners.forEach(listener => listener()))
}

export function mockSession(
  user: Partial<SessionUser> | null,
  opts: { isPending?: boolean } = {},
): void {
  const data = user
    ? {
        user: {
          id: 'u1',
          name: 'Anna Kowalska',
          email: 'anna@firma.pl',
          emailVerified: false,
          role: 'AGENT' as const,
          isBlocked: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...user,
        },
        session: {
          id: 's1',
          userId: 'u1',
          token: 't',
          expiresAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }
    : null
  setSessionState({
    data,
    isPending: opts.isPending ?? false,
    error: null,
    refetch: vi.fn(),
  } as unknown as SessionState)
}

export function renderRoute(path: string, opts: { state?: unknown } = {}) {
  const url = new URL(path, 'http://x')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter
      future={ROUTER_FUTURE}
      initialEntries={[{ pathname: url.pathname, search: url.search, state: opts.state }]}
    >
      <QueryClientProvider client={queryClient}>
        <AppRoutes />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}
