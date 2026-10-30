import type { Session, SessionUser } from './auth-client'

// A blocked user's session is still returned by get-session, but every API call rejects it,
// so the UI treats it as logged out.
export function getActiveUser(data: Session | null | undefined): SessionUser | null {
  if (!data || data.user.isBlocked === true) return null
  return data.user
}
