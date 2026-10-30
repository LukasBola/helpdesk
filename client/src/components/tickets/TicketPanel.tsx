import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'

import { ReplyForm } from '@/components/tickets/ReplyForm'
import { TicketControls } from '@/components/tickets/TicketControls'
import { TicketThread } from '@/components/tickets/TicketThread'
import { Button } from '@/components/ui/button'
import { useTicket } from '@/hooks/useTickets'
import { currentLanguage } from '@/i18n'
import { apiErrorKey } from '@/lib/api-error'
import { formatDateTime } from '@/lib/format'

const CARD = 'rounded-2xl bg-white p-4 shadow-soft'

export function TicketPanel({ ticketId }: { ticketId: string }) {
  const { t } = useTranslation()
  const { data: ticket, isPending, isError, error, refetch } = useTicket(ticketId)

  if (isPending) {
    return (
      <div className={CARD} role="status" aria-label={t('tickets.panelLoading')}>
        <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  // A failed background refetch keeps the cached ticket (and any unsent reply) on screen.
  if (isError && !ticket) {
    const notFound = isAxiosError(error) && error.response?.status === 404
    return (
      <div className={`${CARD} flex flex-col items-start gap-3`} role="alert">
        <p className="text-sm">{notFound ? t('tickets.notFound') : t('tickets.panelError')}</p>
        {!notFound && <p className="text-xs text-muted-foreground">{t(apiErrorKey(error))}</p>}
        {!notFound && (
          <Button variant="outline" className="min-h-11" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <section aria-label={ticket.subject} className="flex flex-col gap-4">
      {isError && (
        <div
          role="alert"
          className={`${CARD} flex flex-wrap items-center justify-between gap-2 text-sm`}
        >
          <span>{t('tickets.refreshError')}</span>
          <Button variant="outline" className="min-h-11" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )}
      <header className={`${CARD} flex flex-col gap-3`}>
        <div>
          <h2 className="break-words text-xl font-semibold">{ticket.subject}</h2>
          <p className="break-words text-sm text-muted-foreground">
            {ticket.customerName
              ? `${ticket.customerName} <${ticket.customerEmail}>`
              : ticket.customerEmail}
          </p>
          <p className="text-xs text-muted-foreground">
            <time dateTime={ticket.createdAt}>
              {formatDateTime(ticket.createdAt, currentLanguage())}
            </time>
          </p>
        </div>
        <TicketControls ticket={ticket} />
      </header>
      <TicketThread ticket={ticket} />
      <div className={CARD}>
        <ReplyForm ticketId={ticket.id} />
      </div>
    </section>
  )
}
