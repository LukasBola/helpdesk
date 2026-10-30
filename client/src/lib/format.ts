import type { AppLanguage } from '@/i18n'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY

export function formatAge(iso: string, now: Date, lng: AppLanguage): string {
  const rtf = new Intl.RelativeTimeFormat(lng, { numeric: 'auto', style: 'short' })
  // Clamp future timestamps (clock skew) to "now".
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime())
  if (diff >= MONTH) return rtf.format(-Math.floor(diff / MONTH), 'month')
  if (diff >= DAY) return rtf.format(-Math.floor(diff / DAY), 'day')
  if (diff >= HOUR) return rtf.format(-Math.floor(diff / HOUR), 'hour')
  return rtf.format(-Math.floor(diff / MINUTE), 'minute')
}

export function formatDateTime(iso: string, lng: AppLanguage): string {
  return new Intl.DateTimeFormat(lng, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  )
}
