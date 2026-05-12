import bcrypt from 'bcrypt'
import { NextFunction, Request, Response, Router } from 'express'
import { z } from 'zod'

import { prisma } from '../db'
import { requireAuth } from '../middleware/auth'
import { SESSION_COOKIE_NAME } from '../lib/session'

const router = Router()

const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh3u'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = loginSchema.safeParse(req.body)
    if (!result.success) {
      res.status(422).json({ error: result.error.flatten() })
      return
    }

    const { email, password } = result.data
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || user.isBlocked) {
      await bcrypt.compare(password, DUMMY_HASH)
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    req.session.regenerate((err) => {
      if (err) { next(err); return }
      req.session.userId = user.id
      req.session.role = user.role
      res.json({ id: user.id, email: user.email, name: user.name, role: user.role })
    })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) { next(err); return }
    res.clearCookie(SESSION_COOKIE_NAME)
    res.json({ message: 'Logged out' })
  })
})

router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { id: true, email: true, name: true, role: true, isBlocked: true },
    })
    if (!user || user.isBlocked) {
      req.session.destroy(() => {
        res.status(401).json({ error: 'Unauthorized' })
      })
      return
    }
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role })
  } catch (err) {
    next(err)
  }
})

export default router
