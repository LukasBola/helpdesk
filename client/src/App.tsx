import { BookOpen, Ticket, UserCheck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { DEFAULT_PATH } from '@/lib/redirect'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

// Opt into v7 behavior now so the upgrade is a no-op.
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true }

export function AppRoutes() {
  const { t } = useTranslation()
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to={DEFAULT_PATH} replace />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route
            path="/tickets"
            element={<PlaceholderPage title={t('nav.tickets')} icon={Ticket} />}
          />
          <Route
            path="/tickets/mine"
            element={<PlaceholderPage title={t('nav.mine')} icon={UserCheck} />}
          />
          <Route
            path="/knowledge-base"
            element={<PlaceholderPage title={t('nav.knowledgeBase')} icon={BookOpen} />}
          />
          <Route element={<ProtectedRoute role="ADMIN" />}>
            <Route
              path="/users"
              element={<PlaceholderPage title={t('nav.users')} icon={Users} />}
            />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
