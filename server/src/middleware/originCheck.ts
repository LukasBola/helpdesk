import type { NextFunction, Request, Response } from 'express'

import { env } from '../env'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const TRUSTED_ORIGINS = new Set([env.CLIENT_URL, new URL(env.BETTER_AUTH_URL).origin])

// CSRF defence for routes outside Better Auth (which checks origins itself): a browser
// always sends Origin on state-changing requests, so reject ones from untrusted sites.
// Server-to-server callers (webhooks) send no Origin and are authenticated separately.
export function originCheck(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin
  if (SAFE_METHODS.has(req.method) || !origin || TRUSTED_ORIGINS.has(origin)) {
    next()
    return
  }
  res.status(403).json({ error: 'Invalid origin' })
}
