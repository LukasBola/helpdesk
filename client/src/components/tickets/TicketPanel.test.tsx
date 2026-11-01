import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import type { AppUser, TicketAiResult, TicketDetail, TicketListItem } from '@/lib/tickets-api'
import { mockSession, renderRoute } from '@/test/render'

vi.mock('@/lib/auth-client', async () => (await import('@/test/auth-client-mock')).authClientMock())
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }))

const get = vi.mocked(api.get)
const patch = vi.mocked(api.patch)
const post = vi.mocked(api.post)

const users: AppUser[] = [
  { id: 'u1', name: 'Anna Kowalska', email: 'a@x.pl', role: 'AGENT', isBlocked: false },
  { id: 'u2', name: 'Tomasz Nowak', email: 't@x.pl', role: 'AGENT', isBlocked: false },
  { id: 'u3', name: 'Zablokowany Zenon', email: 'z@x.pl', role: 'AGENT', isBlocked: true },
]

function detail(over: Partial<TicketDetail> = {}): TicketDetail {
  return {
    id: 't1',
    subject: 'Faktura nie dotarła',
    status: 'OPEN',
    priority: 'HIGH',
    customerEmail: 'jan@x.pl',
    customerName: 'Jan Klient',
    createdAt: '2026-10-30T09:00:00.000Z',
    updatedAt: '2026-10-30T09:00:00.000Z',
    assigneeId: null,
    assignee: null,
    body: 'Proszę o fakturę',
    history: [],
    replies: [],
    aiResult: null,
    ...over,
  }
}

function ai(over: Partial<TicketAiResult> = {}): TicketAiResult {
  return {
    ticketId: 't1',
    state: 'READY',
    error: null,
    suggestedPriority: 'HIGH',
    customerLanguage: 'pl',
    draft: 'Dziękujemy za zgłoszenie.',
    summaryPl: 'Klient nie dostał faktury.',
    summaryEn: 'Customer did not get the invoice.',
    draftTranslationPl: null,
    draftTranslationEn: 'Thank you for your report.',
    completedAt: '2026-10-30T09:01:00.000Z',
    updatedAt: '2026-10-30T09:01:00.000Z',
    ...over,
  }
}

let current: TicketDetail | 'missing' | 'fail'
let listTickets: TicketListItem[]

function setup() {
  get.mockImplementation((async (url: string) => {
    if (url === '/users') return { data: { users } }
    if (url === '/tickets')
      return { data: { tickets: listTickets, total: listTickets.length, page: 1, limit: 25 } }
    if (url === '/tickets/t2')
      return { data: detail({ id: 't2', subject: 'Drugi temat', body: 'Druga' }) }
    if (url === '/tickets/t1') {
      if (current === 'fail')
        throw new AxiosError('boom', 'ERR', undefined, undefined, { status: 500 } as never)
      if (current === 'missing')
        throw new AxiosError('nf', 'ERR', undefined, undefined, { status: 404 } as never)
      return { data: current }
    }
    throw new Error(`unexpected ${url}`)
  }) as never)
}

// The list filters share the labels "Status" and "Priorytet", so scope to the panel.
async function inPanel(role: 'combobox', name: string) {
  const panel = await screen.findByRole('region', { name: 'Faktura nie dotarła' })
  return within(panel).getByRole(role, { name })
}

describe('TicketPanel', () => {
  beforeEach(() => {
    get.mockReset()
    patch.mockReset()
    post.mockReset()
    mockSession({})
    current = detail()
    listTickets = [{ ...detail(), subject: 'Faktura nie dotarła' } as TicketListItem]
    setup()
  })

  it('shows the header, customer message and controls', async () => {
    renderRoute('/tickets/t1')
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Faktura nie dotarła' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Jan Klient <jan@x.pl>')).toBeInTheDocument()
    expect(screen.getByText('Proszę o fakturę')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Przypisany do' })).toHaveTextContent(
      'Nieprzypisany',
    )
  })

  it('shows "Nie znaleziono ticketu" for a 404 while the list still renders', async () => {
    current = 'missing'
    renderRoute('/tickets/t1')
    expect(await screen.findByText('Nie znaleziono ticketu')).toBeInTheDocument()
    expect(await screen.findAllByText('Faktura nie dotarła')).not.toHaveLength(0)
  })

  it('shows an error with retry for other failures', async () => {
    get.mockImplementation((async (url: string) => {
      if (url === '/users') return { data: { users } }
      if (url === '/tickets') return { data: { tickets: [], total: 0, page: 1, limit: 25 } }
      throw new Error('boom')
    }) as never)
    renderRoute('/tickets/t1')
    expect(await screen.findByText('Nie udało się wczytać ticketu.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument()
  })

  it('keeps the ticket open after a reply drops it out of the OPEN list', async () => {
    const user = userEvent.setup()
    renderRoute('/tickets/t1')
    await user.type(await screen.findByRole('textbox', { name: 'Odpowiedź' }), 'Wysyłam')
    // After the reply the server moves the ticket to IN_PROGRESS: the OPEN list no longer has it.
    post.mockImplementation((async () => {
      current = detail({
        status: 'IN_PROGRESS',
        replies: [
          {
            id: 'r1',
            body: 'Wysyłam',
            sentAt: '2026-10-30T10:42:00.000Z',
            user: { id: 'u1', name: 'Anna Kowalska' },
          },
        ],
        history: [
          {
            id: 'h1',
            field: 'status',
            oldValue: 'OPEN',
            newValue: 'IN_PROGRESS',
            createdAt: '2026-10-30T10:42:00.000Z',
            user: { id: 'u1', name: 'Anna Kowalska' },
          },
        ],
      })
      listTickets = []
      return { data: {} }
    }) as never)
    await user.click(screen.getByRole('button', { name: 'Wyślij' }))
    expect(await screen.findByText('Anna Kowalska · Status: Otwarty → W toku')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Faktura nie dotarła' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Odpowiedź' })).toHaveValue('')
    // Reply bubble comes before the status line.
    const reply = screen.getByText('Wysyłam', { selector: 'p' })
    const line = screen.getByText('Anna Kowalska · Status: Otwarty → W toku')
    expect(reply.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('changing status sends PATCH with only { status }', async () => {
    patch.mockResolvedValue({ data: {} } as never)
    const user = userEvent.setup()
    renderRoute('/tickets/t1')
    await user.click(await inPanel('combobox', 'Status'))
    await user.click(await screen.findByRole('option', { name: 'Rozwiązany' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/tickets/t1', { status: 'RESOLVED' }))
  })

  it('keeps the panel and the reply draft when a background refetch fails', async () => {
    patch.mockResolvedValue({ data: {} } as never)
    const user = userEvent.setup()
    renderRoute('/tickets/t1')
    const panel = await screen.findByRole('region', { name: 'Faktura nie dotarła' })
    await user.type(within(panel).getByRole('textbox', { name: 'Odpowiedź' }), 'Szkic')
    current = 'fail'
    await user.click(await inPanel('combobox', 'Status'))
    await user.click(await screen.findByRole('option', { name: 'Rozwiązany' }))
    await waitFor(() => expect(patch).toHaveBeenCalled())
    await waitFor(() =>
      expect(get.mock.calls.filter(([url]) => url === '/tickets/t1').length).toBeGreaterThan(1),
    )
    expect(await screen.findByText('Nie udało się odświeżyć ticketu.')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Faktura nie dotarła' })).getByRole('textbox', {
        name: 'Odpowiedź',
      }),
    ).toHaveValue('Szkic')
  })

  it('unassigning sends assigneeId null', async () => {
    current = detail({
      assigneeId: 'u2',
      assignee: { id: 'u2', name: 'Tomasz Nowak', email: 't@x.pl' },
    })
    patch.mockResolvedValue({ data: {} } as never)
    const user = userEvent.setup()
    renderRoute('/tickets/t1')
    await user.click(await inPanel('combobox', 'Przypisany do'))
    await user.click(await screen.findByRole('option', { name: 'Nieprzypisany' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/tickets/t1', { assigneeId: null }))
  })

  it('offers a blocked agent only while currently assigned', async () => {
    const user = userEvent.setup()
    renderRoute('/tickets/t1')
    await user.click(await inPanel('combobox', 'Przypisany do'))
    const list = await screen.findByRole('listbox')
    expect(within(list).getByRole('option', { name: 'Tomasz Nowak' })).toBeInTheDocument()
    expect(within(list).queryByRole('option', { name: 'Zablokowany Zenon' })).toBeNull()
  })

  it('shows an inline error when the update fails', async () => {
    patch.mockRejectedValue(
      new AxiosError('x', 'ERR', undefined, undefined, { status: 422 } as never),
    )
    const user = userEvent.setup()
    renderRoute('/tickets/t1')
    await user.click(await inPanel('combobox', 'Priorytet'))
    await user.click(await screen.findByRole('option', { name: 'Pilny' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nieprawidłowe dane')
  })

  it('renders HTML in a message as text', async () => {
    current = detail({ body: '<b>x</b>' })
    renderRoute('/tickets/t1')
    const el = await screen.findByText('<b>x</b>')
    expect(el.querySelector('b')).toBeNull()
    expect(el).toHaveClass('whitespace-pre-wrap')
  })

  it('resets the reply box when switching to another (cached) ticket', async () => {
    listTickets = [
      { ...detail(), subject: 'Faktura nie dotarła' } as TicketListItem,
      { ...detail({ id: 't2', subject: 'Drugi temat' }) } as TicketListItem,
    ]
    const user = userEvent.setup()
    renderRoute('/tickets/t2')
    await screen.findByRole('region', { name: 'Drugi temat' })
    await user.click(await screen.findByRole('link', { name: /Faktura nie dotarła/ }))
    await user.type(await screen.findByRole('textbox', { name: 'Odpowiedź' }), 'szkic dla t1')
    await user.click(screen.getByRole('link', { name: /Drugi temat/ }))
    await screen.findByRole('region', { name: 'Drugi temat' })
    expect(screen.getByRole('textbox', { name: 'Odpowiedź' })).toHaveValue('')
  })

  describe('AI', () => {
    it("shows the summary in the agent's AI language", async () => {
      current = detail({ aiResult: ai() })
      mockSession({ aiLocale: 'en' })
      renderRoute('/tickets/t1')
      expect(await screen.findByText('Customer did not get the invoice.')).toBeInTheDocument()
      expect(screen.queryByText('Klient nie dostał faktury.')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Wygeneruj ponownie' })).toBeEnabled()
    })

    it('offers analysis when there is no AI result and requests it', async () => {
      post.mockResolvedValue({ data: {} } as never)
      const user = userEvent.setup()
      renderRoute('/tickets/t1')
      await user.click(await screen.findByRole('button', { name: 'Analizuj' }))
      await waitFor(() => expect(post).toHaveBeenCalledWith('/tickets/t1/ai'))
    })

    it('shows the API error when the request fails', async () => {
      post.mockRejectedValue(
        new AxiosError('x', 'ERR', undefined, undefined, { status: 429 } as never),
      )
      const user = userEvent.setup()
      renderRoute('/tickets/t1')
      await user.click(await screen.findByRole('button', { name: 'Analizuj' }))
      expect(await screen.findByText('Coś poszło nie tak. Spróbuj ponownie.')).toBeInTheDocument()
    })

    it('shows "AI analizuje…" while pending without results', async () => {
      current = detail({
        aiResult: ai({
          state: 'PENDING',
          completedAt: null,
          summaryPl: null,
          updatedAt: new Date().toISOString(),
        }),
      })
      renderRoute('/tickets/t1')
      expect(await screen.findByText('AI analizuje…')).toBeInTheDocument()
    })

    it('offers retry for a stale PENDING without results and POSTs', async () => {
      current = detail({
        aiResult: ai({
          state: 'PENDING',
          completedAt: null,
          summaryPl: null,
          updatedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        }),
      })
      post.mockResolvedValue({ data: {} } as never)
      const user = userEvent.setup()
      renderRoute('/tickets/t1')
      await user.click(await screen.findByRole('button', { name: 'Spróbuj ponownie' }))
      await waitFor(() => expect(post).toHaveBeenCalledWith('/tickets/t1/ai'))
    })

    it('offers no retry for a fresh PENDING without results', async () => {
      current = detail({
        aiResult: ai({
          state: 'PENDING',
          completedAt: null,
          summaryPl: null,
          updatedAt: new Date().toISOString(),
        }),
      })
      renderRoute('/tickets/t1')
      await screen.findByText('AI analizuje…')
      expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).not.toBeInTheDocument()
    })

    it('enables regenerate for a stale PENDING with results', async () => {
      current = detail({
        aiResult: ai({
          state: 'PENDING',
          updatedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        }),
      })
      renderRoute('/tickets/t1')
      expect(await screen.findByRole('button', { name: 'Wygeneruj ponownie' })).toBeEnabled()
    })

    it('shows the failure reason to the agent', async () => {
      current = detail({
        aiResult: ai({
          state: 'FAILED',
          completedAt: null,
          summaryPl: null,
          error: 'Ollama timeout',
        }),
      })
      renderRoute('/tickets/t1')
      expect(await screen.findByText('Ollama timeout')).toBeInTheDocument()
    })

    it('falls back to analysis when READY has no results', async () => {
      current = detail({ aiResult: ai({ state: 'READY', completedAt: null, summaryPl: null }) })
      renderRoute('/tickets/t1')
      expect(await screen.findByRole('button', { name: 'Analizuj' })).toBeInTheDocument()
      expect(screen.queryByText('AI analizuje…')).not.toBeInTheDocument()
    })

    it('never requests AI without a click', async () => {
      renderRoute('/tickets/t1')
      await screen.findByRole('button', { name: 'Analizuj' })
      expect(post).not.toHaveBeenCalled()
    })

    it('shows "AI niedostępne" with retry when failed', async () => {
      current = detail({ aiResult: ai({ state: 'FAILED', completedAt: null, summaryPl: null }) })
      renderRoute('/tickets/t1')
      const alert = await screen.findByText('AI niedostępne')
      expect(alert).toBeInTheDocument()
      expect(
        within(alert.closest('[role="alert"]') as HTMLElement).getByRole('button', {
          name: 'Spróbuj ponownie',
        }),
      ).toBeInTheDocument()
    })

    it('keeps old results visible while regenerating', async () => {
      current = detail({ aiResult: ai({ state: 'PENDING', updatedAt: new Date().toISOString() }) })
      renderRoute('/tickets/t1')
      expect(await screen.findByText('Klient nie dostał faktury.')).toBeInTheDocument()
      expect(screen.getByText('Generuję nową wersję…')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Wygeneruj ponownie' })).toBeDisabled()
    })

    it('says so when regenerating failed but keeps the old results', async () => {
      current = detail({ aiResult: ai({ state: 'FAILED' }) })
      renderRoute('/tickets/t1')
      expect(await screen.findByText('Klient nie dostał faktury.')).toBeInTheDocument()
      expect(screen.getByText('Nie udało się wygenerować ponownie')).toBeInTheDocument()
    })

    it('shows the priority suggestion only when it differs and applies it via PATCH', async () => {
      current = detail({ priority: 'HIGH', aiResult: ai({ suggestedPriority: 'URGENT' }) })
      patch.mockResolvedValue({ data: {} } as never)
      const user = userEvent.setup()
      renderRoute('/tickets/t1')
      expect(await screen.findByText('AI proponuje: Pilny')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Zastosuj' }))
      await waitFor(() => expect(patch).toHaveBeenCalledWith('/tickets/t1', { priority: 'URGENT' }))
    })

    it('hides the priority suggestion when it equals the current priority', async () => {
      current = detail({ priority: 'HIGH', aiResult: ai({ suggestedPriority: 'HIGH' }) })
      renderRoute('/tickets/t1')
      await screen.findByText('Klient nie dostał faktury.')
      expect(screen.queryByRole('button', { name: 'Zastosuj' })).not.toBeInTheDocument()
    })

    it('shows the draft above an empty reply form', async () => {
      current = detail({ aiResult: ai() })
      renderRoute('/tickets/t1')
      expect(await screen.findByText('Dziękujemy za zgłoszenie.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Użyj szkicu' })).toBeInTheDocument()
    })

    it('hides the draft once the ticket has a reply', async () => {
      current = detail({
        aiResult: ai(),
        replies: [
          {
            id: 'r1',
            body: 'Wysyłam',
            sentAt: '2026-10-30T10:42:00.000Z',
            user: { id: 'u1', name: 'Anna Kowalska' },
          },
        ],
      })
      renderRoute('/tickets/t1')
      await screen.findByText('Klient nie dostał faktury.')
      expect(screen.queryByText('Dziękujemy za zgłoszenie.')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Użyj szkicu' })).not.toBeInTheDocument()
    })

    it('hides the translation when the customer writes in the agent AI language', async () => {
      current = detail({
        aiResult: ai({ customerLanguage: 'pl', draftTranslationPl: 'Dzięki.' }),
      })
      mockSession({ aiLocale: 'pl' })
      renderRoute('/tickets/t1')
      await screen.findByText('Dziękujemy za zgłoszenie.')
      expect(screen.queryByText('Dzięki.')).not.toBeInTheDocument()
      expect(screen.queryByText('Tłumaczenie')).not.toBeInTheDocument()
    })

    it('shows the translation when the customer writes in another language', async () => {
      current = detail({
        aiResult: ai({ customerLanguage: 'en', draft: 'Thanks.', draftTranslationPl: 'Dzięki.' }),
      })
      mockSession({ aiLocale: 'pl' })
      renderRoute('/tickets/t1')
      expect(await screen.findByText('Tłumaczenie')).toBeInTheDocument()
      expect(screen.getByText('Dzięki.')).toBeInTheDocument()
    })
  })
})
