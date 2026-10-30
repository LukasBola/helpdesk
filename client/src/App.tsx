import { BookOpen, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { DEFAULT_PATH } from '@/lib/redirect'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { TicketsPage } from '@/pages/TicketsPage'

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
          <Route path="/tickets" element={<TicketsPage defaultAssignee="all" />} />
          <Route path="/tickets/mine" element={<TicketsPage defaultAssignee="me" />} />
          <Route path="/tickets/:id" element={<TicketsPage defaultAssignee="all" />} />
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
