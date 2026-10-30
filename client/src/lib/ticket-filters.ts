import type { TicketPriority, TicketStatus } from './tickets-api'

export type SortKey = 'oldest' | 'newest' | 'priority'
type DefaultAssignee = 'all' | 'me'

export interface TicketFilters {
  status: TicketStatus | 'all'
  priority: TicketPriority | null
  assignee: 'all' | 'me' | 'none' | string
  search: string
  sort: SortKey
}

const STATUSES: readonly TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
const PRIORITIES: readonly TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const SORTS: readonly SortKey[] = ['oldest', 'newest', 'priority']

export function parseFilters(
  params: URLSearchParams,
  defaultAssignee: DefaultAssignee,
): TicketFilters {
  const status = params.get('status')
  const priority = params.get('priority')
  const sort = params.get('sort')
  return {
    status: status === 'all' ? 'all' : (STATUSES.find(s => s === status) ?? 'OPEN'),
    priority: PRIORITIES.find(p => p === priority) ?? null,
    assignee: params.get('assignee') || defaultAssignee,
    search: params.get('search') ?? '',
    sort: SORTS.find(s => s === sort) ?? 'oldest',
  }
}

export function serializeFilters(
  filters: TicketFilters,
  defaultAssignee: DefaultAssignee,
): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.status !== 'OPEN') params.set('status', filters.status)
  if (filters.priority) params.set('priority', filters.priority)
  if (filters.assignee !== defaultAssignee) params.set('assignee', filters.assignee)
  if (filters.search) params.set('search', filters.search)
  if (filters.sort !== 'oldest') params.set('sort', filters.sort)
  return params
}

function withQuery(path: string, params: URLSearchParams): string {
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

export function ticketPath(id: string, filters: TicketFilters): string {
  return withQuery(`/tickets/${encodeURIComponent(id)}`, serializeFilters(filters, 'all'))
}

export function listPath(filters: TicketFilters): string {
  return filters.assignee === 'me'
    ? withQuery('/tickets/mine', serializeFilters(filters, 'me'))
    : withQuery('/tickets', serializeFilters(filters, 'all'))
}

const SORT_QUERY: Record<SortKey, { orderBy: string; order: string }> = {
  oldest: { orderBy: 'createdAt', order: 'asc' },
  newest: { orderBy: 'createdAt', order: 'desc' },
  priority: { orderBy: 'priority', order: 'desc' },
}

export function toListQuery(filters: TicketFilters, currentUserId: string): Record<string, string> {
  const query: Record<string, string> = {}
  if (filters.status !== 'all') query.status = filters.status
  if (filters.priority) query.priority = filters.priority
  if (filters.assignee === 'me') query.assigneeId = currentUserId
  else if (filters.assignee !== 'all') query.assigneeId = filters.assignee
  if (filters.search) query.search = filters.search
  return { ...query, ...SORT_QUERY[filters.sort] }
}
