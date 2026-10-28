import { fromNodeHeaders } from 'better-auth/node'
import type { NextFunction, Request, Response } from 'express'

import { auth } from '../lib/auth'

type Role = 'AGENT' | 'ADMIN'
type CurrentUser = NonNullable<Request['currentUser']>

const ROLE_HIERARCHY: Record<Role, number> = { AGENT: 1, ADMIN: 2 }

async function loadCurrentUser(req: Request): Promise<CurrentUser | null> {
  if (req.currentUser) {
    return req.currentUser
  }
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session || session.user.isBlocked) {
    return null
  }
  req.currentUser = { id: session.user.id, role: session.user.role as Role }
  return req.currentUser
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await loadCurrentUser(req)
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}

export function requireRole(role: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await loadCurrentUser(req)
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      if ((ROLE_HIERARCHY[user.role] ?? 0) < ROLE_HIERARCHY[role]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}
