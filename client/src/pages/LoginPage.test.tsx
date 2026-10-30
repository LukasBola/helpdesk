import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signIn } from '@/lib/auth-client'
import { mockSession, renderRoute } from '@/test/render'

vi.mock('@/lib/auth-client', () => ({
  useSession: vi.fn(),
  signIn: { email: vi.fn() },
  signOut: vi.fn(),
  refreshSession: vi.fn(),
}))

const signInEmail = vi.mocked(signIn.email)

async function submit(email = 'anna@firma.pl', password = 'password123') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('E-mail'), email)
  await user.type(screen.getByLabelText('Hasło'), password)
  await user.click(screen.getByRole('button', { name: 'Zaloguj się' }))
}

function failWith(status: number) {
  signInEmail.mockResolvedValue({
    data: null,
    error: { status, message: 'x', statusText: 'x' },
  } as never)
}

// After a successful sign-in the session store updates; emulate that.
function succeed() {
  signInEmail.mockImplementation((async () => {
    mockSession({})
    return { data: {}, error: null }
  }) as never)
}

describe('LoginPage', () => {
  beforeEach(() => {
    signInEmail.mockReset()
    mockSession(null)
  })

  it('calls signIn.email with the typed credentials', async () => {
    failWith(401)
    renderRoute('/login')
    await submit()
    expect(signInEmail).toHaveBeenCalledWith({ email: 'anna@firma.pl', password: 'password123' })
  })

  it('shows the credential error on 401', async () => {
    failWith(401)
    renderRoute('/login')
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Nieprawidłowy e-mail lub hasło')
  })

  it('shows the rate-limit error on 429', async () => {
    failWith(429)
    renderRoute('/login')
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Za dużo prób. Spróbuj za chwilę.')
  })

  it('shows a generic error when the request throws', async () => {
    signInEmail.mockRejectedValue(new Error('network'))
    renderRoute('/login')
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Coś poszło nie tak. Spróbuj ponownie.',
    )
  })

  it('disables the button while submitting', async () => {
    signInEmail.mockReturnValue(new Promise(() => undefined) as never)
    renderRoute('/login')
    await submit()
    expect(screen.getByRole('button', { name: /Zaloguj/ })).toBeDisabled()
  })

  it('navigates to the saved `from` after success', async () => {
    succeed()
    renderRoute('/login', { state: { from: '/knowledge-base' } })
    await submit()
    expect(await screen.findByRole('heading', { name: 'Baza wiedzy' })).toBeInTheDocument()
  })

  it('navigates to the saved `from` when the session arrives after sign-in', async () => {
    signInEmail.mockResolvedValue({ data: {}, error: null } as never)
    renderRoute('/login', { state: { from: '/knowledge-base' } })
    await submit()
    mockSession({})
    expect(await screen.findByRole('heading', { name: 'Baza wiedzy' })).toBeInTheDocument()
  })

  it('ignores an unsafe `from`', async () => {
    succeed()
    renderRoute('/login', { state: { from: '//evil.com' } })
    await submit()
    expect(await screen.findByRole('heading', { name: 'Tickety' })).toBeInTheDocument()
  })

  it('redirects an active user away from /login', () => {
    mockSession({})
    renderRoute('/login')
    expect(screen.getByRole('heading', { name: 'Tickety' })).toBeInTheDocument()
  })

  it('does not redirect a blocked user', () => {
    mockSession({ isBlocked: true })
    renderRoute('/login')
    expect(screen.getByRole('button', { name: 'Zaloguj się' })).toBeInTheDocument()
  })
})
