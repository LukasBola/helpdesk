import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useRequestAi } from '@/hooks/useTickets'
import { AI_STALE_PENDING_MS, aiLanguage, hasResults, isStalePending, summaryFor } from '@/lib/ai'
import { apiErrorKey } from '@/lib/api-error'
import { useSession } from '@/lib/auth-client'
import { getActiveUser } from '@/lib/session'
import type { TicketDetail } from '@/lib/tickets-api'

const BOX = 'rounded-2xl border border-dashed border-violet-400 bg-violet-50 p-4'
const BTN = 'min-h-11 rounded-xl'

export function AiSummary({ ticket }: { ticket: TicketDetail }) {
  const { t } = useTranslation()
  const { data } = useSession()
  const { mutate, isPending, isError, error } = useRequestAi(ticket.id)
  const ai = ticket.aiResult
  const request = () => mutate()
  const lang = aiLanguage(getActiveUser(data))
  const stale = !!ai && isStalePending(ai)
  const [, setTick] = useState(0)
  const pendingSince = ai?.state === 'PENDING' ? ai.updatedAt : null
  // Poll responses that did not change keep the same data, so nothing re-renders when the
  // stale cutoff passes; schedule that re-render ourselves.
  useEffect(() => {
    if (!pendingSince) return
    const delay = Date.parse(pendingSince) + AI_STALE_PENDING_MS - Date.now()
    if (delay < 0) return
    const timer = setTimeout(() => setTick(n => n + 1), delay + 1000)
    return () => clearTimeout(timer)
  }, [pendingSince])
  const errorDetail = ai?.error && (
    <span className="block text-xs text-muted-foreground">{ai.error}</span>
  )

  const requestError = isError && (
    <p role="alert" className="text-sm text-destructive">
      {t(apiErrorKey(error))}
    </p>
  )

  let body
  if (!ai || (!hasResults(ai) && ai.state === 'READY')) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('ai.none')}</p>
        <Button variant="outline" className={BTN} disabled={isPending} onClick={request}>
          {t('ai.analyze')}
        </Button>
      </div>
    )
  } else if (!hasResults(ai)) {
    body =
      ai.state === 'FAILED' ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            {t('ai.unavailable')}
            {errorDetail}
          </span>
          <Button variant="outline" className={BTN} disabled={isPending} onClick={request}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-sm">
            {t('ai.pending')}
          </p>
          {stale && (
            <Button variant="outline" className={BTN} disabled={isPending} onClick={request}>
              {t('common.retry')}
            </Button>
          )}
        </div>
      )
  } else {
    const regenerating = ai.state === 'PENDING'
    body = (
      <div className="flex flex-col gap-2">
        <p lang={lang} className="whitespace-pre-wrap break-words text-sm">
          {summaryFor(ai, lang)}
        </p>
        {regenerating && (
          <p role="status" className="text-xs text-muted-foreground">
            {t('ai.regenerating')}
          </p>
        )}
        {ai.state === 'FAILED' && (
          <p role="alert" className="text-xs text-destructive">
            {t('ai.regenerateFailed')}
            {errorDetail}
          </p>
        )}
        <div>
          <Button
            variant="outline"
            className={BTN}
            disabled={(regenerating && !stale) || isPending}
            onClick={request}
          >
            {t('ai.regenerate')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section aria-label={t('ai.summary')} className={`${BOX} flex flex-col gap-2`}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-violet-700">
        <Sparkles className="h-4 w-4" aria-hidden />
        {t('ai.summary')}
      </h3>
      {body}
      {requestError}
    </section>
  )
}
