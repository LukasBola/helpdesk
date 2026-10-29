import { LogOut } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLogout } from '@/hooks/useLogout'
import type { SessionUser } from '@/lib/auth-client'

const ROLE_LABELS: Record<SessionUser['role'], string> = {
  ADMIN: 'administrator',
  AGENT: 'agent',
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join('')
}

export function UserMenu({ user }: { user: SessionUser }) {
  const logout = useLogout()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu użytkownika"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-300 to-teal-300 text-sm font-semibold text-indigo-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {initials(user.name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-xl">
        <DropdownMenuLabel>
          <div className="truncate font-semibold">{user.name}</div>
          <div className="text-xs font-normal text-muted-foreground">{ROLE_LABELS[user.role]}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11 cursor-pointer text-rose-600 focus:bg-rose-50 focus:text-rose-600"
          onSelect={() => void logout()}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden />
          Wyloguj
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
