import { useEffect, useRef, useState } from 'react'

import i18n, { type AppLanguage, currentLanguage } from '@/i18n'
import { type SessionUser, updateUser } from '@/lib/auth-client'

// Adopt the account language when it arrives or changes. Deliberately keyed on `locale`
// only: while a save is in flight the session still holds the old value, and re-running
// on the current language would flip the UI back.
export function useLanguageSync(locale: SessionUser['locale'] | null | undefined): void {
  useEffect(() => {
    if ((locale === 'pl' || locale === 'en') && locale !== currentLanguage()) {
      void i18n.changeLanguage(locale)
    }
  }, [locale])
}

// Saves one account field at a time, in the order chosen, so the last choice is the one
// stored. A failed save is reported in `error`.
function useQueuedSave(field: 'locale' | 'aiLocale') {
  const [error, setError] = useState(false)
  const saves = useRef<Promise<void>>(Promise.resolve())

  async function save(lng: AppLanguage) {
    try {
      const result = await updateUser({ [field]: lng })
      setError(Boolean(result?.error))
    } catch {
      setError(true)
    }
  }

  async function enqueue(lng: AppLanguage) {
    const next = saves.current.then(() => save(lng))
    saves.current = next
    await next
  }

  return { error, setError, enqueue }
}

// Switch immediately, then persist to the account. A failed save keeps the new language.
export function useChangeLanguage(): {
  change: (lng: AppLanguage) => Promise<void>
  error: boolean
} {
  const { error, setError, enqueue } = useQueuedSave('locale')

  async function change(lng: AppLanguage) {
    setError(false)
    await i18n.changeLanguage(lng)
    await enqueue(lng)
  }

  return { change, error }
}

// The language AI output is shown in. Saved to the account only; the UI language stays.
export function useChangeAiLanguage(): {
  change: (lng: AppLanguage) => Promise<void>
  error: boolean
} {
  const { error, setError, enqueue } = useQueuedSave('aiLocale')

  async function change(lng: AppLanguage) {
    setError(false)
    await enqueue(lng)
  }

  return { change, error }
}
