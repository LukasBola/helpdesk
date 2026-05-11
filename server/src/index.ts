import './env'

import { app } from './app'
import { env } from './env'
import { logger } from './lib/logger'

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Server started')
})

server.on('error', err => {
  logger.error({ err }, 'Server failed to start')
  process.exit(1)
})
