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
