import { BookOpen, Ticket, UserCheck, Users } from 'lucide-react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { DEFAULT_PATH } from '@/lib/redirect'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

// Opt into v7 behavior now so the upgrade is a no-op.
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true }

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to={DEFAULT_PATH} replace />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Outlet />}>
          <Route path="/tickets" element={<PlaceholderPage title="Tickety" icon={Ticket} />} />
          <Route path="/tickets/mine" element={<PlaceholderPage title="Moje" icon={UserCheck} />} />
          <Route
            path="/knowledge-base"
            element={<PlaceholderPage title="Baza wiedzy" icon={BookOpen} />}
          />
          <Route element={<ProtectedRoute role="ADMIN" />}>
            <Route path="/users" element={<PlaceholderPage title="Użytkownicy" icon={Users} />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
