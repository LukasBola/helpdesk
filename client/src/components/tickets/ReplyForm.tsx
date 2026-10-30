import { type FormEvent, type KeyboardEvent, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useCreateReply } from '@/hooks/useTickets'
import { apiErrorKey } from '@/lib/api-error'

export function ReplyForm({ ticketId }: { ticketId: string }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  const { mutate, isPending, isError, error, reset } = useCreateReply(ticketId)
  const canSend = text.trim() !== '' && !isPending

  // Grow with the content (capped by max-h in the class list).
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  const send = () => {
    if (!canSend) return
    const sent = text
    // Text typed while the request was pending stays; only the sent text is cleared.
    mutate(sent.trim(), { onSuccess: () => setText(current => (current === sent ? '' : current)) })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      send()
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <textarea
        ref={area}
        value={text}
        rows={3}
        aria-label={t('reply.label')}
        placeholder={t('reply.placeholder')}
        onChange={e => {
          setText(e.target.value)
          if (isError) reset()
        }}
        onKeyDown={onKeyDown}
        className="max-h-64 min-h-24 w-full resize-none rounded-xl border border-input bg-white px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t('reply.threadOnlyNote')}</p>
        <Button type="submit" disabled={!canSend} className="min-h-11 rounded-xl px-6">
          {t('reply.send')}
        </Button>
      </div>
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {t(apiErrorKey(error))}
        </p>
      )}
    </form>
  )
}
