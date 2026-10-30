import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LanguageSwitcher } from './LanguageSwitcher'

describe('LanguageSwitcher', () => {
  it('marks the active language as pressed', () => {
    render(<LanguageSwitcher />)
    expect(screen.getByRole('group', { name: 'Język' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PL' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with the chosen language', async () => {
    const onChange = vi.fn()
    render(<LanguageSwitcher onChange={onChange} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'EN' }))
    expect(onChange).toHaveBeenCalledWith('en')
  })
})
