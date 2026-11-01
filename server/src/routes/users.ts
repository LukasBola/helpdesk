import type { NextFunction } from 'express'
import { Router } from 'express'

import { requireAuth } from '../middleware/auth'
import { listUsers } from '../services/userService'

const router = Router()

router.use(requireAuth)

router.get('/', async (_req, res, next: NextFunction) => {
  try {
    res.json({ users: await listUsers() })
  } catch (err) {
    next(err)
  }
})

export default router
