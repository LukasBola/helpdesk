import { Link } from 'react-router-dom'

import { TicketPriorityBadge } from '@/components/tickets/TicketPriorityBadge'
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge'
import type { AppLanguage } from '@/i18n'
import { formatAge } from '@/lib/format'
import type { TicketListItem } from '@/lib/tickets-api'
import { cn } from '@/lib/utils'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('')
}

export function TicketRow({
  ticket,
  to,
  selected,
  now,
  lng,
}: {
  ticket: TicketListItem
  to: string
  selected: boolean
  now: Date
  lng: AppLanguage
}) {
  return (
    <Link
      to={to}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-accent/60',
        selected && 'bg-accent',
      )}
    >
      <span className="w-12 shrink-0 text-xs text-slate-500">
        {formatAge(ticket.createdAt, now, lng)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900">{ticket.subject}</span>
        <span className="block truncate text-xs text-slate-500">
          {ticket.customerName ?? ticket.customerEmail}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
      </span>
      {ticket.assignee && (
        <span
          title={ticket.assignee.name}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
        >
          {initials(ticket.assignee.name)}
        </span>
      )}
    </Link>
  )
}
