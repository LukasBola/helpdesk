import { timingSafeEqual } from 'crypto'
import type { Request, Response } from 'express'
import { Router } from 'express'
import { z } from 'zod'

import { env } from '../env'
import { EMAIL_JOB } from '../jobs/processEmail'
import { getQueue } from '../jobs/queue'

const router = Router()

const PostmarkWebhookSchema = z.object({
  MessageID: z.string().min(1),
  From: z.string(),
  FromFull: z.object({
    Email: z.string().email(),
    Name: z.string(),
  }),
  Subject: z.string(),
  TextBody: z.string().default(''),
  HtmlBody: z.string().default(''),
  To: z.string(),
})

function verifyPostmarkToken(req: Request, res: Response): boolean {
  const token = req.headers['x-postmark-token']
  const expected = env.POSTMARK_WEBHOOK_TOKEN

  if (!expected || typeof token !== 'string') {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }

  let valid: boolean
  try {
    valid =
      token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    valid = false
  }

  if (!valid) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }

  return true
}

router.post('/postmark', async (req, res, next) => {
  if (!verifyPostmarkToken(req, res)) return

  const parsed = PostmarkWebhookSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload' })
    return
  }

  try {
    const queue = await getQueue()
    await queue.createQueue(EMAIL_JOB)
    await queue.send(EMAIL_JOB, parsed.data)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
