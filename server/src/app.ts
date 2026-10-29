import { toNodeHandler } from 'better-auth/node'
import express from 'express'

import { auth } from './lib/auth'
import { errorHandler } from './middleware/errorHandler'
import { originCheck } from './middleware/originCheck'
import ticketsRouter from './routes/tickets'
import webhookRouter from './routes/webhooks'

export const app = express()

// Must be mounted before express.json(), which would consume the body Better Auth needs.
app.all('/api/auth/*', toNodeHandler(auth))

app.use('/api', originCheck)

// Inbound emails (HTML, attachments) are often larger than the default 100 kB.
app.use('/api/webhooks', express.json({ limit: '10mb' }), webhookRouter)

app.use(express.json())

app.use('/api/tickets', ticketsRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use(errorHandler)
