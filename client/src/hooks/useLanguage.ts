import { useEffect, useState } from 'react'

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
export function useChangeLanguage(): {
  change: (lng: AppLanguage) => Promise<void>
  error: boolean
} {
  const [error, setError] = useState(false)

  async function change(lng: AppLanguage) {
    setError(false)
    await i18n.changeLanguage(lng)
    try {
      const result = await updateUser({ locale: lng })
      if (result?.error) setError(true)
    } catch {
      setError(true)
    }
  }

  return { change, error }
}
