import './env'

import { app } from './app'
import { env } from './env'
import { registerEmailWorker } from './jobs/processEmail'
import { getQueue } from './jobs/queue'

async function main() {
  const queue = await getQueue()
  await registerEmailWorker(queue)
  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`)
  })
}

main().catch(console.error)
