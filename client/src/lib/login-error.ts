// Mapped by status, not message: the server must not reveal whether an account exists or is blocked.
export function loginErrorKey(
  status: number | undefined,
): 'errors.badCredentials' | 'errors.rateLimited' | 'errors.generic' {
  if (status === 401 || status === 403) return 'errors.badCredentials'
  if (status === 429) return 'errors.rateLimited'
  return 'errors.generic'
}
