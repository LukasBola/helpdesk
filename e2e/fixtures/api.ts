import { type APIRequestContext, expect, request } from '@playwright/test'

import { type UserKey, USERS } from './users'

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

// Requests go to the frontend origin, so they pass through the Vite proxy to the backend,
// with the Origin header a browser would send.
export const BROWSER_HEADERS = { Origin: new URL(BASE_URL).origin }

export async function newApiContext(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: BROWSER_HEADERS })
}

export async function signInAs(user: UserKey): Promise<APIRequestContext> {
  const ctx = await newApiContext()
  const { email, password } = USERS[user]
  const res = await ctx.post('/api/auth/sign-in/email', { data: { email, password } })
  expect(res.status(), `sign-in as ${user}`).toBe(200)
  return ctx
}

export interface TicketDto {
  id: string
  subject: string
  status: string
  priority: string
  assigneeId: string | null
  customerEmail: string
}

export async function findTicketId(ctx: APIRequestContext, subject: string): Promise<string> {
  const res = await ctx.get('/api/tickets', { params: { search: subject, limit: 5 } })
  expect(res.status()).toBe(200)
  const { tickets } = (await res.json()) as { tickets: TicketDto[] }
  const ticket = tickets.find(t => t.subject === subject)
  if (!ticket) throw new Error(`fixture ticket not found: ${subject}`)
  return ticket.id
}
