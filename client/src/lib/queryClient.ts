import { QueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

const MAX_RETRIES = 2

// Retry only network errors and 5xx; 4xx (notably 401) won't change on retry.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (!isAxiosError(error)) return false
  const status = error.response?.status
  if (status !== undefined && status < 500) return false
  return failureCount < MAX_RETRIES
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      // Better Auth already refetches the session on focus.
      refetchOnWindowFocus: false,
    },
  },
})
