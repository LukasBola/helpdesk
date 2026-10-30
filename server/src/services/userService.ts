import { prisma } from '../db'

export function listUsers() {
  return prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, isBlocked: true },
    orderBy: { name: 'asc' },
  })
}
