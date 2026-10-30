import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { refreshSession, signOut } from '@/lib/auth-client'

// Order matters: leave the protected pages before clearing the cache, so mounted
// queries don't refetch, hit 401 and trigger the interceptor mid-logout.
export function useLogout(): () => Promise<void> {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return async () => {
    await signOut()
    // Navigating while the store still holds the user would bounce /login back to /tickets.
    await refreshSession()
    navigate('/login', { replace: true })
    queryClient.clear()
  }
}
