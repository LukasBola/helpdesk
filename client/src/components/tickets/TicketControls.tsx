import { useTranslation } from 'react-i18next'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateTicket } from '@/hooks/useTickets'
import { useUsers } from '@/hooks/useUsers'
import { apiErrorKey } from '@/lib/api-error'
import type { TicketDetail, TicketPriority, TicketStatus } from '@/lib/tickets-api'

const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
const PRIORITIES: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const NONE = 'none'
const TRIGGER = 'min-h-11 rounded-xl bg-white'

export function TicketControls({ ticket }: { ticket: TicketDetail }) {
  const { t } = useTranslation()
  const { data: users = [] } = useUsers()
  const { mutate, isPending, isError, error } = useUpdateTicket(ticket.id)

  // A blocked agent is offered only while they are the current value.
  const agents = users.filter(u => !u.isBlocked || u.id === ticket.assigneeId)

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          <span aria-hidden>{t('tickets.control.status')}</span>
          <Select
            value={ticket.status}
            disabled={isPending}
            onValueChange={v => mutate({ status: v as TicketStatus })}
          >
            <SelectTrigger className={TRIGGER} aria-label={t('tickets.control.status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          <span aria-hidden>{t('tickets.control.priority')}</span>
          <Select
            value={ticket.priority}
            disabled={isPending}
            onValueChange={v => mutate({ priority: v as TicketPriority })}
          >
            <SelectTrigger className={TRIGGER} aria-label={t('tickets.control.priority')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map(p => (
                <SelectItem key={p} value={p}>
                  {t(`priority.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          <span aria-hidden>{t('tickets.control.assignee')}</span>
          <Select
            value={ticket.assigneeId ?? NONE}
            disabled={isPending}
            onValueChange={v => mutate({ assigneeId: v === NONE ? null : v })}
          >
            <SelectTrigger className={TRIGGER} aria-label={t('tickets.control.assignee')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('thread.unassigned')}</SelectItem>
              {agents.map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {t(apiErrorKey(error))}
        </p>
      )}
    </div>
  )
}
