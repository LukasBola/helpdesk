import { api } from '@/lib/api'

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export interface UserRef {
  id: string
  name: string
}
export interface TicketListItem {
  id: string
  subject: string
  status: TicketStatus
  priority: TicketPriority
  customerEmail: string
  customerName: string | null
  createdAt: string
  updatedAt: string
  assigneeId: string | null
  assignee: (UserRef & { email: string }) | null
}
export interface TicketListPage {
  tickets: TicketListItem[]
  total: number
  page: number
  limit: number
}
export interface TicketHistoryEntry {
  id: string
  field: 'status' | 'priority' | 'assigneeId'
  oldValue: string | null
  newValue: string | null
  createdAt: string
  user: UserRef | null
}
export interface TicketReply {
  id: string
  body: string
  sentAt: string
  user: UserRef
}
export interface TicketDetail extends TicketListItem {
  body: string
  history: TicketHistoryEntry[]
  replies: TicketReply[]
}
export interface AppUser {
  id: string
  name: string
  email: string
  role: 'AGENT' | 'ADMIN'
  isBlocked: boolean
}
export interface TicketUpdate {
  status?: TicketStatus
  priority?: TicketPriority
  assigneeId?: string | null
}

export const TICKETS_PAGE_SIZE = 25

export async function fetchTicketPage(
  query: Record<string, string>,
  page: number,
): Promise<TicketListPage> {
  const { data } = await api.get<TicketListPage>('/tickets', {
    params: { ...query, page, limit: TICKETS_PAGE_SIZE },
  })
  return data
}

export async function fetchTicket(id: string): Promise<TicketDetail> {
  const { data } = await api.get<TicketDetail>(`/tickets/${encodeURIComponent(id)}`)
  return data
}

export async function patchTicket(id: string, update: TicketUpdate): Promise<TicketListItem> {
  const { data } = await api.patch<TicketListItem>(`/tickets/${encodeURIComponent(id)}`, update)
  return data
}

export async function postReply(id: string, body: string): Promise<TicketReply> {
  const { data } = await api.post<TicketReply>(`/tickets/${encodeURIComponent(id)}/replies`, {
    body,
  })
  return data
}

export async function fetchUsers(): Promise<AppUser[]> {
  const { data } = await api.get<{ users: AppUser[] }>('/users')
  return data.users
}
