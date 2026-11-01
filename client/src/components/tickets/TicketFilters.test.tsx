import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { TicketFilters as Filters } from '@/lib/ticket-filters'

import { TicketFilters } from './TicketFilters'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(async () => ({ data: { users: [] } })), patch: vi.fn(), post: vi.fn() },
}))

const base: Filters = {
  status: 'OPEN',
  priority: null,
  assignee: 'all',
  search: '',
  sort: 'oldest',
}

function ui(filters: Filters, onChange: (f: Filters) => void) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <TicketFilters filters={filters} onChange={onChange} />
    </QueryClientProvider>
  )
}

describe('TicketFilters search box', () => {
  it('is not overwritten by a late URL update of an earlier value', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(ui(base, onChange))
    const box = screen.getByRole('searchbox')
    await user.type(box, 'fak')
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ ...base, search: 'fak' }))
    await user.type(box, 'tura')
    // The transition-wrapped URL update for "fak" lands only now.
    rerender(ui({ ...base, search: 'fak' }, onChange))
    expect(box).toHaveValue('faktura')
  })

  it('follows an external change of the URL search', () => {
    const onChange = vi.fn()
    const { rerender } = render(ui({ ...base, search: 'abc' }, onChange))
    rerender(ui({ ...base, search: '' }, onChange))
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })
})
