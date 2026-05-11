import './env'

import { app } from './app'
import { env } from './env'

const server = app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`)
})

server.on('error', err => {
  console.error('Server failed to start:', err)
  process.exit(1)
})
