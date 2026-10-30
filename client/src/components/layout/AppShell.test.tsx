import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { refreshSession, signOut } from '@/lib/auth-client'
import { mockSession, renderRoute } from '@/test/render'

// Dynamic import: a static one may evaluate after '@/lib/auth-client' is first imported.
vi.mock('@/lib/auth-client', async () => (await import('@/test/auth-client-mock')).authClientMock())

describe('AppShell', () => {
  beforeEach(() => {
    vi.mocked(signOut).mockReset()
    vi.mocked(refreshSession).mockReset()
  })

  it('greets the user by first name', () => {
    mockSession({ name: 'Anna Kowalska' })
    renderRoute('/tickets')
    expect(screen.getByText('Dzień dobry,')).toBeInTheDocument()
    expect(screen.getByText('Anna 👋')).toBeInTheDocument()
  })

  it('hides Użytkownicy for an AGENT', () => {
    mockSession({ role: 'AGENT' })
    renderRoute('/tickets')
    expect(screen.getByRole('link', { name: /Tickety/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Użytkownicy/ })).not.toBeInTheDocument()
  })

  it('shows Użytkownicy for an ADMIN', () => {
    mockSession({ role: 'ADMIN' })
    renderRoute('/tickets')
    expect(screen.getByRole('link', { name: /Użytkownicy/ })).toBeInTheDocument()
  })

  it('logs out via the avatar menu', async () => {
    // Like Better Auth: signOut resolves before the session store changes;
    // the store is cleared only by the following session refetch.
    vi.mocked(signOut).mockResolvedValue({ data: { success: true }, error: null } as never)
    vi.mocked(refreshSession).mockImplementation(async () => mockSession(null))
    mockSession({})
    renderRoute('/tickets')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Menu użytkownika' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Wyloguj' }))
    expect(await screen.findByRole('button', { name: 'Zaloguj się' })).toBeInTheDocument()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(refreshSession).toHaveBeenCalledTimes(1)
  })

  it('opens the mobile drawer with navigation', async () => {
    mockSession({})
    renderRoute('/tickets')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Otwórz menu' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('link', { name: /Baza wiedzy/ })).toBeInTheDocument()
  })

  it('closes the drawer after choosing a link', async () => {
    mockSession({})
    renderRoute('/tickets')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Otwórz menu' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('link', { name: /Baza wiedzy/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Baza wiedzy' })).toBeInTheDocument()
  })

  it('marks the current page link as active', () => {
    mockSession({})
    renderRoute('/tickets/mine')
    expect(screen.getByRole('link', { name: /Moje/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Tickety/ })).not.toHaveAttribute('aria-current')
  })
})
