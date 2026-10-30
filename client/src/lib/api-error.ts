import { isAxiosError } from 'axios'

export type ApiErrorKey =
  | 'errors.network'
  | 'errors.notFound'
  | 'errors.validation'
  | 'errors.generic'

export function apiErrorKey(error: unknown): ApiErrorKey {
  if (!isAxiosError(error)) return 'errors.generic'
  if (!error.response) return 'errors.network'
  if (error.response.status === 404) return 'errors.notFound'
  if (error.response.status === 422) return 'errors.validation'
  return 'errors.generic'
}
