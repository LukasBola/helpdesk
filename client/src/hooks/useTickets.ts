import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import {
  fetchTicket,
  fetchTicketPage,
  patchTicket,
  postReply,
  type TicketListItem,
  type TicketUpdate,
} from '@/lib/tickets-api'

export function useTicketList(query: Record<string, string>) {
  const result = useInfiniteQuery({
    queryKey: ['tickets', 'list', query],
    queryFn: ({ pageParam }) => fetchTicketPage(query, pageParam),
    initialPageParam: 1,
    getNextPageParam: last => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  })
  // Offset paging repeats a row when a ticket arrives between pages; first occurrence wins.
  const tickets = useMemo(() => {
    const seen = new Set<string>()
    const out: TicketListItem[] = []
    for (const page of result.data?.pages ?? []) {
      for (const t of page.tickets) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          out.push(t)
        }
      }
    }
    return out
  }, [result.data])
  return { ...result, tickets }
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ['tickets', 'detail', id],
    queryFn: () => fetchTicket(id as string),
    enabled: !!id,
  })
}

export function useUpdateTicket(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (update: TicketUpdate) => patchTicket(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  })
}

export function useCreateReply(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => postReply(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  })
}
