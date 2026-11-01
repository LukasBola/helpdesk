import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Logo } from './Logo'

export function FullScreenLoader() {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      aria-label={t('common.loading')}
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app"
    >
      <Logo className="text-lg" />
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
    </div>
  )
}
