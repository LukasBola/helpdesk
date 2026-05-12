import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { prisma } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post('/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    res.status(422).json({ error: result.error.flatten() })
    return
  }

  const { email, password } = result.data
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user || user.isBlocked) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  req.session.userId = user.id
  req.session.role = user.role

  res.json({ id: user.id, email: user.email, name: user.name, role: user.role })
})

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid')
    res.json({ ok: true })
  })
})

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    select: { id: true, email: true, name: true, role: true },
  })
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  res.json(user)
})

export default router
