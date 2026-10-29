// Fixture tickets created by server/prisma/e2e-fixtures.ts (messageId = `e2e-<key>`).
export const TICKETS = {
  openUrgent: { subject: 'E2E Drukarka nie drukuje', status: 'OPEN', priority: 'URGENT' },
  openLow: { subject: 'E2E Pytanie o fakturę', status: 'OPEN', priority: 'LOW' },
  progress: { subject: 'E2E Reset hasła', status: 'IN_PROGRESS', priority: 'MEDIUM' },
  resolved: { subject: 'E2E Zwrot towaru', status: 'RESOLVED', priority: 'HIGH' },
  patchStatus: { subject: 'E2E Do zmiany statusu', status: 'OPEN', priority: 'MEDIUM' },
  patchAssign: { subject: 'E2E Do przypisania', status: 'OPEN', priority: 'MEDIUM' },
  patchInvalid: { subject: 'E2E Błędne dane', status: 'OPEN', priority: 'MEDIUM' },
} as const

export const E2E_SEARCH = 'E2E '
