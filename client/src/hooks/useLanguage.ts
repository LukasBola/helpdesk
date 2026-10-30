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

// Switch immediately, then persist to the account. A failed save keeps the new language.
// Saves run one after another, so quick switches reach the server in the order chosen and
// the last choice is the one stored.
export function useChangeLanguage(): {
  change: (lng: AppLanguage) => Promise<void>
  error: boolean
} {
  const [error, setError] = useState(false)
  const saves = useRef<Promise<void>>(Promise.resolve())

  async function save(lng: AppLanguage) {
    try {
      const result = await updateUser({ locale: lng })
      setError(Boolean(result?.error))
    } catch {
      setError(true)
    }
  }

  async function change(lng: AppLanguage) {
    setError(false)
    await i18n.changeLanguage(lng)
    const next = saves.current.then(() => save(lng))
    saves.current = next
    await next
  }

  return { change, error }
}
