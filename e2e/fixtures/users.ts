import path from 'node:path'

// Created by `pnpm --filter server seed:e2e` (run automatically in global-setup.ts).
// Keep in sync with server/prisma/seed-e2e.ts.
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-password-123'

export const USERS = {
  admin: { email: 'e2e-admin@helpdesk.local', password: PASSWORD, firstName: 'Ewa' },
  agent: { email: 'e2e-agent@helpdesk.local', password: PASSWORD, firstName: 'Adam' },
} as const

export type Role = keyof typeof USERS

const AUTH_DIR = path.join(import.meta.dirname, '..', '.auth')

export const STORAGE_STATE: Record<Role, string> = {
  admin: path.join(AUTH_DIR, 'admin.json'),
  agent: path.join(AUTH_DIR, 'agent.json'),
}
