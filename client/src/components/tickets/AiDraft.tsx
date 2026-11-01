import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { aiLanguage, draftTranslationFor } from '@/lib/ai'
import { useSession } from '@/lib/auth-client'
import { getActiveUser } from '@/lib/session'
import type { TicketAiResult } from '@/lib/tickets-api'

export function AiDraft({
  result,
  onUse,
}: {
  result: TicketAiResult
  onUse: (text: string) => void
}) {
  const { t } = useTranslation()
  const { data } = useSession()
  const draft = result.draft
  if (!draft) return null
  const translation = draftTranslationFor(result, aiLanguage(getActiveUser(data)))

  return (
    <section
      aria-label={t('ai.draft.title')}
      className="flex flex-col gap-2 rounded-2xl border border-dashed border-violet-400 bg-violet-50 p-4"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-violet-700">
        <Sparkles className="h-4 w-4" aria-hidden />
        {t('ai.draft.title')}
      </h3>
      <p className="whitespace-pre-wrap break-words text-sm">{draft}</p>
      {translation && (
        <div className="text-sm text-muted-foreground">
          <p className="text-xs font-medium">{t('ai.draft.translation')}</p>
          <p className="whitespace-pre-wrap break-words">{translation}</p>
        </div>
      )}
      <div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-xl"
          onClick={() => onUse(draft)}
        >
          {t('ai.draft.use')}
        </Button>
      </div>
    </section>
  )
}
