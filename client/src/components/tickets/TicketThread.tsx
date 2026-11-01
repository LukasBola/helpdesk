import { useTranslation } from 'react-i18next'

import { useUsers } from '@/hooks/useUsers'
import { currentLanguage } from '@/i18n'
import { formatDateTime } from '@/lib/format'
import type { TicketDetail } from '@/lib/tickets-api'
import { buildTimeline, historyText } from '@/lib/timeline'
import { cn } from '@/lib/utils'

function Bubble({
  author,
  at,
  body,
  mine,
}: {
  author: string
  at: string
  body: string
  mine?: boolean
}) {
  return (
    <li className={cn('flex', mine && 'sm:justify-end')}>
      <div
        className={cn(
          'max-w-full rounded-2xl px-4 py-3 sm:max-w-[85%]',
          mine ? 'bg-accent text-accent-foreground' : 'bg-white shadow-soft',
        )}
      >
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          <span className="font-medium">{author}</span>
          <time dateTime={at}>{formatDateTime(at, currentLanguage())}</time>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm">{body}</p>
      </div>
    </li>
  )
}

export function TicketThread({ ticket }: { ticket: TicketDetail }) {
  const { t } = useTranslation()
  const { data: users = [] } = useUsers()
  const lng = currentLanguage()

  return (
    <ol aria-label={t('tickets.thread')} className="flex flex-col gap-3">
      {buildTimeline(ticket).map(item => {
        if (item.kind === 'message')
          return (
            <Bubble
              key="message"
              author={item.ticket.customerName ?? item.ticket.customerEmail}
              at={item.at}
              body={item.ticket.body}
            />
          )
        if (item.kind === 'reply')
          return (
            <Bubble
              key={`r-${item.reply.id}`}
              author={item.reply.user.name}
              at={item.at}
              body={item.reply.body}
              mine
            />
          )
        return (
          <li key={`h-${item.entry.id}`} className="text-xs text-muted-foreground">
            <span>{historyText(item.entry, users, t)}</span> ·{' '}
            <time dateTime={item.at}>{formatDateTime(item.at, lng)}</time>
          </li>
        )
      })}
    </ol>
  )
}
