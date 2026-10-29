import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

import { AppRoutes, ROUTER_FUTURE } from '@/App'
import { type SessionUser, useSession } from '@/lib/auth-client'

// Test files must mock the auth client themselves, e.g.:
// vi.mock('@/lib/auth-client', () => ({ useSession: vi.fn(), signIn: { email: vi.fn() }, signOut: vi.fn() }))

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
  vi.mocked(useSession).mockReturnValue({
    data,
    isPending: opts.isPending ?? false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useSession>)
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
