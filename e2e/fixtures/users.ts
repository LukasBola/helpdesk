import path from 'node:path'

// Created by `pnpm --filter server e2e:fixtures seed` (run in global-setup.ts).
// Keep in sync with server/prisma/e2e-fixtures.ts.
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-password-123'

export const USERS = {
  admin: {
    email: 'e2e-admin@helpdesk.local',
    password: PASSWORD,
    name: 'Ewa Admin',
    firstName: 'Ewa',
  },
  agent: {
    email: 'e2e-agent@helpdesk.local',
    password: PASSWORD,
    name: 'Adam Agent',
    firstName: 'Adam',
  },
  // Toggled blocked/unblocked by tests; never used for a shared storage state.
  blocked: {
    email: 'e2e-blocked@helpdesk.local',
    password: PASSWORD,
    name: 'Bartek Blokowany',
    firstName: 'Bartek',
  },
  // Used by API tests that sign out or change the account.
  api: { email: 'e2e-api@helpdesk.local', password: PASSWORD, name: 'Iga Api', firstName: 'Iga' },
  // Toggled by the API blocked-session test only.
  blockedApi: {
    email: 'e2e-blocked-api@helpdesk.local',
    password: PASSWORD,
    name: 'Olek Api',
    firstName: 'Olek',
  },
  // Used only by the privilege-escalation test.
  escalate: {
    email: 'e2e-escalate@helpdesk.local',
    password: PASSWORD,
    name: 'Ela Eskalacja',
    firstName: 'Ela',
  },
  // Blocked by its own test to try unblocking itself.
  selfUnblock: {
    email: 'e2e-selfunblock@helpdesk.local',
    password: PASSWORD,
    name: 'Sara Samoodblok',
    firstName: 'Sara',
  },
  // Used by account-endpoint tests (name changes, session listing).
  account: {
    email: 'e2e-account@helpdesk.local',
    password: PASSWORD,
    name: 'Konrad Konto',
    firstName: 'Konrad',
  },
  // Used only by the language test (switches the account language).
  locale: {
    email: 'e2e-locale@helpdesk.local',
    password: PASSWORD,
    name: 'Lucyna Język',
    firstName: 'Lucyna',
  },
  // Blocked by the seed and never unblocked.
  locked: {
    email: 'e2e-locked@helpdesk.local',
    password: PASSWORD,
    name: 'Lena Zablokowana',
    firstName: 'Lena',
  },
} as const

export type UserKey = keyof typeof USERS
export type Role = 'admin' | 'agent'

const AUTH_DIR = path.join(import.meta.dirname, '..', '.auth')

export const STORAGE_STATE: Record<Role, string> = {
  admin: path.join(AUTH_DIR, 'admin.json'),
  agent: path.join(AUTH_DIR, 'agent.json'),
}
