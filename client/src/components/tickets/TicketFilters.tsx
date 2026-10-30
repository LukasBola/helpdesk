import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUsers } from '@/hooks/useUsers'
import type { SortKey, TicketFilters as Filters } from '@/lib/ticket-filters'
import type { TicketPriority, TicketStatus } from '@/lib/tickets-api'

const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
const PRIORITIES: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const SORTS: SortKey[] = ['oldest', 'newest', 'priority']
const ANY_PRIORITY = 'any'
const SEARCH_DEBOUNCE_MS = 300

const TRIGGER = 'min-h-11 rounded-xl bg-white'

export function TicketFilters({
  filters,
  onChange,
}: {
  filters: Filters
  onChange: (next: Filters) => void
}) {
  const { t } = useTranslation()
  const { data: users = [] } = useUsers()

  // Local text so typing is instant; the URL (and the request) follow after a pause.
  const [searchText, setSearchText] = useState(filters.search)
  const latest = useRef({ filters, onChange })
  latest.current = { filters, onChange }

  // The last value we pushed to the URL: when it comes back it is our own update, not an
  // external change (back button, clear filters), and must not overwrite newer typing.
  const lastSent = useRef(filters.search)

  useEffect(() => {
    if (filters.search === lastSent.current) return
    lastSent.current = filters.search
    setSearchText(filters.search)
  }, [filters.search])

  useEffect(() => {
    if (searchText === latest.current.filters.search) return
    const timer = setTimeout(() => {
      lastSent.current = searchText
      latest.current.onChange({ ...latest.current.filters, search: searchText })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchText])

  // A blocked agent is offered only while they are the current value.
  const agents = users.filter(u => !u.isBlocked || u.id === filters.assignee)

  return (
    <div className="grid grid-cols-2 gap-2">
      <Select
        value={filters.status}
        onValueChange={v => onChange({ ...filters, status: v as Filters['status'] })}
      >
        <SelectTrigger className={TRIGGER} aria-label={t('tickets.filter.status')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('tickets.filter.allStatuses')}</SelectItem>
          {STATUSES.map(s => (
            <SelectItem key={s} value={s}>
              {t(`status.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.priority ?? ANY_PRIORITY}
        onValueChange={v =>
          onChange({ ...filters, priority: v === ANY_PRIORITY ? null : (v as TicketPriority) })
        }
      >
        <SelectTrigger className={TRIGGER} aria-label={t('tickets.filter.priority')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_PRIORITY}>{t('tickets.filter.anyPriority')}</SelectItem>
          {PRIORITIES.map(p => (
            <SelectItem key={p} value={p}>
              {t(`priority.${p}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.assignee} onValueChange={v => onChange({ ...filters, assignee: v })}>
        <SelectTrigger className={TRIGGER} aria-label={t('tickets.filter.assignee')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('tickets.filter.allAssignees')}</SelectItem>
          <SelectItem value="me">{t('tickets.filter.mine')}</SelectItem>
          <SelectItem value="none">{t('tickets.filter.unassigned')}</SelectItem>
          {agents.map(u => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.sort}
        onValueChange={v => onChange({ ...filters, sort: v as SortKey })}
      >
        <SelectTrigger className={TRIGGER} aria-label={t('tickets.filter.sort')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORTS.map(s => (
            <SelectItem key={s} value={s}>
              {t(`tickets.sort.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="search"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        placeholder={t('tickets.searchPlaceholder')}
        aria-label={t('tickets.filter.search')}
        className="col-span-2 min-h-11 rounded-xl bg-white"
      />
    </div>
  )
}
