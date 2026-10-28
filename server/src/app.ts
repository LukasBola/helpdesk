import express from 'express'

import { sessionMiddleware } from './lib/session'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './routes/auth'
import ticketsRouter from './routes/tickets'
import webhookRouter from './routes/webhooks'

export const app = express()

app.use(express.json())
app.use(sessionMiddleware)

app.use('/api/auth', authRouter)
app.use('/api/webhooks', webhookRouter)
app.use('/api/tickets', ticketsRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use(errorHandler)
