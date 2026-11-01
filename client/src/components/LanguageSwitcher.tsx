import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import i18n, { type AppLanguage, currentLanguage, LANGUAGES } from '@/i18n'

export function LanguageSwitcher({ onChange }: { onChange?: (lng: AppLanguage) => void }) {
  const { t } = useTranslation()
  const active = currentLanguage()
  const change = onChange ?? ((lng: AppLanguage) => void i18n.changeLanguage(lng))

  return (
    <div role="group" aria-label={t('language.label')} className="flex justify-center gap-1">
      {LANGUAGES.map(lng => (
        <Button
          key={lng}
          type="button"
          size="sm"
          variant={lng === active ? 'secondary' : 'ghost'}
          aria-pressed={lng === active}
          className="min-h-11 min-w-11"
          onClick={() => change(lng)}
        >
          {lng.toUpperCase()}
        </Button>
      ))}
    </div>
  )
}
