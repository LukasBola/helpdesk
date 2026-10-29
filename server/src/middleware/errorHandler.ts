import type { NextFunction, Request, Response } from 'express'

import { logger } from '../lib/logger'

// express.json() (body-parser) reports client errors as http-errors with a `type`.
const BODY_PARSER_ERRORS: Record<string, { status: number; error: string }> = {
  'entity.parse.failed': { status: 400, error: 'Invalid JSON body' },
  'entity.too.large': { status: 413, error: 'Request body too large' },
  'charset.unsupported': { status: 415, error: 'Unsupported charset' },
  'encoding.unsupported': { status: 415, error: 'Unsupported content encoding' },
}

function bodyParserError(err: Error) {
  return 'type' in err && typeof err.type === 'string' ? BODY_PARSER_ERRORS[err.type] : undefined
}

export function errorHandler(err: Error, _req: Request, res: Response, next: NextFunction) {
  const clientError = bodyParserError(err)
  if (clientError && !res.headersSent) {
    res.status(clientError.status).json({ error: clientError.error })
    return
  }
  logger.error({ err }, 'Unhandled error')
  if (res.headersSent) {
    next(err)
    return
  }
  res.status(500).json({ error: 'Internal server error' })
}
