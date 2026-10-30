import { BookOpen, type LucideIcon, Ticket, UserCheck, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/tickets', label: 'Tickety', icon: Ticket, end: true },
  { to: '/tickets/mine', label: 'Moje', icon: UserCheck },
  { to: '/knowledge-base', label: 'Baza wiedzy', icon: BookOpen },
  { to: '/users', label: 'Użytkownicy', icon: Users, adminOnly: true },
]

export function SidebarNav({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.filter(item => isAdmin || !item.adminOnly).map(
        ({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-slate-600 transition-colors hover:bg-accent/60 hover:text-primary',
                isActive && 'bg-accent font-semibold text-primary',
              )
            }
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </NavLink>
        ),
      )}
    </nav>
  )
}
