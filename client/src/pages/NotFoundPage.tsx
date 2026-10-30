import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { DEFAULT_PATH } from '@/lib/redirect'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-card">
        <Logo className="mb-6 justify-center" />
        <p className="text-5xl font-bold text-primary">404</p>
        <h1 className="mt-2 text-lg font-semibold text-indigo-950">{t('notFound.title')}</h1>
        <Button asChild className="mt-6 min-h-11 w-full">
          <Link to={DEFAULT_PATH}>{t('notFound.back')}</Link>
        </Button>
      </div>
    </main>
  )
}
