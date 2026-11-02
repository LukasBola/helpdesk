import { type AppLanguage, currentLanguage } from '@/i18n'
import type { SessionUser } from '@/lib/auth-client'
import type { TicketAiResult } from '@/lib/tickets-api'

// The language AI summaries are shown in: the account's AI language, else the UI language.
export function aiLanguage(user: SessionUser | null | undefined): AppLanguage {
  return user?.aiLocale ?? currentLanguage()
}

export function summaryFor(r: TicketAiResult, lng: AppLanguage): string | null {
  return lng === 'pl' ? r.summaryPl : r.summaryEn
}

// No translation is offered when the draft is already in the requested language.
export function draftTranslationFor(r: TicketAiResult, lng: AppLanguage): string | null {
  if (r.customerLanguage === lng) return null
  return lng === 'pl' ? r.draftTranslationPl : r.draftTranslationEn
}

// Mirrors AI_STALE_PENDING_MS on the server (server/src/jobs/aiTriage.ts).
export const AI_STALE_PENDING_MS = 15 * 60_000

// A PENDING row this old is considered abandoned; the server re-queues it on the next request.
export function isStalePending(r: TicketAiResult, now = Date.now()): boolean {
  return r.state === 'PENDING' && now - Date.parse(r.updatedAt) > AI_STALE_PENDING_MS
}

export function hasResults(r: TicketAiResult | null): boolean {
  return r !== null && r.completedAt !== null
}
