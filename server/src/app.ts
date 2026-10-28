import { toNodeHandler } from 'better-auth/node'
import express from 'express'

import { auth } from './lib/auth'
import { errorHandler } from './middleware/errorHandler'
import ticketsRouter from './routes/tickets'
import webhookRouter from './routes/webhooks'

export const app = express()

// Must be mounted before express.json(), which would consume the body Better Auth needs.
app.all('/api/auth/*', toNodeHandler(auth))

app.use(express.json())

app.use('/api/webhooks', webhookRouter)
app.use('/api/tickets', ticketsRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use(errorHandler)
