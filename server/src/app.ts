import express from 'express'

import { sessionMiddleware } from './lib/session'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './routes/auth'

export const app = express()

app.use(express.json())
app.use(sessionMiddleware)

app.use('/api/auth', authRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use(errorHandler)
