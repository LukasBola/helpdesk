import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { usePageTitle } from '@/components/layout/PageTitle'
import { TicketFilters } from '@/components/tickets/TicketFilters'
import { TicketList } from '@/components/tickets/TicketList'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useTicketList } from '@/hooks/useTickets'
import {
  listPath,
  parseFilters,
  serializeFilters,
  type TicketFilters as Filters,
  ticketPath,
  toListQuery,
} from '@/lib/ticket-filters'

export function TicketsPage({ defaultAssignee }: { defaultAssignee: 'all' | 'me' }) {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const user = useCurrentUser()
  usePageTitle(defaultAssignee === 'me' ? t('nav.mine') : t('nav.tickets'))

  const filters = parseFilters(params, defaultAssignee)
  const list = useTicketList(toListQuery(filters, user.id))

  const changeFilters = (next: Filters) =>
    setParams(serializeFilters(next, defaultAssignee), { replace: true })

  // Below lg one column: the ticket when an id is open, otherwise the list.
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-4">
      <section className={id ? 'hidden lg:block' : undefined}>
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-3 shadow-soft">
          <TicketFilters filters={filters} onChange={changeFilters} />
          <TicketList
            tickets={list.tickets}
            selectedId={id}
            pathFor={ticketId => ticketPath(ticketId, filters)}
            isPending={list.isPending}
            isError={list.isError}
            hasNextPage={list.hasNextPage}
            isFetchingNextPage={list.isFetchingNextPage}
            onRetry={() => void list.refetch()}
            onLoadMore={() => void list.fetchNextPage()}
            onClearFilters={() => navigate(defaultAssignee === 'me' ? '/tickets/mine' : '/tickets')}
          />
        </div>
      </section>
      <section className={id ? undefined : 'hidden lg:block'}>
        {id && (
          <Link
            to={listPath(filters)}
            className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-primary shadow-soft lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t('tickets.back')}
          </Link>
        )}
        {/* Task 10 replaces this placeholder with <TicketPanel ticketId={id} />. */}
        <div className="flex min-h-64 items-center justify-center rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-soft">
          {t('tickets.selectPrompt')}
        </div>
      </section>
    </div>
  )
}
