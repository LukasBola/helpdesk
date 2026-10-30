import { describe, expect, it } from 'vitest'

import type { Session, SessionUser } from './auth-client'
import { getActiveUser } from './session'

function sessionFor(overrides: Partial<SessionUser>): Session {
  return {
    user: {
      id: 'u1',
      name: 'Anna Kowalska',
      email: 'anna@firma.pl',
      emailVerified: false,
      role: 'AGENT',
      isBlocked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    },
    session: {
      id: 's1',
      userId: 'u1',
      token: 't',
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as Session
}

describe('getActiveUser', () => {
  it('returns null without a session', () => {
    expect(getActiveUser(null)).toBeNull()
    expect(getActiveUser(undefined)).toBeNull()
  })

  it('returns null for a blocked user', () => {
    expect(getActiveUser(sessionFor({ isBlocked: true }))).toBeNull()
  })

  it('returns the user otherwise', () => {
    expect(getActiveUser(sessionFor({}))?.email).toBe('anna@firma.pl')
  })
})
