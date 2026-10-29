import axios, { isAxiosError } from 'axios'

import { signOut } from './auth-client'
import { queryClient } from './queryClient'

export const api = axios.create({ baseURL: '/api', withCredentials: true })

let signingOut: Promise<void> | null = null

// Several queries can fail with 401 at once; sign out only once. Removing the session
// (also for a blocked user) lets ProtectedRoute redirect to /login.
function handleUnauthorized(): Promise<void> {
  signingOut ??= signOut()
    .then(() => undefined)
    .finally(() => {
      queryClient.clear()
      signingOut = null
    })
  return signingOut
}

api.interceptors.response.use(undefined, (error: unknown) => {
  if (
    isAxiosError(error) &&
    error.response?.status === 401 &&
    !error.config?.url?.startsWith('/auth')
  ) {
    void handleUnauthorized()
  }
  return Promise.reject(error)
})
