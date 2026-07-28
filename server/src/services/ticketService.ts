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

export async function listTickets(opts: ListOptions) {
  const where: Prisma.TicketWhereInput = {}

  if (opts.status) where.status = opts.status
  if (opts.priority) where.priority = opts.priority
  if (opts.assigneeId) where.assigneeId = opts.assigneeId
  if (opts.search) {
    where.OR = [
      { subject: { contains: opts.search, mode: 'insensitive' } },
      { customerEmail: { contains: opts.search, mode: 'insensitive' } },
      { customerName: { contains: opts.search, mode: 'insensitive' } },
    ]
  }

  const page = opts.page ?? 1
  const limit = opts.limit ?? 25
  const skip = (page - 1) * limit

  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      orderBy: { [opts.orderBy ?? 'createdAt']: opts.order ?? 'desc' },
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

interface UpdateFields {
  status?: TicketStatus
  priority?: TicketPriority
  assigneeId?: string | null
}

export async function updateTicket(id: string, fields: UpdateFields, actorId: string) {
  const current = await prisma.ticket.findUniqueOrThrow({ where: { id } })

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

  const [updated] = await prisma.$transaction([
    prisma.ticket.update({ where: { id }, data: fields }),
    ...(historyEntries.length > 0
      ? [prisma.ticketHistory.createMany({ data: historyEntries })]
      : []),
  ])

  return updated
}
