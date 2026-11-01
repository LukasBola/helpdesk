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

export function hasResults(r: TicketAiResult | null): boolean {
  return r !== null && r.completedAt !== null
}
