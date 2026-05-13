import type { Request, Response } from 'express'
import { Router } from 'express'

import { env } from '../env'
import { EMAIL_JOB } from '../jobs/processEmail'
import { getQueue } from '../jobs/queue'

const router = Router()

function verifyPostmarkToken(req: Request, res: Response): boolean {
  const token = req.headers['x-postmark-token']
  if (!env.POSTMARK_WEBHOOK_TOKEN || token !== env.POSTMARK_WEBHOOK_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

router.post('/postmark', async (req, res) => {
  if (!verifyPostmarkToken(req, res)) return

  const queue = await getQueue()
  await queue.send(EMAIL_JOB, req.body)

  res.json({ ok: true })
})

export default router
