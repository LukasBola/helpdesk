// Fixture tickets created by server/prisma/e2e-fixtures.ts (messageId = `e2e-<key>`).
export const TICKETS = {
  openUrgent: { subject: 'E2E Drukarka nie drukuje', status: 'OPEN', priority: 'URGENT' },
  openLow: { subject: 'E2E Pytanie o fakturę', status: 'OPEN', priority: 'LOW' },
  progress: { subject: 'E2E Reset hasła', status: 'IN_PROGRESS', priority: 'MEDIUM' },
  resolved: { subject: 'E2E Zwrot towaru', status: 'RESOLVED', priority: 'HIGH' },
  patchStatus: { subject: 'E2E Do zmiany statusu', status: 'OPEN', priority: 'MEDIUM' },
  patchAssign: { subject: 'E2E Do przypisania', status: 'OPEN', priority: 'MEDIUM' },
  patchInvalid: { subject: 'E2E Błędne dane', status: 'OPEN', priority: 'MEDIUM' },
  apiReply: { subject: 'E2E API odpowiedź', status: 'OPEN', priority: 'MEDIUM' },
  uiReply: { subject: 'E2E Do odpowiedzi', status: 'OPEN', priority: 'MEDIUM' },
  uiAssign: { subject: 'E2E Do przypisania w UI', status: 'OPEN', priority: 'LOW' },
} as const

// Every fixture's customer e-mail ends with this domain, which no real ticket uses.
export const E2E_SEARCH = 'klient.example'
