import type { NextFunction, Request, Response } from 'express'

import { logger } from '../lib/logger'

// Set by express.json() (body-parser) when the request body isn't valid JSON.
function isJsonParseError(err: Error): boolean {
  return 'type' in err && err.type === 'entity.parse.failed'
}

export function errorHandler(err: Error, _req: Request, res: Response, next: NextFunction) {
  if (isJsonParseError(err) && !res.headersSent) {
    res.status(400).json({ error: 'Invalid JSON body' })
    return
  }
  logger.error({ err }, 'Unhandled error')
  if (res.headersSent) {
    next(err)
    return
  }
  res.status(500).json({ error: 'Internal server error' })
}
