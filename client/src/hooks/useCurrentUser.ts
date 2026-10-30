import type { SessionUser } from '@/lib/auth-client'
import { useSession } from '@/lib/auth-client'
import { getActiveUser } from '@/lib/session'

// Only for components rendered under ProtectedRoute, where an active user is guaranteed.
export function useCurrentUser(): SessionUser {
  const { data } = useSession()
  const user = getActiveUser(data)
  if (!user) throw new Error('useCurrentUser called without a signed-in user')
  return user
}
