import type { TFunction } from 'i18next'

import type {
  AppUser,
  TicketDetail,
  TicketHistoryEntry,
  TicketPriority,
  TicketReply,
  TicketStatus,
} from '@/lib/tickets-api'

export type TimelineItem =
  | { kind: 'message'; at: string; ticket: TicketDetail }
  | { kind: 'reply'; at: string; reply: TicketReply }
  | { kind: 'history'; at: string; entry: TicketHistoryEntry }

/** Customer message first, then replies and history by time; a reply wins a tie. */
export function buildTimeline(ticket: TicketDetail): TimelineItem[] {
  const rest: TimelineItem[] = [
    ...ticket.replies.map(reply => ({ kind: 'reply' as const, at: reply.sentAt, reply })),
    ...ticket.history.map(entry => ({ kind: 'history' as const, at: entry.createdAt, entry })),
  ]
  // Array.prototype.sort is stable, so equal items keep their server order.
  rest.sort((a, b) => {
    const diff = new Date(a.at).getTime() - new Date(b.at).getTime()
    if (diff !== 0) return diff
    return a.kind === b.kind ? 0 : a.kind === 'reply' ? -1 : 1
  })
  return [{ kind: 'message', at: ticket.createdAt, ticket }, ...rest]
}

export function historyText(entry: TicketHistoryEntry, users: AppUser[], t: TFunction): string {
  const value = (v: string | null): string => {
    if (entry.field === 'status') return v ? t(`status.${v as TicketStatus}`) : ''
    if (entry.field === 'priority') return v ? t(`priority.${v as TicketPriority}`) : ''
    if (v === null) return t('thread.unassigned')
    return users.find(u => u.id === v)?.name ?? t('thread.unknownUser')
  }
  const key = entry.field === 'assigneeId' ? 'assignee' : entry.field
  return t(`thread.history.${key}`, {
    user: entry.user?.name ?? t('thread.unknownUser'),
    from: value(entry.oldValue),
    to: value(entry.newValue),
  })
}
