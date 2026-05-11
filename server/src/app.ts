import express from 'express'

import { errorHandler } from './middleware/errorHandler'

export const app = express()

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use(errorHandler)
