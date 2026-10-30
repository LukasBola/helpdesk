import { useTranslation } from 'react-i18next'

import { TicketRow } from '@/components/tickets/TicketRow'
import { Button } from '@/components/ui/button'
import { currentLanguage } from '@/i18n'
import type { TicketListItem } from '@/lib/tickets-api'

export function TicketList({
  tickets,
  selectedId,
  pathFor,
  isPending,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onRetry,
  onLoadMore,
  onClearFilters,
}: {
  tickets: TicketListItem[]
  selectedId: string | undefined
  pathFor: (id: string) => string
  isPending: boolean
  isError: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onRetry: () => void
  onLoadMore: () => void
  onClearFilters: () => void
}) {
  const { t } = useTranslation()
  const lng = currentLanguage()
  const now = new Date()

  if (isPending) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label={t('common.loading')}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="alert">
        <p className="text-sm text-slate-600">{t('tickets.loadError')}</p>
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-slate-600">{t('tickets.empty')}</p>
        <Button variant="outline" className="min-h-11" onClick={onClearFilters}>
          {t('tickets.clearFilters')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <nav aria-label={t('tickets.listLabel')} className="flex flex-col gap-1">
        {tickets.map(ticket => (
          <TicketRow
            key={ticket.id}
            ticket={ticket}
            to={pathFor(ticket.id)}
            selected={ticket.id === selectedId}
            now={now}
            lng={lng}
          />
        ))}
      </nav>
      {hasNextPage && (
        <Button
          variant="outline"
          className="mt-2 min-h-11"
          disabled={isFetchingNextPage}
          onClick={onLoadMore}
        >
          {t('tickets.loadMore')}
        </Button>
      )}
    </div>
  )
}
