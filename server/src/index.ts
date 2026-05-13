import './env'

import { app } from './app'
import { env } from './env'
import { registerEmailWorker } from './jobs/processEmail'
import { getQueue, stopQueue } from './jobs/queue'
import { logger } from './lib/logger'

async function main() {
  const queue = await getQueue()
  await registerEmailWorker(queue)

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Server started')
  })

  server.on('error', err => {
    logger.error({ err }, 'Server failed to start')
    process.exit(1)
  })

  const shutdown = () => {
    logger.info('Shutting down...')
    server.close(() => {
      stopQueue()
        .then(() => {
          process.exit(0)
        })
        .catch(err => {
          logger.error({ err }, 'Error during shutdown')
          process.exit(1)
        })
    })
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch(err => {
  logger.error({ err }, 'Fatal startup error')
  process.exit(1)
})
