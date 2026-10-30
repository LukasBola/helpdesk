import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import i18n from '@/i18n'

import { TicketPriorityBadge } from './TicketPriorityBadge'

describe('TicketPriorityBadge', () => {
  it('shows the translated priority label', async () => {
    render(<TicketPriorityBadge priority="URGENT" />)
    expect(screen.getByText('Pilny')).toBeInTheDocument()
    await act(() => i18n.changeLanguage('en'))
    expect(screen.getByText('Urgent')).toBeInTheDocument()
  })

  it('uses the priority token colors', () => {
    render(<TicketPriorityBadge priority="LOW" />)
    expect(screen.getByText('Niski')).toHaveClass('bg-priority-low', 'text-priority-low-fg')
  })
})
