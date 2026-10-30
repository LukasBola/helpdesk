import { BookOpen, type LucideIcon, Ticket, UserCheck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'

import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  labelKey: 'nav.tickets' | 'nav.mine' | 'nav.knowledgeBase' | 'nav.users'
  icon: LucideIcon
  end?: boolean
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/tickets', labelKey: 'nav.tickets', icon: Ticket, end: true },
  { to: '/tickets/mine', labelKey: 'nav.mine', icon: UserCheck },
  { to: '/knowledge-base', labelKey: 'nav.knowledgeBase', icon: BookOpen },
  { to: '/users', labelKey: 'nav.users', icon: Users, adminOnly: true },
]

export function SidebarNav({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation()
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.filter(item => isAdmin || !item.adminOnly).map(
        ({ to, labelKey, icon: Icon, end }) => (
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
            {t(labelKey)}
          </NavLink>
        ),
      )}
    </nav>
  )
}
