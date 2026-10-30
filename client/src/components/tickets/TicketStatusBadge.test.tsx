import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import i18n from '@/i18n'

import { TicketStatusBadge } from './TicketStatusBadge'

describe('TicketStatusBadge', () => {
  it('shows the translated status label', async () => {
    render(<TicketStatusBadge status="IN_PROGRESS" />)
    expect(screen.getByText('W toku')).toBeInTheDocument()
    await act(() => i18n.changeLanguage('en'))
    expect(screen.getByText('In progress')).toBeInTheDocument()
  })

  it('uses the status token colors', () => {
    render(<TicketStatusBadge status="RESOLVED" />)
    const badge = screen.getByText('Rozwiązany')
    expect(badge).toHaveClass('bg-status-resolved', 'text-status-resolved-fg')
  })
})
