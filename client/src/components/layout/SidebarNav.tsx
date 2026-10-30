import { BookOpen, type LucideIcon, Ticket, UserCheck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'

import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  labelKey: 'nav.tickets' | 'nav.mine' | 'nav.knowledgeBase' | 'nav.users'
  icon: LucideIcon
  end?: boolean
  // /tickets/:id belongs to Tickety (but /tickets/mine does not).
  matchTicketIds?: boolean
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/tickets', labelKey: 'nav.tickets', icon: Ticket, end: true, matchTicketIds: true },
  { to: '/tickets/mine', labelKey: 'nav.mine', icon: UserCheck },
  { to: '/knowledge-base', labelKey: 'nav.knowledgeBase', icon: BookOpen },
  { to: '/users', labelKey: 'nav.users', icon: Users, adminOnly: true },
]

function isActivePath(item: NavItem, pathname: string): boolean {
  if (pathname === item.to) return true
  if (item.matchTicketIds) return pathname.startsWith('/tickets/') && pathname !== '/tickets/mine'
  return !item.end && pathname.startsWith(`${item.to}/`)
}

export function SidebarNav({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.filter(item => isAdmin || !item.adminOnly).map(item => {
        const Icon = item.icon
        const active = isActivePath(item, pathname)
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-slate-600 transition-colors hover:bg-accent/60 hover:text-primary',
              active && 'bg-accent font-semibold text-primary',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {t(item.labelKey)}
          </Link>
        )
      })}
    </nav>
  )
}
