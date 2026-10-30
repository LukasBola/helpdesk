import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { ReplyForm } from './ReplyForm'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }))
const post = vi.mocked(api.post)

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ReplyForm ticketId="t1" />
    </QueryClientProvider>,
  )
  return {
    box: screen.getByRole('textbox', { name: 'Odpowiedź' }),
    send: screen.getByRole('button', { name: 'Wyślij' }),
  }
}

describe('ReplyForm', () => {
  beforeEach(() => {
    post.mockReset()
  })

  it('disables send for whitespace and while pending; one POST per click', async () => {
    let resolve!: (v: unknown) => void
    post.mockReturnValue(new Promise(r => (resolve = r)) as never)
    const user = userEvent.setup()
    const { box, send } = setup()
    expect(send).toBeDisabled()
    await user.type(box, '   ')
    expect(send).toBeDisabled()
    await user.type(box, 'Cześć')
    expect(send).toBeEnabled()
    await user.click(send)
    await waitFor(() => expect(send).toBeDisabled())
    await user.click(send)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/tickets/t1/replies', { body: 'Cześć' })
    resolve({ data: {} })
    await waitFor(() => expect(box).toHaveValue(''))
  })

  it('Ctrl+Enter sends', async () => {
    post.mockResolvedValue({ data: {} } as never)
    const user = userEvent.setup()
    const { box } = setup()
    await user.type(box, 'Hej{Control>}{Enter}{/Control}')
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  })

  it('keeps the text and shows an error when the request fails', async () => {
    post.mockImplementation((async () => {
      throw new AxiosError('boom', 'ERR', undefined, undefined, { status: 500 } as never)
    }) as never)
    const user = userEvent.setup()
    const { box, send } = setup()
    await user.type(box, 'Ważne')
    await user.click(send)
    expect(await screen.findByRole('alert')).toHaveTextContent('Coś poszło nie tak')
    expect(box).toHaveValue('Ważne')
    expect(send).toBeEnabled()
  })

  it('shows the thread-only note', () => {
    setup()
    expect(screen.getByText(/klient nie dostanie maila/)).toBeInTheDocument()
  })
})
