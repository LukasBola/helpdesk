import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import type { TicketListItem } from '@/lib/tickets-api'

import { useCreateReply, useTicket, useTicketList } from './useTickets'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

const get = vi.mocked(api.get)
const post = vi.mocked(api.post)

function ticket(id: string): TicketListItem {
  return {
    id,
    subject: id,
    status: 'OPEN',
    priority: 'LOW',
    customerEmail: 'a@b.pl',
    customerName: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assigneeId: null,
    assignee: null,
  }
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

beforeEach(() => vi.resetAllMocks())

describe('useTicketList', () => {
  it('requests the next page only while page * limit < total', async () => {
    get
      .mockResolvedValueOnce({ data: { tickets: [ticket('a')], total: 2, page: 1, limit: 1 } })
      .mockResolvedValueOnce({ data: { tickets: [ticket('b')], total: 2, page: 2, limit: 1 } })
    const { wrapper } = setup()
    const { result } = renderHook(() => useTicketList({ status: 'OPEN' }), { wrapper })
    await waitFor(() => expect(result.current.tickets).toHaveLength(1))
    expect(get).toHaveBeenCalledWith('/tickets', {
      params: { status: 'OPEN', page: 1, limit: 25 },
    })
    expect(result.current.hasNextPage).toBe(true)
    await act(() => result.current.fetchNextPage())
    await waitFor(() => expect(result.current.tickets).toHaveLength(2))
    expect(result.current.hasNextPage).toBe(false)
  })

  it('drops a ticket repeated on the next page', async () => {
    get
      .mockResolvedValueOnce({
        data: { tickets: [ticket('a'), ticket('b')], total: 4, page: 1, limit: 2 },
      })
      .mockResolvedValueOnce({
        data: { tickets: [ticket('b'), ticket('c')], total: 4, page: 2, limit: 2 },
      })
    const { wrapper } = setup()
    const { result } = renderHook(() => useTicketList({}), { wrapper })
    await waitFor(() => expect(result.current.tickets).toHaveLength(2))
    await act(() => result.current.fetchNextPage())
    await waitFor(() => expect(result.current.tickets.map(t => t.id)).toEqual(['a', 'b', 'c']))
  })
})

describe('useTicket', () => {
  it('is disabled without an id', () => {
    const { wrapper } = setup()
    renderHook(() => useTicket(undefined), { wrapper })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('useCreateReply', () => {
  it('invalidates the list and detail after a reply', async () => {
    post.mockResolvedValue({ data: { id: 'r1' } })
    const { client, wrapper } = setup()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateReply('t1'), { wrapper })
    await act(() => result.current.mutateAsync('hello'))
    expect(post).toHaveBeenCalledWith('/tickets/t1/replies', { body: 'hello' })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['tickets'] })
  })
})
