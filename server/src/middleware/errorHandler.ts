import type { NextFunction, Request, Response } from 'express'

import { logger } from '../lib/logger'

export function errorHandler(err: Error, _req: Request, res: Response, next: NextFunction) {
  logger.error({ err }, 'Unhandled error')
  if (res.headersSent) {
    next(err)
    return
  }
  res.status(500).json({ error: 'Internal server error' })
}
