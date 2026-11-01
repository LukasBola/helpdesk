import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router-dom'

import { FullScreenLoader } from '@/components/FullScreenLoader'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn, useSession } from '@/lib/auth-client'
import { loginErrorKey } from '@/lib/login-error'
import { safeRedirectPath } from '@/lib/redirect'
import { getActiveUser } from '@/lib/session'

export function LoginPage() {
  const { t } = useTranslation()
  const { data, isPending } = useSession()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<ReturnType<typeof loginErrorKey> | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isPending) return <FullScreenLoader />
  // Also the success path: signIn updates the session store asynchronously, and navigating
  // before it does would bounce off ProtectedRoute and lose `from`.
  if (getActiveUser(data)) {
    const from = (location.state as { from?: unknown } | null)?.from
    return <Navigate to={safeRedirectPath(from)} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await signIn.email({ email, password })
      if (result.error) setError(loginErrorKey(result.error.status))
    } catch {
      setError(loginErrorKey(undefined))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card sm:p-8">
        <Logo className="text-lg" />
        <p className="mb-6 mt-1 text-sm text-muted-foreground">{t('auth.subtitle')}</p>
        <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="min-h-11"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="min-h-11"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {t(error)}
            </div>
          )}
          <Button type="submit" className="min-h-11 w-full font-semibold" disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" aria-hidden />}
            {t('auth.submit')}
          </Button>
        </form>
        <div className="mt-4">
          <LanguageSwitcher />
        </div>
      </div>
    </main>
  )
}
