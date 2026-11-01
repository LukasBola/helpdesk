import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { mockSession, renderRoute } from '@/test/render'

// Dynamic import: a static one may evaluate after '@/lib/auth-client' is first imported.
vi.mock('@/lib/auth-client', async () => (await import('@/test/auth-client-mock')).authClientMock())

describe('route protection', () => {
  it('shows the login page when there is no session', () => {
    mockSession(null)
    renderRoute('/tickets')
    expect(screen.getByRole('button', { name: 'Zaloguj się' })).toBeInTheDocument()
  })

  it('shows only the loader while the session is pending', () => {
    mockSession(null, { isPending: true })
    renderRoute('/tickets')
    expect(screen.getByRole('status', { name: 'Ładowanie' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zaloguj się' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tickety' })).not.toBeInTheDocument()
  })

  it('treats a blocked user as logged out (no loop)', () => {
    mockSession({ isBlocked: true })
    renderRoute('/tickets')
    expect(screen.getByRole('button', { name: 'Zaloguj się' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tickety' })).not.toBeInTheDocument()
  })

  it('renders the page for an active user', () => {
    mockSession({})
    renderRoute('/tickets')
    expect(screen.getByRole('heading', { name: 'Tickety' })).toBeInTheDocument()
  })

  it('redirects an AGENT away from /users', () => {
    mockSession({ role: 'AGENT' })
    renderRoute('/users')
    expect(screen.getByRole('heading', { name: 'Tickety' })).toBeInTheDocument()
  })

  it('lets an ADMIN open /users', () => {
    mockSession({ role: 'ADMIN' })
    renderRoute('/users')
    expect(screen.getByRole('heading', { name: 'Użytkownicy' })).toBeInTheDocument()
  })

  it('renders 404 for an unknown path', () => {
    mockSession(null)
    renderRoute('/nope')
    expect(screen.getByRole('heading', { name: 'Nie znaleziono strony' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wróć do ticketów' })).toHaveAttribute(
      'href',
      '/tickets',
    )
  })

  it('redirects / to /tickets', () => {
    mockSession({})
    renderRoute('/')
    expect(screen.getByRole('heading', { name: 'Tickety' })).toBeInTheDocument()
  })
})
