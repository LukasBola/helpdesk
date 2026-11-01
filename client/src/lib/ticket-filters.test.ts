import { describe, expect, it } from 'vitest'

import { listPath, parseFilters, serializeFilters, ticketPath, toListQuery } from './ticket-filters'

const defaults = parseFilters(new URLSearchParams(''), 'all')

describe('ticket filters', () => {
  it('defaults: open, oldest first, all assignees on /tickets', () => {
    expect(parseFilters(new URLSearchParams(''), 'all')).toEqual({
      status: 'OPEN',
      priority: null,
      assignee: 'all',
      search: '',
      sort: 'oldest',
    })
  })
  it('defaults to "me" on /tickets/mine', () => {
    expect(parseFilters(new URLSearchParams(''), 'me').assignee).toBe('me')
  })
  it('falls back to defaults for invalid values', () => {
    expect(parseFilters(new URLSearchParams('status=FOO&priority=bar&sort=x'), 'all')).toEqual(
      defaults,
    )
  })
  it('round-trips through the URL', () => {
    const qs = 'status=all&priority=URGENT&assignee=none&search=faktura&sort=priority'
    const parsed = parseFilters(new URLSearchParams(qs), 'all')
    expect(parsed).toEqual({
      status: 'all',
      priority: 'URGENT',
      assignee: 'none',
      search: 'faktura',
      sort: 'priority',
    })
    expect(serializeFilters(parsed, 'all').toString()).toBe(qs)
  })
  it('omits defaults when serializing', () => {
    expect(serializeFilters(defaults, 'all').toString()).toBe('')
  })
  it('on /tickets/mine, choosing "all" survives the URL round-trip', () => {
    const all = { ...parseFilters(new URLSearchParams(''), 'me'), assignee: 'all' as const }
    const params = serializeFilters(all, 'me')
    expect(params.get('assignee')).toBe('all')
    expect(parseFilters(params, 'me').assignee).toBe('all')
  })
  it('listPath sends "me" back to /tickets/mine and keeps the other filters', () => {
    expect(listPath({ ...defaults, assignee: 'me', priority: 'URGENT' })).toBe(
      '/tickets/mine?priority=URGENT',
    )
    expect(listPath(defaults)).toBe('/tickets')
    expect(ticketPath('t1', { ...defaults, assignee: 'me' })).toBe('/tickets/t1?assignee=me')
    expect(ticketPath('t1', defaults)).toBe('/tickets/t1')
  })
  it('toListQuery maps me/none/all and sort keys', () => {
    expect(
      toListQuery(
        { status: 'all', priority: null, assignee: 'me', search: '', sort: 'priority' },
        'u1',
      ),
    ).toEqual({ assigneeId: 'u1', orderBy: 'priority', order: 'desc' })
    expect(
      toListQuery(
        { status: 'OPEN', priority: 'HIGH', assignee: 'none', search: 'x', sort: 'newest' },
        'u1',
      ),
    ).toEqual({
      status: 'OPEN',
      priority: 'HIGH',
      assigneeId: 'none',
      search: 'x',
      orderBy: 'createdAt',
      order: 'desc',
    })
    expect(toListQuery(defaults, 'u1')).toEqual({
      status: 'OPEN',
      orderBy: 'createdAt',
      order: 'asc',
    })
  })
})
