import type { NextFunction } from 'express'
import { Router } from 'express'
import { z } from 'zod'

import { requireAuth } from '../middleware/auth'
import { findTicketById, listTickets, updateTicket } from '../services/ticketService'

const router = Router()

router.use(requireAuth)

const listQuerySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().optional(),
  search: z.string().optional(),
  orderBy: z.enum(['createdAt', 'updatedAt', 'priority']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})

router.get('/', async (req, res, next: NextFunction) => {
  try {
    const result = listQuerySchema.safeParse(req.query)
    if (!result.success) {
      res.status(422).json({ error: result.error.flatten() })
      return
    }
    const data = await listTickets(result.data)
    res.json(data)
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next: NextFunction) => {
  try {
    const ticket = await findTicketById(req.params.id)
    if (!ticket) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(ticket)
  } catch (err) {
    next(err)
  }
})

const updateBodySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().nullable().optional(),
})

router.patch('/:id', async (req, res, next: NextFunction) => {
  try {
    const result = updateBodySchema.safeParse(req.body)
    if (!result.success) {
      res.status(422).json({ error: result.error.flatten() })
      return
    }

    const ticket = await updateTicket(req.params.id, result.data, req.session.userId as string)
    res.json(ticket)
  } catch (err) {
    next(err)
  }
})

export default router
