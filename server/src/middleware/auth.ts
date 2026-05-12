import type { NextFunction, Request, Response } from 'express'

const ROLE_HIERARCHY: Record<'AGENT' | 'ADMIN', number> = { AGENT: 1, ADMIN: 2 }

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

export function requireRole(role: 'AGENT' | 'ADMIN') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const userLevel = ROLE_HIERARCHY[req.session.role ?? 'AGENT'] ?? 0
    const requiredLevel = ROLE_HIERARCHY[role]
    if (userLevel < requiredLevel) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}
