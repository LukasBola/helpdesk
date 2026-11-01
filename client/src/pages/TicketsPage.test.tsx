import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import type { AppUser, TicketListItem } from '@/lib/tickets-api'
import { mockSession, renderRoute } from '@/test/render'

vi.mock('@/lib/auth-client', async () => (await import('@/test/auth-client-mock')).authClientMock())
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))

const get = vi.mocked(api.get)

function ticket(n: number, over: Partial<TicketListItem> = {}): TicketListItem {
  return {
    id: `t${n}`,
    subject: `Temat ${n}`,
    status: 'OPEN',
    priority: 'URGENT',
    customerEmail: `k${n}@x.pl`,
    customerName: n === 1 ? 'Jan Klient' : null,
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    updatedAt: new Date().toISOString(),
    assigneeId: null,
    assignee: null,
    ...over,
  }
}

const users: AppUser[] = [
  { id: 'u1', name: 'Anna Kowalska', email: 'a@x.pl', role: 'AGENT', isBlocked: false },
  { id: 'u2', name: 'Tomasz Nowak', email: 't@x.pl', role: 'AGENT', isBlocked: false },
  { id: 'u3', name: 'Zablokowany Zenon', email: 'z@x.pl', role: 'AGENT', isBlocked: true },
]

function respond(pages: { tickets: TicketListItem[]; total: number }[] | 'error') {
  get.mockImplementation((async (url: string, config?: { params?: { page?: number } }) => {
    if (url === '/users') return { data: { users } }
    if (url === '/tickets') {
      if (pages === 'error') throw new Error('boom')
      const page = config?.params?.page ?? 1
      const p = pages[page - 1]
      return { data: { ...p, page, limit: 25 } }
    }
    throw new Error(`unexpected ${url}`)
  }) as never)
}

describe('TicketsPage', () => {
  beforeEach(() => {
    get.mockReset()
    mockSession({})
    respond([{ tickets: [ticket(1), ticket(2)], total: 30 }])
  })

  it('requests open tickets oldest first by default', async () => {
    renderRoute('/tickets')
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/tickets', {
        params: expect.objectContaining({
          status: 'OPEN',
          orderBy: 'createdAt',
          order: 'asc',
          page: 1,
        }),
      }),
    )
    expect(await screen.findByText('Temat 1')).toBeInTheDocument()
    expect(screen.getByText('Jan Klient')).toBeInTheDocument()
    expect(screen.getByText('k2@x.pl')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Tickety' })).toBeInTheDocument()
  })

  it('on /tickets/mine filters by the current user', async () => {
    renderRoute('/tickets/mine')
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/tickets', {
        params: expect.objectContaining({ assigneeId: 'u1' }),
      }),
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Moje' })).toBeInTheDocument()
  })

  it('offers Unassigned and non-blocked agents in the assignee filter', async () => {
    const user = userEvent.setup()
    renderRoute('/tickets')
    await screen.findByText('Temat 1')
    await waitFor(() => expect(get).toHaveBeenCalledWith('/users'))
    await user.click(screen.getByRole('combobox', { name: 'Przypisanie' }))
    const list = await screen.findByRole('listbox')
    expect(within(list).getByRole('option', { name: 'Nieprzypisane' })).toBeInTheDocument()
    expect(within(list).getByRole('option', { name: 'Tomasz Nowak' })).toBeInTheDocument()
    expect(within(list).queryByRole('option', { name: 'Zablokowany Zenon' })).toBeNull()
  })

  it('shows a blocked agent selected via the URL as the current filter value', async () => {
    renderRoute('/tickets?assignee=u3')
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/tickets', {
        params: expect.objectContaining({ assigneeId: 'u3' }),
      }),
    )
    const trigger = screen.getByRole('combobox', { name: 'Przypisanie' })
    await waitFor(() => expect(trigger).toHaveTextContent('Zablokowany Zenon'))
  })

  it('back link from a ticket opened in Moje returns to /tickets/mine', async () => {
    renderRoute('/tickets/t1?assignee=me')
    const back = await screen.findByRole('link', { name: 'Wróć do listy' })
    expect(back).toHaveAttribute('href', '/tickets/mine')
  })

  it('keeps filters in the URL when a ticket is opened', async () => {
    const user = userEvent.setup()
    renderRoute('/tickets?priority=URGENT')
    const row = await screen.findByRole('link', { name: /Temat 1/ })
    expect(row).toHaveAttribute('href', '/tickets/t1?priority=URGENT')
    await user.click(row)
    expect(await screen.findByRole('link', { name: 'Wróć do listy' })).toHaveAttribute(
      'href',
      '/tickets?priority=URGENT',
    )
    expect(screen.getByRole('link', { name: /Temat 1/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: /Temat 2/ })).not.toHaveAttribute('aria-current')
  })

  it('changing a filter updates the query string and refetches', async () => {
    const user = userEvent.setup()
    renderRoute('/tickets')
    await screen.findByText('Temat 1')
    await user.click(screen.getByRole('combobox', { name: 'Priorytet' }))
    await user.click(await screen.findByRole('option', { name: 'Pilny' }))
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/tickets', {
        params: expect.objectContaining({ priority: 'URGENT' }),
      }),
    )
    expect(screen.getByRole('link', { name: /Temat 1/ })).toHaveAttribute(
      'href',
      '/tickets/t1?priority=URGENT',
    )
  })

  it('debounces search into the URL', async () => {
    const user = userEvent.setup()
    renderRoute('/tickets')
    await screen.findByText('Temat 1')
    await user.type(screen.getByRole('searchbox'), 'faktura')
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/tickets', {
        params: expect.objectContaining({ search: 'faktura' }),
      }),
    )
    const searchCalls = get.mock.calls.filter(
      ([u, c]) => u === '/tickets' && (c as { params: { search?: string } }).params.search,
    )
    expect(
      searchCalls.every(
        ([, c]) => (c as never as { params: { search: string } }).params.search === 'faktura',
      ),
    ).toBe(true)
  })

  it('keeps text typed across a debounce boundary', async () => {
    const user = userEvent.setup()
    renderRoute('/tickets')
    await screen.findByText('Temat 1')
    const box = screen.getByRole('searchbox')
    await user.type(box, 'fak')
    await new Promise(r => setTimeout(r, 350))
    await user.type(box, 'tura')
    expect(box).toHaveValue('faktura')
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/tickets', {
        params: expect.objectContaining({ search: 'faktura' }),
      }),
    )
    expect(box).toHaveValue('faktura')
  })

  it('resets the search box when the URL search changes externally (clear filters)', async () => {
    respond([{ tickets: [], total: 0 }])
    const user = userEvent.setup()
    renderRoute('/tickets?search=abc')
    expect(screen.getByRole('searchbox')).toHaveValue('abc')
    await user.click(await screen.findByRole('button', { name: 'Wyczyść filtry' }))
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''))
  })

  it('clear filters keeps the open ticket path', async () => {
    respond([{ tickets: [], total: 0 }])
    const user = userEvent.setup()
    renderRoute('/tickets/t1?priority=URGENT')
    await user.click(await screen.findByRole('button', { name: 'Wyczyść filtry' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/tickets', {
        params: expect.not.objectContaining({ priority: expect.anything() }),
      }),
    )
    expect(screen.getByRole('link', { name: 'Wróć do listy' })).toHaveAttribute('href', '/tickets')
  })

  it('shows the status of each ticket in the list', async () => {
    respond([{ tickets: [ticket(1, { status: 'IN_PROGRESS' }), ticket(2)], total: 2 }])
    renderRoute('/tickets?status=all')
    const row = await screen.findByRole('link', { name: /Temat 1/ })
    expect(within(row).getByText('W toku')).toBeInTheDocument()
    expect(
      within(screen.getByRole('link', { name: /Temat 2/ })).getByText('Otwarty'),
    ).toBeInTheDocument()
  })

  it('keeps the previous list visible while a new filter loads', async () => {
    const user = userEvent.setup()
    renderRoute('/tickets')
    await screen.findByText('Temat 1')
    get.mockImplementation((async (url: string) => {
      if (url === '/users') return { data: { users } }
      return new Promise(() => undefined)
    }) as never)
    await user.click(screen.getByRole('combobox', { name: 'Priorytet' }))
    await user.click(await screen.findByRole('option', { name: 'Pilny' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/tickets', {
        params: expect.objectContaining({ priority: 'URGENT' }),
      }),
    )
    expect(screen.getByText('Temat 1')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps the loaded list and shows an inline retry when "Pokaż więcej" fails', async () => {
    let failNext = true
    get.mockImplementation((async (url: string, config?: { params?: { page?: number } }) => {
      if (url === '/users') return { data: { users } }
      const page = config?.params?.page ?? 1
      if (page === 2 && failNext) throw new Error('boom')
      return {
        data: { tickets: [ticket(page)], total: 30, page, limit: 25 },
      }
    }) as never)
    const user = userEvent.setup()
    renderRoute('/tickets')
    await screen.findByText('Temat 1')
    await user.click(screen.getByRole('button', { name: 'Pokaż więcej' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Nie udało się wczytać ticketów.')
    expect(screen.getByText('Temat 1')).toBeInTheDocument()
    failNext = false
    await user.click(within(alert).getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(await screen.findByText('Temat 2')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows "Pokaż więcej" only while more pages exist and appends the next page', async () => {
    respond([
      { tickets: [ticket(1)], total: 30 },
      { tickets: [ticket(2)], total: 30 },
    ])
    const user = userEvent.setup()
    renderRoute('/tickets')
    await screen.findByText('Temat 1')
    await user.click(screen.getByRole('button', { name: 'Pokaż więcej' }))
    expect(await screen.findByText('Temat 2')).toBeInTheDocument()
    expect(screen.getByText('Temat 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pokaż więcej' })).toBeNull()
  })

  it('shows the empty state with a clear-filters action', async () => {
    respond([{ tickets: [], total: 0 }])
    const user = userEvent.setup()
    renderRoute('/tickets?priority=URGENT')
    expect(await screen.findByText('Brak ticketów dla tych filtrów')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Wyczyść filtry' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/tickets', {
        params: expect.not.objectContaining({ priority: expect.anything() }),
      }),
    )
  })

  it('shows a retry button when the list fails to load', async () => {
    respond('error')
    const user = userEvent.setup()
    renderRoute('/tickets')
    const retry = await screen.findByRole('button', { name: 'Spróbuj ponownie' })
    respond([{ tickets: [ticket(1)], total: 1 }])
    await user.click(retry)
    expect(await screen.findByText('Temat 1')).toBeInTheDocument()
  })

  it('highlights Tickety in the sidebar on /tickets/:id and Moje on /tickets/mine', async () => {
    const { unmount } = renderRoute('/tickets/t1')
    await screen.findByText('Temat 1')
    const [tickety] = screen.getAllByRole('link', { name: 'Tickety' })
    expect(tickety).toHaveAttribute('aria-current', 'page')
    unmount()
    renderRoute('/tickets/mine')
    await screen.findByText('Temat 1')
    expect(screen.getAllByRole('link', { name: 'Moje' })[0]).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('link', { name: 'Tickety' })[0]).not.toHaveAttribute('aria-current')
  })
})
