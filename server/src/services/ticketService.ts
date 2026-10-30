import type { Prisma, TicketPriority, TicketStatus } from '@prisma/client'

import { prisma } from '../db'

interface ListOptions {
  status?: TicketStatus
  priority?: TicketPriority
  assigneeId?: string
  search?: string
  orderBy?: 'createdAt' | 'updatedAt' | 'priority'
  order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

// Prisma passes `contains` straight into ILIKE, so % and _ would act as wildcards.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

export async function listTickets(opts: ListOptions) {
  const where: Prisma.TicketWhereInput = {}

  if (opts.status) where.status = opts.status
  if (opts.priority) where.priority = opts.priority
  if (opts.assigneeId) where.assigneeId = opts.assigneeId === 'none' ? null : opts.assigneeId
  if (opts.search) {
    const search = escapeLike(opts.search)
    where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { customerEmail: { contains: search, mode: 'insensitive' } },
      { customerName: { contains: search, mode: 'insensitive' } },
    ]
  }

  const page = opts.page ?? 1
  const limit = opts.limit ?? 25
  const skip = (page - 1) * limit

  const field = opts.orderBy ?? 'createdAt'
  const order = opts.order ?? 'desc'
  // id breaks ties, so offset pagination never repeats or skips rows.
  // Within one priority, the oldest ticket comes first regardless of direction.
  const orderBy: Prisma.TicketOrderByWithRelationInput[] =
    field === 'priority'
      ? [{ priority: order }, { createdAt: 'asc' }, { id: 'asc' }]
      : [{ [field]: order }, { id: order }]

  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: { assignee: { select: { id: true, name: true, email: true } } },
    }),
    prisma.ticket.count({ where }),
  ])

  return { tickets, total, page, limit }
}

export async function findTicketById(id: string) {
  return prisma.ticket.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      history: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, name: true } } },
      },
      replies: {
        orderBy: { sentAt: 'asc' },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })
}

// The assignee must be an existing, active user; the message is safe to return as a 422.
export class InvalidAssigneeError extends Error {}

interface UpdateFields {
  status?: TicketStatus
  priority?: TicketPriority
  assigneeId?: string | null
}

export async function updateTicket(id: string, fields: UpdateFields, actorId: string) {
  return prisma.$transaction(async tx => {
    const current = await tx.ticket.findUnique({ where: { id } })
    if (!current) return null

    if (fields.assigneeId) {
      const assignee = await tx.user.findUnique({ where: { id: fields.assigneeId } })
      if (!assignee) throw new InvalidAssigneeError('Unknown assignee')
      if (assignee.isBlocked) throw new InvalidAssigneeError('Assignee is blocked')
    }

    const historyEntries: Prisma.TicketHistoryCreateManyInput[] = []

    if (fields.status && fields.status !== current.status) {
      historyEntries.push({
        ticketId: id,
        userId: actorId,
        field: 'status',
        oldValue: current.status,
        newValue: fields.status,
      })
    }
    if (fields.priority && fields.priority !== current.priority) {
      historyEntries.push({
        ticketId: id,
        userId: actorId,
        field: 'priority',
        oldValue: current.priority,
        newValue: fields.priority,
      })
    }
    if ('assigneeId' in fields && fields.assigneeId !== current.assigneeId) {
      historyEntries.push({
        ticketId: id,
        userId: actorId,
        field: 'assigneeId',
        oldValue: current.assigneeId ?? null,
        newValue: fields.assigneeId ?? null,
      })
    }

    const updated = await tx.ticket.update({ where: { id }, data: fields })
    if (historyEntries.length > 0) {
      await tx.ticketHistory.createMany({ data: historyEntries })
    }

    return updated
  })
}

export const REPLY_MAX_LENGTH = 10_000

// Saves the reply and, for an OPEN ticket, moves it to IN_PROGRESS in the same transaction.
// The status is changed by a conditional updateMany so Postgres settles races: a concurrent
// change (e.g. RESOLVED) is never overwritten and only one writer records the history row.
export async function createReply(ticketId: string, body: string, actorId: string) {
  return prisma.$transaction(async tx => {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { id: true } })
    if (!ticket) return null

    const reply = await tx.reply.create({
      data: { ticketId, userId: actorId, body },
      include: { user: { select: { id: true, name: true } } },
    })

    const { count } = await tx.ticket.updateMany({
      where: { id: ticketId, status: 'OPEN' },
      data: { status: 'IN_PROGRESS' },
    })
    if (count === 1) {
      await tx.ticketHistory.create({
        data: {
          ticketId,
          userId: actorId,
          field: 'status',
          oldValue: 'OPEN',
          newValue: 'IN_PROGRESS',
        },
      })
    }

    return reply
  })
}
