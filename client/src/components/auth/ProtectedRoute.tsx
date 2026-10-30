import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { FullScreenLoader } from '@/components/FullScreenLoader'
import { useSession } from '@/lib/auth-client'
import { DEFAULT_PATH } from '@/lib/redirect'
import { getActiveUser } from '@/lib/session'

export function ProtectedRoute({ role }: { role?: 'ADMIN' }) {
  const { data, isPending } = useSession()
  const location = useLocation()

  if (isPending) return <FullScreenLoader />

  const user = getActiveUser(data)
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  // UX only; the server enforces roles with requireRole.
  if (role && user.role !== role) return <Navigate to={DEFAULT_PATH} replace />

  return <Outlet />
}
