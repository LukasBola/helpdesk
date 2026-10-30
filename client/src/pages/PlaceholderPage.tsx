import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/components/layout/PageTitle'

export function PlaceholderPage({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  const { t } = useTranslation()
  usePageTitle(title)
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 rounded-2xl bg-white p-8 text-center shadow-soft">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <p className="text-sm text-muted-foreground">{t('common.soon')}</p>
    </div>
  )
}
