import { useQuery } from '@tanstack/react-query'

import { fetchUsers } from '@/lib/tickets-api'

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: fetchUsers, staleTime: 5 * 60_000 })
}
