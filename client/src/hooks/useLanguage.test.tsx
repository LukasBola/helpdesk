import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'
import { updateUser } from '@/lib/auth-client'
import { mockSession, renderRoute } from '@/test/render'

vi.mock('@/lib/auth-client', async () => (await import('@/test/auth-client-mock')).authClientMock())
// The tickets page behind /tickets fetches on mount; answer with empty data.
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async () => ({ data: { tickets: [], users: [], total: 0, page: 1, limit: 25 } })),
  },
}))

async function openUserMenu(user: ReturnType<typeof userEvent.setup>) {
  // The accessible name follows the UI language.
  const name = i18n.language === 'en' ? 'User menu' : 'Menu użytkownika'
  await user.click(screen.getByRole('button', { name }))
}

describe('language sync with the account', () => {
  beforeEach(() => {
    vi.mocked(updateUser).mockReset()
  })

  it('applies the account language when the session arrives', async () => {
    mockSession({ locale: 'en' })
    renderRoute('/tickets')
    expect(await screen.findByText('Good morning,')).toBeInTheDocument()
  })

  it('keeps the browser language when the account has no locale', async () => {
    await i18n.changeLanguage('en')
    mockSession({ locale: null })
    renderRoute('/tickets')
    expect(await screen.findByText('Good morning,')).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('treats an undefined locale like no account language', async () => {
    await i18n.changeLanguage('en')
    mockSession({ locale: undefined })
    renderRoute('/tickets')
    expect(await screen.findByText('Good morning,')).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('switching in the user menu saves to the account and does not revert while the save is pending', async () => {
    let resolve!: () => void
    vi.mocked(updateUser).mockReturnValue(
      new Promise(r => {
        resolve = () => r({ data: {}, error: null })
      }) as never,
    )
    mockSession({ locale: 'pl' })
    renderRoute('/tickets')
    const user = userEvent.setup()
    await openUserMenu(user)
    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(updateUser).toHaveBeenCalledWith({ locale: 'en' })
    expect(screen.getByText('Good morning,')).toBeInTheDocument() // still EN with session.locale === 'pl'
    resolve()
  })

  it('shows an error but keeps the new language when saving fails', async () => {
    vi.mocked(updateUser).mockRejectedValue(new Error('network'))
    mockSession({ locale: 'pl' })
    renderRoute('/tickets')
    const user = userEvent.setup()
    await openUserMenu(user)
    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save your language to your account.',
    )
    expect(screen.getByText('Good morning,')).toBeInTheDocument()
  })

  it('treats an error result from updateUser as a failure too', async () => {
    vi.mocked(updateUser).mockResolvedValue({
      data: null,
      error: { status: 500, message: 'x', statusText: 'x' },
    } as never)
    mockSession({ locale: 'pl' })
    renderRoute('/tickets')
    const user = userEvent.setup()
    await openUserMenu(user)
    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
