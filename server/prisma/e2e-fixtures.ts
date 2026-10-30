import type { TicketPriority, TicketStatus } from '@prisma/client'

import { prisma } from '../src/db'
import { createCredentialUser } from '../src/lib/users'

// Test data for the Playwright suite (e2e/). Runs against the dev database.
// Keep users and tickets in sync with e2e/fixtures/users.ts and e2e/fixtures/tickets.ts.
//   tsx prisma/e2e-fixtures.ts seed
//   tsx prisma/e2e-fixtures.ts block|unblock|user-id <email>
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-password-123'
const TICKET_PREFIX = 'e2e-'

const USERS = [
  { email: 'e2e-admin@helpdesk.local', name: 'Ewa Admin', role: 'ADMIN' as const },
  { email: 'e2e-agent@helpdesk.local', name: 'Adam Agent', role: 'AGENT' as const },
  { email: 'e2e-blocked@helpdesk.local', name: 'Bartek Blokowany', role: 'AGENT' as const },
  { email: 'e2e-api@helpdesk.local', name: 'Iga Api', role: 'AGENT' as const },
  { email: 'e2e-blocked-api@helpdesk.local', name: 'Olek Api', role: 'AGENT' as const },
  { email: 'e2e-locked@helpdesk.local', name: 'Lena Zablokowana', role: 'AGENT' as const },
  { email: 'e2e-escalate@helpdesk.local', name: 'Ela Eskalacja', role: 'AGENT' as const },
  { email: 'e2e-selfunblock@helpdesk.local', name: 'Sara Samoodblok', role: 'AGENT' as const },
  { email: 'e2e-account@helpdesk.local', name: 'Konrad Konto', role: 'AGENT' as const },
  { email: 'e2e-locale@helpdesk.local', name: 'Lucyna Język', role: 'AGENT' as const },
]
// Blocked for good at every seed.
const LOCKED = 'e2e-locked@helpdesk.local'

const TICKETS: { key: string; subject: string; status: TicketStatus; priority: TicketPriority }[] =
  [
    { key: 'open-urgent', subject: 'E2E Drukarka nie drukuje', status: 'OPEN', priority: 'URGENT' },
    { key: 'open-low', subject: 'E2E Pytanie o fakturę', status: 'OPEN', priority: 'LOW' },
    { key: 'progress', subject: 'E2E Reset hasła', status: 'IN_PROGRESS', priority: 'MEDIUM' },
    { key: 'resolved', subject: 'E2E Zwrot towaru', status: 'RESOLVED', priority: 'HIGH' },
    { key: 'patch-status', subject: 'E2E Do zmiany statusu', status: 'OPEN', priority: 'MEDIUM' },
    { key: 'patch-assign', subject: 'E2E Do przypisania', status: 'OPEN', priority: 'MEDIUM' },
    { key: 'patch-invalid', subject: 'E2E Błędne dane', status: 'OPEN', priority: 'MEDIUM' },
    { key: 'api-reply', subject: 'E2E API odpowiedź', status: 'OPEN', priority: 'MEDIUM' },
    { key: 'ui-reply', subject: 'E2E Do odpowiedzi', status: 'OPEN', priority: 'MEDIUM' },
    { key: 'ui-assign', subject: 'E2E Do przypisania w UI', status: 'OPEN', priority: 'LOW' },
  ]

async function seed() {
  // Recreate everything so a previous run (or a manual change) can't leak into this one:
  // passwords, roles, names, isBlocked and sessions all start fresh.
  await prisma.ticket.deleteMany({ where: { messageId: { startsWith: TICKET_PREFIX } } })
  await prisma.user.deleteMany({ where: { email: { in: USERS.map(u => u.email) } } })
  for (const user of USERS) {
    await createCredentialUser({ ...user, password: PASSWORD })
  }
  await prisma.user.update({ where: { email: LOCKED }, data: { isBlocked: true } })

  for (const t of TICKETS) {
    await prisma.ticket.create({
      data: {
        subject: t.subject,
        body: `Treść zgłoszenia: ${t.subject}`,
        status: t.status,
        priority: t.priority,
        customerEmail: `${t.key}@klient.example`,
        customerName: `Klient ${t.key}`,
        messageId: `${TICKET_PREFIX}${t.key}`,
      },
    })
  }
}

async function setBlocked(email: string | undefined, isBlocked: boolean) {
  if (!email) throw new Error('email required')
  await prisma.user.update({ where: { email }, data: { isBlocked } })
}

async function printUserId(email: string | undefined) {
  if (!email) throw new Error('email required')
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  // Parsed by e2e/fixtures/db.ts.
  console.log(`E2E_USER_ID=${user.id}`)
}

async function main() {
  const [command, arg] = process.argv.slice(2)
  if (command === 'seed') await seed()
  else if (command === 'block') await setBlocked(arg, true)
  else if (command === 'unblock') await setBlocked(arg, false)
  else if (command === 'user-id') await printUserId(arg)
  else throw new Error(`unknown command: ${command}`)
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
