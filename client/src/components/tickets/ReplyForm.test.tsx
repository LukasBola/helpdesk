import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import type { TicketAiResult } from '@/lib/tickets-api'
import { mockSession } from '@/test/render'

import { ReplyForm } from './ReplyForm'

vi.mock('@/lib/auth-client', async () => (await import('@/test/auth-client-mock')).authClientMock())
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }))
const post = vi.mocked(api.post)

const aiDraft: TicketAiResult = {
  ticketId: 't1',
  state: 'READY',
  error: null,
  suggestedPriority: null,
  customerLanguage: 'pl',
  draft: 'Szkic AI do wysłania.',
  summaryPl: null,
  summaryEn: null,
  draftTranslationPl: null,
  draftTranslationEn: null,
  completedAt: '2026-10-30T09:01:00.000Z',
  updatedAt: '2026-10-30T09:01:00.000Z',
}

function setup(draft?: TicketAiResult) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ReplyForm ticketId="t1" aiDraft={draft} />
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
    vi.restoreAllMocks()
    mockSession({})
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

  it('keeps text typed while the reply is pending', async () => {
    let resolve!: (v: unknown) => void
    post.mockReturnValue(new Promise(r => (resolve = r)) as never)
    const user = userEvent.setup()
    const { box, send } = setup()
    await user.type(box, 'Pierwsza')
    await user.click(send)
    await waitFor(() => expect(send).toBeDisabled())
    await user.type(box, ' druga')
    resolve({ data: {} })
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(send).toBeEnabled())
    expect(box).toHaveValue('Pierwsza druga')
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

  it('"Użyj szkicu" fills an empty field', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()
    const { box } = setup(aiDraft)
    await user.click(screen.getByRole('button', { name: 'Użyj szkicu' }))
    expect(box).toHaveValue('Szkic AI do wysłania.')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('asks before replacing typed text', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    const { box } = setup(aiDraft)
    await user.type(box, 'Moje')
    await user.click(screen.getByRole('button', { name: 'Użyj szkicu' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(box).toHaveValue('Moje')
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Użyj szkicu' }))
    expect(box).toHaveValue('Szkic AI do wysłania.')
  })
})
